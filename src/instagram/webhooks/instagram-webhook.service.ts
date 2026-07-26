import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WebhookEventsRepository } from './webhook-events.repository';
import { getInstagramEventType } from '../instrgram-event-parser';

@Injectable()
export class InstagramWebhookService {
  private readonly logger = new Logger(InstagramWebhookService.name);

  constructor(
    private readonly webhookEventsRepository: WebhookEventsRepository,
  ) {}

  async handleWebhookPayload(payload: any): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const messageEvent of entry.messaging ?? []) {
        await this.persistMessagingEvent(messageEvent);
      }
    }
  }

  private async persistMessagingEvent(event: any): Promise<void> {
    const externalEventId = event.message?.mid;

    if (!externalEventId) {
      this.logger.warn('Received messaging event without external event ID');
      return;
    }

    const eventType = getInstagramEventType(event);

    const storedEvent = await this.webhookEventsRepository.createIfNotExists({
      externalEventId,
      eventType,
      senderId: event.sender.id,
      recipientId: event.recipient.id,
      occurredAt: event.timestamp ? new Date(event.timestamp) : null,
      payload: event,
    });

    if (!storedEvent) {
      this.logger.log(`Webhook event ${externalEventId} already exists`);

      return;
    }

    this.logger.log(`Stored ${eventType} event ${externalEventId}`);
  }
}
