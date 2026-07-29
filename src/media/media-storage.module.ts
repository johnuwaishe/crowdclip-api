import { Module } from '@nestjs/common';
import { MediaDownloadConfig } from './media-download.config';
import { SupabaseObjectStorage } from './supabase-object-storage.service';

@Module({
  providers: [MediaDownloadConfig, SupabaseObjectStorage],
  exports: [MediaDownloadConfig, SupabaseObjectStorage],
})
export class MediaStorageModule {}
