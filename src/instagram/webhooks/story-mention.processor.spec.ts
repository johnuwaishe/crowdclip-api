import { Logger } from '@nestjs/common';
import { ClipsRepository } from '../../clips/clips.repository';
import { MediaAssetsRepository } from '../../clips/media-assets.repository';
import { ClipRow } from '../../clips/types/clip-row.type';
import { MediaAssetRow } from '../../clips/types/media-asset-row.type';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../../database/database.service';
import { FansRepository } from '../../fans/fans.repository';
import { FanRow } from '../../fans/types/fan-row.type';
import { StoryMentionProcessor } from './story-mention.processor';
import { WebhookEventRow } from './types/webhook-event-row.type';
import { WebhookEventsRepository } from './webhook-events.repository';

describe('StoryMentionProcessor', () => {
  const now = new Date('2026-07-29T17:00:00.000Z');
  const transaction = {
    query: jest.fn(),
  } as unknown as DatabaseExecutor;

  let transactionError: Error | null;

  const databaseService = {
    async withTransaction<T>(
      callback: (executor: DatabaseExecutor) => Promise<T>,
    ): Promise<T> {
      if (transactionError) {
        throw transactionError;
      }

      return callback(transaction);
    },
  } as DatabaseService;

  const webhookEventsRepository = {
    claimNextPendingByType: jest.fn(),
    markProcessed: jest.fn(),
    markFailed: jest.fn(),
  };
  const fansRepository = {
    findOrCreate: jest.fn(),
  };
  const clipsRepository = {
    findOrCreate: jest.fn(),
  };
  const mediaAssetsRepository = {
    findOrCreate: jest.fn(),
  };

  const event: WebhookEventRow = {
    id: 'event-id',
    external_event_id: 'instagram-message-id',
    event_type: 'story_mention',
    sender_id: 'instagram-fan-id',
    recipient_id: 'instagram-artist-id',
    payload: {
      message: {
        attachments: [
          {
            type: 'story_mention',
            payload: {
              url: 'https://cdn.example.test/story.mp4',
            },
          },
        ],
      },
    },
    status: 'processing',
    attempt_count: 1,
    last_error: null,
    occurred_at: now,
    received_at: now,
    processing_started_at: now,
    processed_at: null,
    created_at: now,
    updated_at: now,
  };

  const fan: FanRow = {
    id: 'fan-id',
    instagram_scoped_user_id: 'instagram-fan-id',
    created_at: now,
    updated_at: now,
  };

  const clip: ClipRow = {
    id: 'clip-id',
    fan_id: fan.id,
    source_webhook_event_id: event.id,
    media_choice: 'undecided',
    mentioned_at: now,
    created_at: now,
    updated_at: now,
  };

  const mediaAsset: MediaAssetRow = {
    id: 'media-asset-id',
    clip_id: clip.id,
    asset_type: 'instagram_story',
    status: 'pending',
    source_url: 'https://cdn.example.test/story.mp4',
    storage_bucket: null,
    storage_path: null,
    mime_type: null,
    byte_size: null,
    attempt_count: 0,
    last_error: null,
    download_started_at: null,
    stored_at: null,
    created_at: now,
    updated_at: now,
  };

  let processor: StoryMentionProcessor;
  let loggerError: jest.SpyInstance;
  let loggerLog: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    transactionError = null;
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    processor = new StoryMentionProcessor(
      databaseService,
      webhookEventsRepository as unknown as WebhookEventsRepository,
      fansRepository as unknown as FansRepository,
      clipsRepository as unknown as ClipsRepository,
      mediaAssetsRepository as unknown as MediaAssetsRepository,
    );
  });

  afterEach(() => {
    loggerError.mockRestore();
    loggerLog.mockRestore();
  });

  it('returns idle when no story mention is pending', async () => {
    webhookEventsRepository.claimNextPendingByType.mockResolvedValueOnce(null);

    await expect(processor.processNext()).resolves.toEqual({ status: 'idle' });

    expect(fansRepository.findOrCreate).not.toHaveBeenCalled();
  });

  it('creates the fan, clip, and Instagram asset in one transaction', async () => {
    webhookEventsRepository.claimNextPendingByType.mockResolvedValueOnce(event);
    fansRepository.findOrCreate.mockResolvedValueOnce(fan);
    clipsRepository.findOrCreate.mockResolvedValueOnce(clip);
    mediaAssetsRepository.findOrCreate.mockResolvedValueOnce(mediaAsset);
    webhookEventsRepository.markProcessed.mockResolvedValueOnce({
      ...event,
      status: 'processed',
      processed_at: now,
    });

    await expect(processor.processNext()).resolves.toEqual({
      status: 'processed',
      eventId: event.id,
      clipId: clip.id,
      mediaAssetId: mediaAsset.id,
    });

    expect(fansRepository.findOrCreate).toHaveBeenCalledWith(
      { instagramScopedUserId: event.sender_id },
      transaction,
    );
    expect(clipsRepository.findOrCreate).toHaveBeenCalledWith(
      {
        fanId: fan.id,
        sourceWebhookEventId: event.id,
        mentionedAt: event.occurred_at,
      },
      transaction,
    );
    expect(mediaAssetsRepository.findOrCreate).toHaveBeenCalledWith(
      {
        clipId: clip.id,
        assetType: 'instagram_story',
        sourceUrl: 'https://cdn.example.test/story.mp4',
      },
      transaction,
    );
    expect(webhookEventsRepository.markProcessed).toHaveBeenCalledWith(
      event.id,
      transaction,
    );
  });

  it('marks an event failed when its payload has no media URL', async () => {
    const invalidEvent: WebhookEventRow = {
      ...event,
      payload: {},
    };

    webhookEventsRepository.claimNextPendingByType.mockResolvedValueOnce(
      invalidEvent,
    );
    webhookEventsRepository.markFailed.mockResolvedValueOnce({
      ...invalidEvent,
      status: 'failed',
    });

    await expect(processor.processNext()).resolves.toEqual({
      status: 'failed',
      eventId: event.id,
      error: 'Story mention event does not contain attachments',
    });

    expect(fansRepository.findOrCreate).not.toHaveBeenCalled();
    expect(webhookEventsRepository.markFailed).toHaveBeenCalledWith(
      event.id,
      'Story mention event does not contain attachments',
    );
  });

  it('marks an event failed when transactional work fails', async () => {
    transactionError = new Error('Database transaction failed');
    webhookEventsRepository.claimNextPendingByType.mockResolvedValueOnce(event);
    webhookEventsRepository.markFailed.mockResolvedValueOnce({
      ...event,
      status: 'failed',
    });

    await expect(processor.processNext()).resolves.toEqual({
      status: 'failed',
      eventId: event.id,
      error: 'Database transaction failed',
    });

    expect(webhookEventsRepository.markFailed).toHaveBeenCalledWith(
      event.id,
      'Database transaction failed',
    );
  });

  it('fails loudly if the claimed event cannot transition to failed', async () => {
    webhookEventsRepository.claimNextPendingByType.mockResolvedValueOnce({
      ...event,
      payload: {},
    });
    webhookEventsRepository.markFailed.mockResolvedValueOnce(null);

    await expect(processor.processNext()).rejects.toThrow(
      'Webhook event could not be marked failed from its current state',
    );
  });
});
