import { Injectable, Logger } from '@nestjs/common';
import { ClipAudioAnalysesRepository } from '../audio-analysis/clip-audio-analyses.repository';
import { MediaAssetsRepository } from '../clips/media-assets.repository';
import { DatabaseService } from '../database/database.service';
import { MediaDownloadConfig } from './media-download.config';
import { RemoteMediaDownloader } from './remote-media-downloader.service';
import { SupabaseObjectStorage } from './supabase-object-storage.service';

const MAX_ERROR_MESSAGE_LENGTH = 2_000;

export type MediaDownloadProcessingResult =
  | { status: 'idle' }
  | {
      status: 'stored';
      mediaAssetId: string;
      storagePath: string;
    }
  | {
      status: 'retrying' | 'failed';
      mediaAssetId: string;
      error: string;
    };

@Injectable()
export class MediaDownloadProcessor {
  private readonly logger = new Logger(MediaDownloadProcessor.name);

  constructor(
    private readonly config: MediaDownloadConfig,
    private readonly databaseService: DatabaseService,
    private readonly mediaAssetsRepository: MediaAssetsRepository,
    private readonly analysesRepository: ClipAudioAnalysesRepository,
    private readonly downloader: RemoteMediaDownloader,
    private readonly objectStorage: SupabaseObjectStorage,
  ) {}

  async processNext(): Promise<MediaDownloadProcessingResult> {
    const mediaAsset =
      await this.mediaAssetsRepository.claimNextPendingInstagramStory();

    if (!mediaAsset) {
      return { status: 'idle' };
    }

    try {
      if (!mediaAsset.source_url) {
        throw new Error('Instagram story asset does not have a source URL');
      }

      const downloaded = await this.downloader.download(mediaAsset.source_url);
      const storagePath = `${mediaAsset.clip_id}/instagram/${mediaAsset.id}.${downloaded.extension}`;

      await this.objectStorage.upload({
        bucket: this.config.storageBucket,
        path: storagePath,
        data: downloaded.data,
        contentType: downloaded.mimeType,
      });

      const storedAsset = await this.databaseService.withTransaction(
        async (transaction) => {
          const stored = await this.mediaAssetsRepository.markStored(
            {
              id: mediaAsset.id,
              storageBucket: this.config.storageBucket,
              storagePath,
              mimeType: downloaded.mimeType,
              byteSize: downloaded.byteSize,
            },
            transaction,
          );

          if (stored) {
            await this.analysesRepository.enqueueForStoredMediaAsset(
              stored.id,
              transaction,
            );
          }

          return stored;
        },
      );

      if (!storedAsset) {
        throw new Error(
          'Media asset could not be marked stored from its current state',
        );
      }

      this.logger.log(`Stored Instagram media asset ${mediaAsset.id}`);

      return {
        status: 'stored',
        mediaAssetId: mediaAsset.id,
        storagePath,
      };
    } catch (error) {
      const errorMessage = this.toErrorMessage(error);
      const nextAttemptAt = new Date(Date.now() + this.config.retryDelayMs);

      this.logger.error(
        `Failed to store Instagram media asset ${mediaAsset.id}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      const releasedAsset =
        await this.mediaAssetsRepository.releaseAfterFailure(
          mediaAsset.id,
          errorMessage,
          this.config.maxAttempts,
          nextAttemptAt,
        );

      if (!releasedAsset) {
        throw new Error(
          'Media asset could not be released after a download failure',
          { cause: error },
        );
      }

      return {
        status: releasedAsset.status === 'failed' ? 'failed' : 'retrying',
        mediaAssetId: mediaAsset.id,
        error: errorMessage,
      };
    }
  }

  private toErrorMessage(error: unknown): string {
    const message =
      error instanceof Error ? error.message : 'Unknown media download error';

    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
}
