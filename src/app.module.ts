import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { environmentConfig } from './config/environment';
import { InstagramModule } from './instagram/instagram.module';
import { DatabaseModule } from './database/database.module';
import { AudioAnalysisModule } from './audio-analysis/audio-analysis.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { AuthModule } from './auth/auth.module';
import { DemoModule } from './demo/demo.module';

@Module({
  imports: [
    environmentConfig(),
    InstagramModule,
    DatabaseModule,
    AuthModule,
    WorkspacesModule,
    AudioAnalysisModule,
    DemoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
