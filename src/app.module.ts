import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InstagramWebhookService } from './instagram/webhooks/instagram-webhook.service';
import { ConfigModule } from '@nestjs/config';
import { InstagramModule } from './instagram/instagram.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    InstagramModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService, InstagramWebhookService],
})
export class AppModule {}
