import { Module } from '@nestjs/common';
import { AudioAnalysisModule } from '../audio-analysis/audio-analysis.module';
import { ClipsModule } from '../clips/clips.module';
import { MediaDownloadProcessor } from './media-download.processor';
import { MediaDownloadWorker } from './media-download.worker';
import { MediaStorageModule } from './media-storage.module';
import { RemoteMediaDownloader } from './remote-media-downloader.service';

@Module({
  imports: [AudioAnalysisModule, ClipsModule, MediaStorageModule],
  providers: [
    MediaDownloadProcessor,
    MediaDownloadWorker,
    RemoteMediaDownloader,
  ],
})
export class MediaModule {}
