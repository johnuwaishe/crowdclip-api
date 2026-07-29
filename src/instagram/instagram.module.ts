import { Module } from '@nestjs/common';
import { InstagramWebhookController } from './webhooks/instagram-webhook.controller';
import { MetaSignatureService } from './meta-signature.service';
import { InstagramWebhookService } from './webhooks/instagram-webhook.service';
import { InstagramAuthController } from './instagram-auth.controller';
import { WebhookEventsRepository } from './webhooks/webhook-events.repository';
import { ClipsModule } from '../clips/clips.module';
import { StoryMentionProcessor } from './webhooks/story-mention.processor';

@Module({
  imports: [ClipsModule],
  controllers: [InstagramWebhookController, InstagramAuthController],
  providers: [
    InstagramWebhookService,
    StoryMentionProcessor,
    MetaSignatureService,
    WebhookEventsRepository,
  ],
})
export class InstagramModule {}
