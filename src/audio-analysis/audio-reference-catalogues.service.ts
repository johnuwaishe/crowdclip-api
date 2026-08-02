import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { normalizeSupportedAudioType } from '../media/media-file-type';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioReferenceCataloguesRepository } from './audio-reference-catalogues.repository';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';
import { AudioReferenceCatalogueRow } from './types/audio-reference-catalogue-row.type';
import { AudioReferenceTrackRow } from './types/audio-reference-track-row.type';

const MAX_ERROR_MESSAGE_LENGTH = 2_000;

export interface ReferenceTrackMultipartUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface CreateAudioReferenceCatalogueRequest {
  instagramRecipientId?: unknown;
  name?: unknown;
}

export interface UploadAudioReferenceTrackRequest {
  title?: unknown;
  artistName?: unknown;
}

export interface AudioReferenceCatalogueView {
  id: string;
  instagramRecipientId: string;
  name: string;
  status: string;
  tracks: AudioReferenceTrackView[];
}

export interface AudioReferenceTrackView {
  id: string;
  title: string;
  artistName: string | null;
  status: string;
  mimeType: string | null;
  byteSize: number | null;
  uploadedAt: Date | null;
  error: string | null;
}

@Injectable()
export class AudioReferenceCataloguesService {
  private readonly logger = new Logger(AudioReferenceCataloguesService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly analysisConfig: AudioAnalysisConfig,
    private readonly storage: SupabaseObjectStorage,
    private readonly cataloguesRepository: AudioReferenceCataloguesRepository,
    private readonly analysesRepository: ClipAudioAnalysesRepository,
  ) {}

  async create(
    request: CreateAudioReferenceCatalogueRequest,
  ): Promise<AudioReferenceCatalogueView> {
    const instagramRecipientId = this.requiredText(
      request.instagramRecipientId,
      'instagramRecipientId',
      500,
    );
    const name = this.requiredText(request.name, 'name', 200);
    const catalogue = await this.cataloguesRepository.createActive({
      instagramRecipientId,
      name,
    });
    return this.toCatalogueView(catalogue, []);
  }

  async get(catalogueId: string): Promise<AudioReferenceCatalogueView> {
    const catalogue = await this.cataloguesRepository.findById(catalogueId);
    if (!catalogue) {
      throw new NotFoundException('Audio reference catalogue not found');
    }
    const tracks = await this.cataloguesRepository.listTracks(catalogue.id);
    return this.toCatalogueView(catalogue, tracks);
  }

  async uploadTrack(
    catalogueId: string,
    request: UploadAudioReferenceTrackRequest,
    file: ReferenceTrackMultipartUpload | undefined,
  ): Promise<AudioReferenceTrackView> {
    const title = this.requiredText(request.title, 'title', 300);
    const artistName = this.optionalText(request.artistName, 'artistName', 300);
    const mediaType = this.validateFile(file);
    if (!file) {
      throw new Error('Validated reference-track upload file is missing');
    }

    const track = await this.cataloguesRepository.createUploadingTrack({
      catalogueId,
      title,
      artistName,
    });
    if (!track) {
      throw new NotFoundException('Active audio reference catalogue not found');
    }
    const storagePath = `${catalogueId}/references/${track.id}.${mediaType.extension}`;

    try {
      await this.storage.upload({
        bucket: this.analysisConfig.referenceStorageBucket,
        path: storagePath,
        data: file.buffer,
        contentType: mediaType.mimeType,
      });

      const completed = await this.databaseService.withTransaction(
        async (transaction) => {
          const readyTrack = await this.cataloguesRepository.markTrackReady(
            {
              id: track.id,
              storageBucket: this.analysisConfig.referenceStorageBucket,
              storagePath,
              mimeType: mediaType.mimeType,
              byteSize: file.buffer.byteLength,
            },
            transaction,
          );
          if (!readyTrack) {
            throw new Error(
              'Reference track could not be marked ready from its current state',
            );
          }
          const enqueued =
            await this.analysesRepository.enqueueStoredClipsForCatalogue(
              catalogueId,
              transaction,
            );
          return { readyTrack, enqueued };
        },
      );

      this.logger.log(
        `Stored reference track ${track.id} and queued ${completed.enqueued} existing clips`,
      );
      return this.toTrackView(completed.readyTrack);
    } catch (error) {
      const errorMessage = this.errorMessage(error);
      try {
        await this.cataloguesRepository.markTrackFailed(track.id, errorMessage);
      } catch (markFailedError) {
        this.logger.error(
          `Failed to mark reference track ${track.id} as failed`,
          markFailedError instanceof Error
            ? markFailedError.stack
            : String(markFailedError),
        );
      }
      throw new ServiceUnavailableException(
        'Reference track could not be stored',
        { cause: error },
      );
    }
  }

  private validateFile(file: ReferenceTrackMultipartUpload | undefined): {
    mimeType: string;
    extension: string;
  } {
    if (!file || file.buffer.byteLength === 0 || file.size === 0) {
      throw new BadRequestException('A non-empty audio file is required');
    }
    if (
      file.buffer.byteLength !== file.size ||
      file.size > this.analysisConfig.maximumReferenceBytes
    ) {
      throw new BadRequestException(
        `Reference audio must not exceed ${this.analysisConfig.maximumReferenceBytes} bytes`,
      );
    }
    const mediaType = normalizeSupportedAudioType(file.mimetype);
    if (!mediaType) {
      throw new BadRequestException('Reference audio type is not supported');
    }
    return mediaType;
  }

  private requiredText(value: unknown, name: string, maximum: number): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${name} is required`);
    }
    const result = value.trim();
    if (result.length > maximum) {
      throw new BadRequestException(
        `${name} must not exceed ${maximum} characters`,
      );
    }
    return result;
  }

  private optionalText(
    value: unknown,
    name: string,
    maximum: number,
  ): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.requiredText(value, name, maximum);
  }

  private errorMessage(error: unknown): string {
    return (
      error instanceof Error ? error.message : 'Unknown reference upload error'
    ).slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }

  private toCatalogueView(
    catalogue: AudioReferenceCatalogueRow,
    tracks: AudioReferenceTrackRow[],
  ): AudioReferenceCatalogueView {
    return {
      id: catalogue.id,
      instagramRecipientId: catalogue.instagram_recipient_id,
      name: catalogue.name,
      status: catalogue.status,
      tracks: tracks.map((track) => this.toTrackView(track)),
    };
  }

  private toTrackView(track: AudioReferenceTrackRow): AudioReferenceTrackView {
    const byteSize = track.byte_size === null ? null : Number(track.byte_size);
    return {
      id: track.id,
      title: track.title,
      artistName: track.artist_name,
      status: track.status,
      mimeType: track.mime_type,
      byteSize,
      uploadedAt: track.uploaded_at,
      error: track.last_error,
    };
  }
}
