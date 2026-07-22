import { Injectable } from '@nestjs/common';

@Injectable()
export class InstagramWebhookService {
  async recordWebhookEvent(payload: unknown): Promise<void> {}
}
