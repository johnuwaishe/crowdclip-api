import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { MediaDownloadConfig } from '../media/media-download.config';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { ClipsRepository } from './clips.repository';
import { MediaAssetsRepository } from './media-assets.repository';
import { OriginalFileRequestsRepository } from './original-file-requests.repository';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';
import {
  ArtistClipMediaChoice,
  ClipDecisionResult,
} from './types/clip-decision.type';
import { ClipReviewRow } from './types/clip-review-row.type';
import { ClipRow } from './types/clip-row.type';
import { ClipReview, ClipReviewMediaAsset } from './types/clip-review.type';
import { OriginalFileRequestRow } from './types/original-file-request-row.type';

interface PreviewTarget {
  bucket: string;
  path: string;
}

const PREVIEW_SIGNING_CONCURRENCY = 10;
const ORIGINAL_FILE_REQUEST_TTL_SECONDS = 7 * 24 * 60 * 60;
const ORIGINAL_FILE_UPLOAD_PATH = '/uploads/original';

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);

  constructor(
    private readonly clipsRepository: ClipsRepository,
    private readonly storage: SupabaseObjectStorage,
    private readonly mediaConfig: MediaDownloadConfig,
    private readonly databaseService: DatabaseService,
    private readonly mediaAssetsRepository: MediaAssetsRepository,
    private readonly originalFileRequestsRepository: OriginalFileRequestsRepository,
    private readonly uploadTokenService: OriginalFileUploadTokenService,
  ) {}

  async decideMediaChoice(
    clipId: string,
    mediaChoice: ArtistClipMediaChoice,
    workspaceId?: string,
  ): Promise<ClipDecisionResult> {
    const result = await this.databaseService.withTransaction(
      async (transaction) => {
        const clip = await this.clipsRepository.findByIdForUpdate(
          clipId,
          transaction,
          workspaceId,
        );

        if (!clip) {
          throw new NotFoundException('Clip not found');
        }

        if (clip.media_choice !== 'undecided') {
          return this.handleExistingDecision(clip, mediaChoice, transaction);
        }

        if (mediaChoice === 'use_instagram_story') {
          return this.chooseInstagramStory(clip, transaction);
        }

        return this.requestFanOriginal(clip, transaction);
      },
    );

    this.logger.log(
      `Clip media choice resolved: clipId=${result.clipId} mediaChoice=${result.mediaChoice}`,
    );

    return result;
  }

  async listRecentForReview(
    limit: number,
    workspaceId: string,
  ): Promise<ClipReview[]> {
    const rows = await this.clipsRepository.listRecentForReview(
      limit,
      workspaceId,
    );
    const clipsById = new Map<string, ClipReview>();
    const previewTargets = new Map<string, PreviewTarget>();

    for (const row of rows) {
      let clip = clipsById.get(row.clip_id);

      if (!clip) {
        clip = this.createClipReview(row);
        clipsById.set(row.clip_id, clip);
      }

      const asset = this.createMediaAsset(row);

      if (!asset) {
        continue;
      }

      clip.mediaAssets.push(asset);

      if (asset.status === 'stored' && row.storage_bucket && row.storage_path) {
        previewTargets.set(asset.id, {
          bucket: row.storage_bucket,
          path: row.storage_path,
        });
      }
    }

    const clips = [...clipsById.values()];
    const expiresAt = new Date(
      Date.now() + this.mediaConfig.previewUrlTtlSeconds * 1_000,
    );

    try {
      await this.signPreviews(clips, previewTargets, expiresAt);
    } catch (error) {
      this.logger.error(
        'Failed to create one or more clip preview URLs',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Clip previews are temporarily unavailable',
        { cause: error },
      );
    }

    return clips;
  }

  private async handleExistingDecision(
    clip: ClipRow,
    requestedChoice: ArtistClipMediaChoice,
    transaction: DatabaseExecutor,
  ): Promise<ClipDecisionResult> {
    if (clip.media_choice !== requestedChoice) {
      throw new ConflictException(
        `Clip has already been set to ${clip.media_choice}`,
      );
    }

    if (requestedChoice === 'use_instagram_story') {
      return this.createDecisionResult(clip, null, null);
    }

    const request = await this.originalFileRequestsRepository.findByClipId(
      clip.id,
      transaction,
    );

    if (!request) {
      throw new InternalServerErrorException(
        'Clip decision is missing its original file request',
      );
    }

    const uploadPath = this.recreateUploadPath(request);

    return this.createDecisionResult(clip, request, uploadPath);
  }

  private async chooseInstagramStory(
    clip: ClipRow,
    transaction: DatabaseExecutor,
  ): Promise<ClipDecisionResult> {
    const storedAsset =
      await this.mediaAssetsRepository.findStoredByClipAndType(
        clip.id,
        'instagram_story',
        transaction,
      );

    if (!storedAsset) {
      throw new ConflictException(
        'A stored Instagram story is required before choosing it',
      );
    }

    const updatedClip = await this.clipsRepository.updateMediaChoice(
      clip.id,
      'use_instagram_story',
      transaction,
    );

    return this.createDecisionResult(updatedClip, null, null);
  }

  private async requestFanOriginal(
    clip: ClipRow,
    transaction: DatabaseExecutor,
  ): Promise<ClipDecisionResult> {
    const token = this.uploadTokenService.issue(
      ORIGINAL_FILE_REQUEST_TTL_SECONDS,
    );
    const updatedClip = await this.clipsRepository.updateMediaChoice(
      clip.id,
      'request_fan_original',
      transaction,
    );
    const request = await this.originalFileRequestsRepository.create(
      {
        id: token.requestId,
        clipId: clip.id,
        uploadTokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
      },
      transaction,
    );
    // TODO: Send the upload link to the fan through the Instagram Messaging
    // API once the required Meta permissions and Pro delivery flow are ready.
    const uploadPath = this.createUploadPath(token.rawToken);

    return this.createDecisionResult(updatedClip, request, uploadPath);
  }

  private recreateUploadPath(request: OriginalFileRequestRow): string | null {
    if (
      request.expires_at.getTime() <= Date.now() ||
      request.status === 'expired' ||
      request.status === 'cancelled' ||
      request.status === 'fulfilled'
    ) {
      return null;
    }

    const token = this.uploadTokenService.recreate(
      request.id,
      request.expires_at,
    );

    if (token.tokenHash !== request.upload_token_hash) {
      this.logger.warn(
        `Original-file request ${request.id} uses a legacy non-reproducible upload token`,
      );

      return null;
    }

    return this.createUploadPath(token.rawToken);
  }

  private createUploadPath(rawToken: string): string {
    return `${ORIGINAL_FILE_UPLOAD_PATH}/${encodeURIComponent(rawToken)}`;
  }

  private createDecisionResult(
    clip: ClipRow,
    request: OriginalFileRequestRow | null,
    uploadPath: string | null,
  ): ClipDecisionResult {
    if (clip.media_choice === 'undecided') {
      throw new Error(
        'Cannot create a decision response for an undecided clip',
      );
    }

    return {
      clipId: clip.id,
      mediaChoice: clip.media_choice,
      updatedAt: clip.updated_at,
      originalFileRequest: request
        ? {
            id: request.id,
            status: request.status,
            expiresAt: request.expires_at,
            uploadPath,
          }
        : null,
    };
  }

  private async signPreviews(
    clips: ClipReview[],
    previewTargets: Map<string, PreviewTarget>,
    expiresAt: Date,
  ): Promise<void> {
    const signableAssets = clips
      .flatMap((clip) => clip.mediaAssets)
      .filter((asset) => previewTargets.has(asset.id));

    for (
      let offset = 0;
      offset < signableAssets.length;
      offset += PREVIEW_SIGNING_CONCURRENCY
    ) {
      const batch = signableAssets.slice(
        offset,
        offset + PREVIEW_SIGNING_CONCURRENCY,
      );

      await Promise.all(
        batch.map(async (asset) => {
          const target = previewTargets.get(asset.id);

          if (!target) {
            return;
          }

          asset.previewUrl = await this.storage.createSignedUrl({
            bucket: target.bucket,
            path: target.path,
            expiresInSeconds: this.mediaConfig.previewUrlTtlSeconds,
          });
          asset.previewUrlExpiresAt = expiresAt;
        }),
      );
    }
  }

  private createClipReview(row: ClipReviewRow): ClipReview {
    return {
      id: row.clip_id,
      mediaChoice: row.media_choice,
      mentionedAt: row.mentioned_at,
      createdAt: row.clip_created_at,
      fan: {
        id: row.fan_id,
        instagramScopedUserId: row.instagram_scoped_user_id,
      },
      mediaAssets: [],
    };
  }

  private createMediaAsset(row: ClipReviewRow): ClipReviewMediaAsset | null {
    if (
      !row.asset_id ||
      !row.asset_type ||
      !row.asset_status ||
      !row.asset_created_at
    ) {
      return null;
    }

    return {
      id: row.asset_id,
      type: row.asset_type,
      status: row.asset_status,
      mimeType: row.mime_type,
      byteSize: row.byte_size === null ? null : Number(row.byte_size),
      storedAt: row.asset_stored_at,
      createdAt: row.asset_created_at,
      previewUrl: null,
      previewUrlExpiresAt: null,
    };
  }
}
