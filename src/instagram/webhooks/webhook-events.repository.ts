import { Injectable } from '@nestjs/common';
import { WebhookEventRow } from './types/webhook-event-row.type';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../../database/database.service';

interface CreateWebhookEventInput {
  externalEventId: string;
  eventType: string;
  senderId: string;
  recipientId: string;
  payload: Record<string, unknown>;
  occurredAt: Date | null;
}

@Injectable()
export class WebhookEventsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createIfNotExists(
    input: CreateWebhookEventInput,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<WebhookEventRow | null> {
    const result = await executor.query<WebhookEventRow>(
      `
        INSERT INTO public.webhook_events (
          external_event_id,
          event_type,
          sender_id,
          recipient_id,
          payload,
          occurred_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        ON CONFLICT (external_event_id)
        DO NOTHING
        RETURNING *
      `,
      [
        input.externalEventId,
        input.eventType,
        input.senderId,
        input.recipientId,
        JSON.stringify(input.payload),
        input.occurredAt,
      ],
    );

    return result.rows[0] ?? null;
  }

  async claimNextPendingByType(
    eventType: string,
  ): Promise<WebhookEventRow | null> {
    const result = await this.databaseService.query<WebhookEventRow>(
      `
        WITH next_event AS (
          SELECT id
          FROM public.webhook_events
          WHERE status = 'pending'
            AND event_type = $1
          ORDER BY received_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE public.webhook_events AS webhook_event
        SET status = 'processing',
            attempt_count = webhook_event.attempt_count + 1,
            last_error = NULL,
            processing_started_at = NOW()
        FROM next_event
        WHERE webhook_event.id = next_event.id
        RETURNING webhook_event.*
      `,
      [eventType],
    );

    return result.rows[0] ?? null;
  }

  async recoverStaleProcessingByType(
    eventType: string,
    staleBefore: Date,
    maxAttempts: number,
  ): Promise<WebhookEventRow[]> {
    const result = await this.databaseService.query<WebhookEventRow>(
      `
        UPDATE public.webhook_events
        SET status = CASE
              WHEN attempt_count >= $3 THEN 'failed'
              ELSE 'pending'
            END,
            last_error = $4,
            processing_started_at = NULL
        WHERE status = 'processing'
          AND event_type = $1
          AND processing_started_at < $2
        RETURNING *
      `,
      [
        eventType,
        staleBefore,
        maxAttempts,
        'Processing lease expired before completion',
      ],
    );

    return result.rows;
  }

  async markProcessed(
    id: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<WebhookEventRow | null> {
    const result = await executor.query<WebhookEventRow>(
      `
        UPDATE public.webhook_events
        SET status = 'processed',
            last_error = NULL,
            processed_at = NOW()
        WHERE id = $1
          AND status = 'processing'
        RETURNING *
      `,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async markFailed(
    id: string,
    errorMessage: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<WebhookEventRow | null> {
    const result = await executor.query<WebhookEventRow>(
      `
        UPDATE public.webhook_events
        SET status = 'failed',
            last_error = $2
        WHERE id = $1
          AND status = 'processing'
        RETURNING *
      `,
      [id, errorMessage],
    );

    return result.rows[0] ?? null;
  }

  async markIgnored(
    id: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<WebhookEventRow | null> {
    const result = await executor.query<WebhookEventRow>(
      `
        UPDATE public.webhook_events
        SET status = 'ignored',
            last_error = NULL,
            processed_at = NOW()
        WHERE id = $1
          AND status = 'processing'
        RETURNING *
      `,
      [id],
    );

    return result.rows[0] ?? null;
  }
}
