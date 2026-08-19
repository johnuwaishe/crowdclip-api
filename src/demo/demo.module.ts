import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MediaStorageModule } from '../media/media-storage.module';
import { DemoArtworkIngestor } from './demo-artwork.service';
import { DemoClipDownloader } from './demo-clip-downloader.service';
import { DemoConfig } from './demo.config';
import { DemoController } from './demo.controller';
import { DemoMediaAssetsRepository } from './demo-media-assets.repository';
import { DemoReferenceAudioIngestor } from './demo-reference-audio.service';
import { DemoReferenceTracksRepository } from './demo-reference-tracks.repository';
import { DemoService } from './demo.service';

@Module({
  imports: [DatabaseModule, MediaStorageModule],
  controllers: [DemoController],
  providers: [
    DemoConfig,
    DemoArtworkIngestor,
    DemoClipDownloader,
    DemoMediaAssetsRepository,
    DemoReferenceAudioIngestor,
    DemoReferenceTracksRepository,
    DemoService,
  ],
  exports: [DemoService],
})
export class DemoModule {}
