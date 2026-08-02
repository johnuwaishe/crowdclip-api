import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AudioReferenceCataloguesService } from './audio-reference-catalogues.service';
import type {
  AudioReferenceCatalogueView,
  AudioReferenceTrackView,
  CreateAudioReferenceCatalogueRequest,
  ReferenceTrackMultipartUpload,
  UploadAudioReferenceTrackRequest,
} from './audio-reference-catalogues.service';

const MAX_MULTIPART_REFERENCE_BYTES = 100 * 1024 * 1024;

// TODO: Replace this local bootstrap surface with account-scoped authorization
// before exposing reference catalogue management outside a trusted environment.
@Controller('internal/audio-catalogues')
export class AudioReferenceCataloguesController {
  constructor(
    private readonly cataloguesService: AudioReferenceCataloguesService,
  ) {}

  @Post()
  create(
    @Body() request: CreateAudioReferenceCatalogueRequest,
  ): Promise<AudioReferenceCatalogueView> {
    return this.cataloguesService.create(request);
  }

  @Get(':catalogueId')
  get(
    @Param('catalogueId') catalogueId: string,
  ): Promise<AudioReferenceCatalogueView> {
    return this.cataloguesService.get(catalogueId);
  }

  @Post(':catalogueId/tracks')
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
    @Param('catalogueId') catalogueId: string,
    @Body() request: UploadAudioReferenceTrackRequest,
    @UploadedFile() file: ReferenceTrackMultipartUpload | undefined,
  ): Promise<AudioReferenceTrackView> {
    return this.cataloguesService.uploadTrack(catalogueId, request, file);
  }
}
