import { Module } from '@nestjs/common';
import { FansRepository } from '../fans/fans.repository';
import { MediaStorageModule } from '../media/media-storage.module';
import { ClipsController } from './clips.controller';
import { ClipsRepository } from './clips.repository';
import { ClipsService } from './clips.service';
import { MediaAssetsRepository } from './media-assets.repository';

@Module({
  imports: [MediaStorageModule],
  controllers: [ClipsController],
  providers: [
    FansRepository,
    ClipsRepository,
    ClipsService,
    MediaAssetsRepository,
  ],
  exports: [FansRepository, ClipsRepository, MediaAssetsRepository],
})
export class ClipsModule {}
