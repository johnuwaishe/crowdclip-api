import { Module } from '@nestjs/common';
import { InstagramWebhookController } from './instragram-webhook.controller';
import { MetaSignatureService } from './meta-signature.service';
import { InstagramWebhookService } from './instagram-webhook.service';
import { InstagramAuthController } from './instagram-auth.controller';

@Module({
  controllers: [InstagramWebhookController, InstagramAuthController],
  providers: [InstagramWebhookService, MetaSignatureService],
})
export class InstagramModule {}
