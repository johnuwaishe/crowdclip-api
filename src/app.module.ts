import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InstagramWebhookService } from './instagram/instagram-webhook.service';
import { ConfigModule } from '@nestjs/config';
import { InstagramModule } from './instagram/instagram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    InstagramModule,
  ],
  controllers: [AppController],
  providers: [AppService, InstagramWebhookService],
})
export class AppModule {}
