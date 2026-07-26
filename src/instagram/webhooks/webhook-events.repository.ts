import { Injectable } from '@nestjs/common';
import { WebhookEventRow } from './types/webhook-event-row.type';
import { DatabaseService } from '../../database/database.service';

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
  ): Promise<WebhookEventRow | null> {
    const result = await this.databaseService.query<WebhookEventRow>(
      `
          INSERT INTO webhook_events (
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
}
