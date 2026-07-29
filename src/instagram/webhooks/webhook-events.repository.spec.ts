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
      ],
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
