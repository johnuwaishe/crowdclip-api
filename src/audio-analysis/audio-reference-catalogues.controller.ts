import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AudioReferenceCataloguesService } from './audio-reference-catalogues.service';
import type {
  AudioReferenceCatalogueView,
  AudioReferenceTrackView,
  ReferenceTrackMultipartUpload,
  UploadAudioReferenceTrackRequest,
} from './audio-reference-catalogues.service';
import { WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { CurrentWorkspaceAccess } from '../workspaces/current-workspace-access.decorator';
import type { WorkspaceAccess } from '../workspaces/types/workspace-access.type';

const MAX_MULTIPART_REFERENCE_BYTES = 100 * 1024 * 1024;

@Controller('shows/:showId/reference-tracks')
@UseGuards(WorkspaceAccessGuard)
export class AudioReferenceCataloguesController {
  constructor(
    private readonly cataloguesService: AudioReferenceCataloguesService,
  ) {}

  @Get()
  get(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId') showId: string,
  ): Promise<AudioReferenceCatalogueView> {
    return this.cataloguesService.getForShow(showId, session.workspaceId);
  }

  @Post()
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        files: 1,
        fields: 2,
        parts: 4,
        fileSize: MAX_MULTIPART_REFERENCE_BYTES,
      },
    }),
  )
  uploadTrack(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('showId') showId: string,
    @Body() request: UploadAudioReferenceTrackRequest,
    @UploadedFile() file: ReferenceTrackMultipartUpload | undefined,
  ): Promise<AudioReferenceTrackView> {
    return this.cataloguesService.uploadTrackForShow(
      showId,
      session.workspaceId,
      request,
      file,
    );
  }
}
