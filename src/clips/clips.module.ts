import { Module } from '@nestjs/common';
import { FansRepository } from '../fans/fans.repository';
import { ClipsRepository } from './clips.repository';
import { MediaAssetsRepository } from './media-assets.repository';

@Module({
  providers: [FansRepository, ClipsRepository, MediaAssetsRepository],
  exports: [FansRepository, ClipsRepository, MediaAssetsRepository],
})
export class ClipsModule {}
