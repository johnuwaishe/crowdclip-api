import { Injectable, Logger } from '@nestjs/common';
import { WebhookEventsRepository } from './webhook-events.repository';
import { getInstagramEventType } from '../instrgram-event-parser';
import { normalizeInstagramMessagingEvents } from './instagram-webhook-payload.parser';
import { InstagramMessagingEvent } from './types/Instagram-webhook.type';

@Injectable()
export class InstagramWebhookService {
  private readonly logger = new Logger(InstagramWebhookService.name);

  constructor(
    private readonly webhookEventsRepository: WebhookEventsRepository,
  ) {}

  async handleWebhookPayload(payload: unknown): Promise<void> {
    const messagingEvents = normalizeInstagramMessagingEvents(payload);

    for (const messageEvent of messagingEvents) {
      await this.persistMessagingEvent(messageEvent);
    }
  }

  private async persistMessagingEvent(
    event: InstagramMessagingEvent,
  ): Promise<void> {
    const externalEventId = event.message?.mid;

    if (!externalEventId) {
      this.logger.warn('Received messaging event without external event ID');
      return;
    }

    const eventType = getInstagramEventType(event);
    const initialStatus = eventType === 'story_mention' ? 'pending' : 'ignored';

    const storedEvent = await this.webhookEventsRepository.createIfNotExists({
      externalEventId,
      eventType,
      initialStatus,
      senderId: event.sender.id,
      recipientId: event.recipient.id,
      occurredAt: event.timestamp ? new Date(event.timestamp) : null,
      payload: event,
    });

    if (!storedEvent) {
      this.logger.log(`Webhook event ${externalEventId} already exists`);

      return;
    }

    this.logger.log(
      `Stored ${eventType} event ${externalEventId} as ${initialStatus}`,
    );
  }
}
