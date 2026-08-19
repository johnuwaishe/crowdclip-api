import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { InstagramModule } from './instagram/instagram.module';
import { DatabaseModule } from './database/database.module';
import { MediaModule } from './media/media.module';
import { AudioAnalysisModule } from './audio-analysis/audio-analysis.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { AuthModule } from './auth/auth.module';
import { DemoModule } from './demo/demo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      isGlobal: true,
    }),
    InstagramModule,
    DatabaseModule,
    AuthModule,
    WorkspacesModule,
    AudioAnalysisModule,
    MediaModule,
    DemoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
