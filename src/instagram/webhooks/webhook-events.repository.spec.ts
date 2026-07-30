import { QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { WebhookEventRow } from './types/webhook-event-row.type';
import { WebhookEventsRepository } from './webhook-events.repository';

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

describe('WebhookEventsRepository', () => {
  const query = jest.fn();
  const databaseService = {
    query,
  } as unknown as DatabaseService;

  const now = new Date('2026-07-29T17:00:00.000Z');
  const event: WebhookEventRow = {
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

  let repository: WebhookEventsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new WebhookEventsRepository(databaseService);
  });

  it('persists a parameterized webhook event', async () => {
    query.mockResolvedValueOnce(queryResult([event]));

    await expect(
      repository.createIfNotExists({
        externalEventId: 'instagram-message-id',
        eventType: 'story_mention',
        initialStatus: 'pending',
        senderId: 'fan-id',
        recipientId: 'artist-id',
        payload: { message: { mid: 'instagram-message-id' } },
        occurredAt: now,
      }),
    ).resolves.toBe(event);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO public.webhook_events'),
      [
        'instagram-message-id',
        'story_mention',
        'fan-id',
        'artist-id',
        JSON.stringify({ message: { mid: 'instagram-message-id' } }),
        now,
        'pending',
      ],
    );
  });

  it('persists unsupported events as already ignored', async () => {
    query.mockResolvedValueOnce(
      queryResult([{ ...event, event_type: 'message', status: 'ignored' }]),
    );

    await repository.createIfNotExists({
      externalEventId: 'unsupported-message-id',
      eventType: 'message',
      initialStatus: 'ignored',
      senderId: 'fan-id',
      recipientId: 'artist-id',
      payload: { message: { mid: 'unsupported-message-id', text: 'hello' } },
      occurredAt: now,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("CASE WHEN $7 = 'ignored' THEN NOW()"),
      expect.arrayContaining(['ignored']),
    );
  });

  it('atomically claims the oldest pending event of a normalized type', async () => {
    query.mockResolvedValueOnce(queryResult([event]));

    await expect(
      repository.claimNextPendingByType('story_mention'),
    ).resolves.toBe(event);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      ['story_mention'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'processing'"),
      ['story_mention'],
    );
  });

  it('returns null when no pending event can be claimed', async () => {
    query.mockResolvedValueOnce(queryResult([]));

    await expect(
      repository.claimNextPendingByType('story_mention'),
    ).resolves.toBeNull();
  });

  it('releases transient failures for a delayed retry', async () => {
    const nextAttemptAt = new Date('2026-07-29T17:01:00.000Z');
    query.mockResolvedValueOnce(
      queryResult([
        {
          ...event,
          status: 'pending',
          processing_started_at: null,
          next_attempt_at: nextAttemptAt,
        },
      ]),
    );

    await repository.releaseAfterFailure(
      event.id,
      'Database unavailable',
      3,
      nextAttemptAt,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHEN attempt_count >= $3'),
      [event.id, 'Database unavailable', 3, nextAttemptAt],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ELSE $4'),
      expect.any(Array),
    );
  });

  it('requeues stale events and abandons events at the attempt limit', async () => {
    const staleBefore = new Date('2026-07-29T16:55:00.000Z');
    const recoveredEvents: WebhookEventRow[] = [
      {
        ...event,
        status: 'pending',
        processing_started_at: null,
      },
      {
        ...event,
        id: 'abandoned-event-id',
        status: 'failed',
        processing_started_at: null,
      },
    ];
    query.mockResolvedValueOnce(queryResult(recoveredEvents));

    await expect(
      repository.recoverStaleProcessingByType('story_mention', staleBefore, 3),
    ).resolves.toBe(recoveredEvents);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHEN attempt_count >= $3'),
      [
        'story_mention',
        staleBefore,
        3,
        'Processing lease expired before completion',
      ],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND processing_started_at < $2'),
      expect.any(Array),
    );
  });

  it.each([
    ['markProcessed', 'processed', ['event-id']],
    ['markFailed', 'failed', ['event-id', 'Processing failed']],
    ['markIgnored', 'ignored', ['event-id']],
  ] as const)(
    '%s updates only an event currently being processed',
    async (method, expectedStatus, expectedParams) => {
      query.mockResolvedValueOnce(queryResult([event]));

      if (method === 'markFailed') {
        await repository.markFailed('event-id', 'Processing failed');
      } else {
        await repository[method]('event-id');
      }

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(`SET status = '${expectedStatus}'`),
        expectedParams,
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("AND status = 'processing'"),
        expectedParams,
      );
    },
  );
});
