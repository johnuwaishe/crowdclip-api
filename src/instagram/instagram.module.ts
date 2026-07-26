import { Module } from '@nestjs/common';
import { InstagramWebhookController } from './webhooks/instagram-webhook.controller';
import { MetaSignatureService } from './meta-signature.service';
import { InstagramWebhookService } from './webhooks/instagram-webhook.service';
import { InstagramAuthController } from './instagram-auth.controller';

@Module({
  controllers: [InstagramWebhookController, InstagramAuthController],
  providers: [InstagramWebhookService, MetaSignatureService],
})
export class InstagramModule {}
