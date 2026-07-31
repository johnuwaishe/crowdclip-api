import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { MediaDownloadConfig } from '../media/media-download.config';
import { normalizeSupportedMediaType } from '../media/media-file-type';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { MediaAssetsRepository } from './media-assets.repository';
import { OriginalFileRequestsRepository } from './original-file-requests.repository';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';
import { MediaAssetRow } from './types/media-asset-row.type';
import { OriginalFileRequestRow } from './types/original-file-request-row.type';

const ORIGINAL_FILE_UPLOAD_STALE_AFTER_MS = 5 * 60 * 1_000;
const MAX_ERROR_MESSAGE_LENGTH = 2_000;

export interface OriginalFileMultipartUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface OriginalFileUploadResult {
  requestId: string;
  clipId: string;
  status: 'fulfilled';
  mediaAsset: {
    id: string;
    type: 'fan_original';
    mimeType: string;
    byteSize: number;
    storedAt: Date;
  };
}

@Injectable()
export class OriginalFileUploadsService {
  private readonly logger = new Logger(OriginalFileUploadsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly mediaConfig: MediaDownloadConfig,
    private readonly storage: SupabaseObjectStorage,
    private readonly tokenService: OriginalFileUploadTokenService,
    private readonly requestsRepository: OriginalFileRequestsRepository,
    private readonly mediaAssetsRepository: MediaAssetsRepository,
  ) {}

  async upload(
    rawToken: string,
    file: OriginalFileMultipartUpload | undefined,
  ): Promise<OriginalFileUploadResult> {
    const token = this.tokenService.verify(rawToken);

    if (!token) {
      throw new NotFoundException('Original-file upload request not found');
    }

    if (token.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Original-file upload link has expired');
    }

    const mediaType = this.validateFile(file);
    const staleBefore = new Date(
      Date.now() - ORIGINAL_FILE_UPLOAD_STALE_AFTER_MS,
    );
    const uploadLeaseId = randomUUID();
    const claimedRequest = await this.requestsRepository.claimForUpload({
      requestId: token.requestId,
      uploadTokenHash: token.tokenHash,
      uploadLeaseId,
      staleBefore,
    });

    if (!claimedRequest) {
      return this.resolveUnclaimedRequest(token.requestId, token.tokenHash);
    }

    if (!file) {
      throw new Error('Validated upload file is missing');
    }

    const storagePath = `${claimedRequest.clip_id}/original/${claimedRequest.id}.${mediaType.extension}`;
    const claimedUploadLeaseId = claimedRequest.upload_lease_id;

    try {
      if (!claimedUploadLeaseId) {
        throw new Error('Claimed upload lease is missing its owner');
      }

      await this.storage.upload({
        bucket: this.mediaConfig.storageBucket,
        path: storagePath,
        data: file.buffer,
        contentType: mediaType.mimeType,
      });

      const result = await this.completeUpload(
        claimedRequest,
        claimedUploadLeaseId,
        storagePath,
        mediaType.mimeType,
        file.buffer.byteLength,
      );

      this.logger.log(
        `Stored fan-original media asset ${result.mediaAsset.id} for clip ${result.clipId}`,
      );

      return result;
    } catch (error) {
      await this.releaseAfterFailure(
        claimedRequest.id,
        claimedUploadLeaseId ?? uploadLeaseId,
        error,
      );

      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Original file could not be stored',
        { cause: error },
      );
    }
  }

  private validateFile(file: OriginalFileMultipartUpload | undefined): {
    mimeType: string;
    extension: string;
  } {
    if (!file || file.buffer.byteLength === 0 || file.size === 0) {
      throw new BadRequestException(
        'A non-empty image or video file is required',
      );
    }

    if (
      file.buffer.byteLength !== file.size ||
      file.size > this.mediaConfig.maxBytes
    ) {
      throw new BadRequestException(
        `File must not exceed ${this.mediaConfig.maxBytes} bytes`,
      );
    }

    const mediaType = normalizeSupportedMediaType(file.mimetype);

    if (!mediaType) {
      throw new BadRequestException('File type is not supported');
    }

    return mediaType;
  }

  private async resolveUnclaimedRequest(
    requestId: string,
    tokenHash: string,
  ): Promise<OriginalFileUploadResult> {
    const request = await this.requestsRepository.findById(requestId);

    if (
      !request ||
      !this.tokenService.matchesHash(tokenHash, request.upload_token_hash)
    ) {
      throw new NotFoundException('Original-file upload request not found');
    }

    if (request.expires_at.getTime() <= Date.now()) {
      throw new GoneException('Original-file upload link has expired');
    }

    if (request.status === 'fulfilled') {
      const asset = await this.mediaAssetsRepository.findStoredByClipAndType(
        request.clip_id,
        'fan_original',
      );

      if (!asset) {
        throw new InternalServerErrorException(
          'Fulfilled request is missing its fan-original media asset',
        );
      }

      return this.createResult(request, asset);
    }

    throw new ConflictException(
      'Original-file upload request is already being processed',
    );
  }

  private completeUpload(
    claimedRequest: OriginalFileRequestRow,
    uploadLeaseId: string,
    storagePath: string,
    mimeType: string,
    byteSize: number,
  ): Promise<OriginalFileUploadResult> {
    return this.databaseService.withTransaction(async (transaction) => {
      const request = await this.requestsRepository.findByIdForUpdate(
        claimedRequest.id,
        transaction,
      );

      if (
        !request ||
        request.status !== 'uploading' ||
        request.upload_lease_id !== uploadLeaseId
      ) {
        throw new ConflictException(
          'Original-file upload lease is no longer active',
        );
      }

      const asset = await this.mediaAssetsRepository.createStoredFanOriginal(
        {
          clipId: request.clip_id,
          storageBucket: this.mediaConfig.storageBucket,
          storagePath,
          mimeType,
          byteSize,
        },
        transaction,
      );
      const fulfilledRequest = await this.requestsRepository.markFulfilled(
        request.id,
        uploadLeaseId,
        transaction,
      );

      if (!fulfilledRequest) {
        throw new Error('Original-file request could not be marked fulfilled');
      }

      return this.createResult(fulfilledRequest, asset);
    });
  }

  private createResult(
    request: OriginalFileRequestRow,
    asset: MediaAssetRow,
  ): OriginalFileUploadResult {
    if (
      request.status !== 'fulfilled' ||
      asset.asset_type !== 'fan_original' ||
      asset.status !== 'stored' ||
      !asset.mime_type ||
      asset.byte_size === null ||
      !asset.stored_at
    ) {
      throw new Error('Original-file upload result is incomplete');
    }

    const byteSize = Number(asset.byte_size);

    if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
      throw new Error('Original-file upload byte size is invalid');
    }

    return {
      requestId: request.id,
      clipId: request.clip_id,
      status: 'fulfilled',
      mediaAsset: {
        id: asset.id,
        type: 'fan_original',
        mimeType: asset.mime_type,
        byteSize,
        storedAt: asset.stored_at,
      },
    };
  }

  private async releaseAfterFailure(
    requestId: string,
    uploadLeaseId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage = (
      error instanceof Error
        ? error.message
        : 'Unknown original-file upload error'
    ).slice(0, MAX_ERROR_MESSAGE_LENGTH);

    try {
      const releasedRequest =
        await this.requestsRepository.releaseUploadAfterFailure(
          requestId,
          uploadLeaseId,
          errorMessage,
        );

      if (!releasedRequest) {
        this.logger.warn(
          `Original-file upload request ${requestId} was not released because its state changed`,
        );
      }
    } catch (releaseError) {
      this.logger.error(
        `Failed to release original-file upload request ${requestId}`,
        releaseError instanceof Error
          ? releaseError.stack
          : String(releaseError),
      );
    }
  }
}
