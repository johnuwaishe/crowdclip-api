import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class InstagramWebhookService {
  private readonly logger = new Logger(InstagramWebhookService.name);

  async recordWebhookEvent(payload: unknown): Promise<void> {
    const event = {
      id: randomUUID(),
      receivedAt: new Date().toDateString(),
      payload,
    };

    this.logger.log(`Received Instagram webhook event: ${event.id}`);
    this.logger.debug(`Event payload: ${JSON.stringify(payload)}`);
  }
}
