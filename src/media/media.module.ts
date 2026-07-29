import { Module } from '@nestjs/common';
import { ClipsModule } from '../clips/clips.module';
import { MediaDownloadConfig } from './media-download.config';
import { MediaDownloadProcessor } from './media-download.processor';
import { MediaDownloadWorker } from './media-download.worker';
import { RemoteMediaDownloader } from './remote-media-downloader.service';
import { SupabaseObjectStorage } from './supabase-object-storage.service';

@Module({
  imports: [ClipsModule],
  providers: [
    MediaDownloadConfig,
    MediaDownloadProcessor,
    MediaDownloadWorker,
    RemoteMediaDownloader,
    SupabaseObjectStorage,
  ],
})
export class MediaModule {}
