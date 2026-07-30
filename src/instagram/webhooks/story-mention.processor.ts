import { Injectable, Logger } from '@nestjs/common';
import { ClipsRepository } from '../../clips/clips.repository';
import { MediaAssetsRepository } from '../../clips/media-assets.repository';
import { DatabaseService } from '../../database/database.service';
import { FansRepository } from '../../fans/fans.repository';
import {
  InvalidInstagramStoryMentionError,
  normalizeInstagramStoryMention,
} from './instagram-story-mention.parser';
import { WebhookEventsRepository } from './webhook-events.repository';

const MAX_ERROR_MESSAGE_LENGTH = 2_000;

export type StoryMentionProcessingResult =
  | { status: 'idle' }
  | {
      status: 'processed';
      eventId: string;
      clipId: string;
      mediaAssetId: string;
    }
  | {
      status: 'retrying' | 'failed';
      eventId: string;
      error: string;
    };

@Injectable()
export class StoryMentionProcessor {
  private readonly logger = new Logger(StoryMentionProcessor.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly webhookEventsRepository: WebhookEventsRepository,
    private readonly fansRepository: FansRepository,
    private readonly clipsRepository: ClipsRepository,
    private readonly mediaAssetsRepository: MediaAssetsRepository,
  ) {}

  async processNext(
    maxAttempts = 3,
    retryDelayMs = 60_000,
  ): Promise<StoryMentionProcessingResult> {
    const event =
      await this.webhookEventsRepository.claimNextPendingByType(
        'story_mention',
      );

    if (!event) {
      return { status: 'idle' };
    }

    try {
      const storyMention = normalizeInstagramStoryMention(event.payload);

      const result = await this.databaseService.withTransaction(
        async (transaction) => {
          const fan = await this.fansRepository.findOrCreate(
            {
              instagramScopedUserId: event.sender_id,
            },
            transaction,
          );

          const clip = await this.clipsRepository.findOrCreate(
            {
              fanId: fan.id,
              sourceWebhookEventId: event.id,
              mentionedAt: event.occurred_at,
            },
            transaction,
          );

          const mediaAsset = await this.mediaAssetsRepository.findOrCreate(
            {
              clipId: clip.id,
              assetType: 'instagram_story',
              sourceUrl: storyMention.sourceUrl,
            },
            transaction,
          );

          const processedEvent =
            await this.webhookEventsRepository.markProcessed(
              event.id,
              transaction,
            );

          if (!processedEvent) {
            throw new Error(
              'Webhook event could not be marked processed from its current state',
            );
          }

          return {
            clipId: clip.id,
            mediaAssetId: mediaAsset.id,
          };
        },
      );

      this.logger.log(`Processed story mention event ${event.id}`);

      return {
        status: 'processed',
        eventId: event.id,
        clipId: result.clipId,
        mediaAssetId: result.mediaAssetId,
      };
    } catch (error) {
      const errorMessage = this.toErrorMessage(error);

      this.logger.error(
        `Failed to process story mention event ${event.id}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      const releasedEvent =
        error instanceof InvalidInstagramStoryMentionError
          ? await this.webhookEventsRepository.markFailed(
              event.id,
              errorMessage,
            )
          : await this.webhookEventsRepository.releaseAfterFailure(
              event.id,
              errorMessage,
              maxAttempts,
              new Date(Date.now() + retryDelayMs),
            );

      if (!releasedEvent) {
        throw new Error(
          'Webhook event could not be released after a processing failure',
          { cause: error },
        );
      }

      return {
        status: releasedEvent.status === 'failed' ? 'failed' : 'retrying',
        eventId: event.id,
        error: errorMessage,
      };
    }
  }

  private toErrorMessage(error: unknown): string {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown story mention processing error';

    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
}
