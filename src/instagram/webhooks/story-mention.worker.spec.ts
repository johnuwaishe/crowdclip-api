import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoryMentionProcessor } from './story-mention.processor';
import { WebhookEventRow } from './types/webhook-event-row.type';
import { WebhookEventsRepository } from './webhook-events.repository';
import { StoryMentionWorker } from './story-mention.worker';

describe('StoryMentionWorker', () => {
  const now = new Date('2026-07-29T17:00:00.000Z');
  const baseEvent: WebhookEventRow = {
    id: 'event-id',
    external_event_id: 'instagram-message-id',
    event_type: 'story_mention',
    sender_id: 'fan-id',
    recipient_id: 'artist-id',
    payload: {},
    status: 'processing',
    attempt_count: 1,
    last_error: null,
    occurred_at: now,
    received_at: now,
    processing_started_at: now,
    next_attempt_at: null,
    processed_at: null,
    created_at: now,
    updated_at: now,
  };

  const storyMentionProcessor = {
    processNext: jest.fn(),
  };
  const webhookEventsRepository = {
    recoverStaleProcessingByType: jest.fn(),
  };

  let config: Record<string, string | undefined>;
  let configService: ConfigService;
  let loggerLog: jest.SpyInstance;
  let loggerError: jest.SpyInstance;
  let loggerWarn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      NODE_ENV: 'test',
    };
    configService = {
      get: jest.fn((name: string) => config[name]),
    } as unknown as ConfigService;
    webhookEventsRepository.recoverStaleProcessingByType.mockResolvedValue([]);
    loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    loggerLog.mockRestore();
    loggerError.mockRestore();
    loggerWarn.mockRestore();
    jest.useRealTimers();
  });

  function createWorker(): StoryMentionWorker {
    return new StoryMentionWorker(
      configService,
      storyMentionProcessor as unknown as StoryMentionProcessor,
      webhookEventsRepository as unknown as WebhookEventsRepository,
    );
  }

  it('recovers stale work and drains events until the queue is idle', async () => {
    webhookEventsRepository.recoverStaleProcessingByType.mockResolvedValueOnce([
      {
        ...baseEvent,
        status: 'pending',
        processing_started_at: null,
      },
      {
        ...baseEvent,
        id: 'abandoned-event-id',
        status: 'failed',
        processing_started_at: null,
      },
    ]);
    storyMentionProcessor.processNext
      .mockResolvedValueOnce({
        status: 'processed',
        eventId: 'processed-event-id',
        clipId: 'clip-id',
        mediaAssetId: 'asset-id',
      })
      .mockResolvedValueOnce({
        status: 'retrying',
        eventId: 'retrying-event-id',
        error: 'Temporary database error',
      })
      .mockResolvedValueOnce({ status: 'idle' });

    await expect(createWorker().runOnce()).resolves.toEqual({
      processed: 1,
      retrying: 1,
      failed: 0,
      requeued: 1,
      abandoned: 1,
    });

    expect(storyMentionProcessor.processNext).toHaveBeenCalledTimes(3);
  });

  it('stops processing when the configured batch limit is reached', async () => {
    config.STORY_MENTION_WORKER_BATCH_SIZE = '2';
    storyMentionProcessor.processNext.mockResolvedValue({
      status: 'processed',
      eventId: 'processed-event-id',
      clipId: 'clip-id',
      mediaAssetId: 'asset-id',
    });

    await expect(createWorker().runOnce()).resolves.toEqual({
      processed: 2,
      retrying: 0,
      failed: 0,
      requeued: 0,
      abandoned: 0,
    });

    expect(storyMentionProcessor.processNext).toHaveBeenCalledTimes(2);
    expect(storyMentionProcessor.processNext).toHaveBeenCalledWith(3, 60_000);
  });

  it('does not schedule polling in the test environment by default', () => {
    jest.useFakeTimers();
    const worker = createWorker();

    worker.onApplicationBootstrap();
    jest.advanceTimersByTime(10_000);

    expect(storyMentionProcessor.processNext).not.toHaveBeenCalled();
    expect(loggerLog).toHaveBeenCalledWith('Story mention worker is disabled');
  });

  it('waits for active work and does not overlap or reschedule during shutdown', async () => {
    jest.useFakeTimers();
    config.NODE_ENV = 'development';
    config.STORY_MENTION_WORKER_POLL_INTERVAL_MS = '250';
    config.STORY_MENTION_WORKER_BATCH_SIZE = '1';

    let resolveProcessing: ((value: { status: 'idle' }) => void) | undefined;
    storyMentionProcessor.processNext.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProcessing = resolve;
        }),
    );

    const worker = createWorker();
    worker.onApplicationBootstrap();
    jest.advanceTimersByTime(0);
    await Promise.resolve();

    expect(storyMentionProcessor.processNext).toHaveBeenCalledTimes(1);

    const shutdown = worker.onApplicationShutdown();
    jest.advanceTimersByTime(10_000);

    expect(storyMentionProcessor.processNext).toHaveBeenCalledTimes(1);

    if (!resolveProcessing) {
      throw new Error('Worker did not begin processing');
    }

    resolveProcessing({ status: 'idle' });
    await shutdown;

    jest.advanceTimersByTime(10_000);
    expect(storyMentionProcessor.processNext).toHaveBeenCalledTimes(1);
  });
});
