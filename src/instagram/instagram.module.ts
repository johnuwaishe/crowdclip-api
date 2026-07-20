import { Module } from '@nestjs/common';
import { InstragramWebhookController } from './instragram-webhook.controller';
import { MetaSignatureService } from './meta-signature.service';
import { InstagramWebhookService } from './instagram-webhook.service';

@Module({
  controllers: [InstragramWebhookController],
  providers: [InstagramWebhookService, MetaSignatureService],
})
export class InstagramModule {}
