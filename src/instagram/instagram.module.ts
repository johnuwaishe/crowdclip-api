import { Module } from '@nestjs/common';
import { InstagramWebhookController } from './instragram-webhook.controller';
import { MetaSignatureService } from './meta-signature.service';
import { InstagramWebhookService } from './instagram-webhook.service';

@Module({
  controllers: [InstagramWebhookController],
  providers: [InstagramWebhookService, MetaSignatureService],
})
export class InstagramModule {}
