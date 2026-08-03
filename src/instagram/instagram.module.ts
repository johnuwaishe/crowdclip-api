import { Module } from '@nestjs/common';
import { InstagramWebhookController } from './webhooks/instagram-webhook.controller';
import { MetaSignatureService } from './meta-signature.service';
import { InstagramWebhookService } from './webhooks/instagram-webhook.service';
import { InstagramAuthController } from './instagram-auth.controller';
import { WebhookEventsRepository } from './webhooks/webhook-events.repository';
import { ClipsModule } from '../clips/clips.module';
import { StoryMentionProcessor } from './webhooks/story-mention.processor';
import { StoryMentionWorker } from './webhooks/story-mention.worker';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { InstagramConnectionService } from './instagram-connection.service';
import { InstagramOAuthClient } from './instagram-oauth.client';
import { InstagramOAuthConfig } from './instagram-oauth.config';
import { InstagramOAuthStateService } from './instagram-oauth-state.service';

@Module({
  imports: [ClipsModule, WorkspacesModule],
  controllers: [InstagramWebhookController, InstagramAuthController],
  providers: [
    InstagramWebhookService,
    StoryMentionProcessor,
    StoryMentionWorker,
    MetaSignatureService,
    WebhookEventsRepository,
    InstagramOAuthConfig,
    InstagramOAuthClient,
    InstagramOAuthStateService,
    InstagramConnectionService,
  ],
})
export class InstagramModule {}
