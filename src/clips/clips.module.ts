import { Module } from '@nestjs/common';
import { AudioAnalysisModule } from '../audio-analysis/audio-analysis.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { FansRepository } from '../fans/fans.repository';
import { MediaStorageModule } from '../media/media-storage.module';
import { ClipsController } from './clips.controller';
import { ClipsRepository } from './clips.repository';
import { ClipsService } from './clips.service';
import { MediaAssetsRepository } from './media-assets.repository';
import { OriginalFileRequestsRepository } from './original-file-requests.repository';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';
import { OriginalFileUploadsController } from './original-file-uploads.controller';
import { OriginalFileUploadsService } from './original-file-uploads.service';
import { OriginalFileUploadTokenGuard } from './original-file-upload-token.guard';

@Module({
  imports: [AudioAnalysisModule, MediaStorageModule, WorkspacesModule],
  controllers: [ClipsController, OriginalFileUploadsController],
  providers: [
    FansRepository,
    ClipsRepository,
    ClipsService,
    MediaAssetsRepository,
    OriginalFileRequestsRepository,
    OriginalFileUploadTokenService,
    OriginalFileUploadsService,
    OriginalFileUploadTokenGuard,
  ],
  exports: [FansRepository, ClipsRepository, MediaAssetsRepository],
})
export class ClipsModule {}
