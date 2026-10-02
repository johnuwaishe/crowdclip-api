import { Module } from '@nestjs/common';
import { AudioAnalysisModule } from '../audio-analysis/audio-analysis.module';
import { AudioAnalysisWorker } from '../audio-analysis/audio-analysis.worker';
import { AudioStemWorker } from '../audio-analysis/audio-stem.worker';
import { ClipsModule } from '../clips/clips.module';
import { InstagramModule } from '../instagram/instagram.module';
import { StoryMentionWorker } from '../instagram/webhooks/story-mention.worker';
import { MediaStorageModule } from '../media/media-storage.module';
import { MediaDownloadWorker } from '../media/media-download.worker';
import { MediaModule } from '../media/media.module';

// Background job pollers. Imported only by the worker process, never by the
// HTTP API, so a request spike can't starve jobs and an API restart can't
// interrupt them.
@Module({
  imports: [
    AudioAnalysisModule,
    ClipsModule,
    InstagramModule,
    MediaModule,
    MediaStorageModule,
  ],
  providers: [
    StoryMentionWorker,
    MediaDownloadWorker,
    AudioAnalysisWorker,
    AudioStemWorker,
  ],
})
export class WorkersModule {}
