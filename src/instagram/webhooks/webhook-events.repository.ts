import { Injectable } from '@nestjs/common';
import {
  WebhookEventRow,
  WebhookEventStatus,
} from './types/webhook-event-row.type';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../../database/database.service';

interface CreateWebhookEventInput {
  externalEventId: string;
  eventType: string;
  initialStatus: Extract<WebhookEventStatus, 'pending' | 'ignored'>;
  senderId: string;
  recipientId: string;
  payload: object;
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
          occurred_at,
          status,
          processed_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::jsonb,
          $6,
          $7,
          CASE WHEN $7 = 'ignored' THEN NOW() ELSE NULL END
        )
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
        input.initialStatus,
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
            AND (
              next_attempt_at IS NULL
              OR next_attempt_at <= NOW()
            )
          ORDER BY received_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE public.webhook_events AS webhook_event
        SET status = 'processing',
            attempt_count = webhook_event.attempt_count + 1,
            last_error = NULL,
            processing_started_at = NOW(),
            next_attempt_at = NULL
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
            processing_started_at = NULL,
            next_attempt_at = CASE
              WHEN attempt_count >= $3 THEN NULL
              ELSE NOW()
            END
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
            next_attempt_at = NULL,
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
            last_error = $2,
            processing_started_at = NULL,
            next_attempt_at = NULL
        WHERE id = $1
          AND status = 'processing'
        RETURNING *
      `,
      [id, errorMessage],
    );

    return result.rows[0] ?? null;
  }

  async releaseAfterFailure(
    id: string,
    errorMessage: string,
    maxAttempts: number,
    nextAttemptAt: Date,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<WebhookEventRow | null> {
    const result = await executor.query<WebhookEventRow>(
      `
        UPDATE public.webhook_events
        SET status = CASE
              WHEN attempt_count >= $3 THEN 'failed'
              ELSE 'pending'
            END,
            last_error = $2,
            processing_started_at = NULL,
            next_attempt_at = CASE
              WHEN attempt_count >= $3 THEN NULL
              ELSE $4
            END
        WHERE id = $1
          AND status = 'processing'
        RETURNING *
      `,
      [id, errorMessage, maxAttempts, nextAttemptAt],
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
            next_attempt_at = NULL,
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
