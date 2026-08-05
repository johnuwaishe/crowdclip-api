import {
  Controller,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  OriginalFileMultipartUpload,
  OriginalFileUploadResult,
  OriginalFileUploadsService,
} from './original-file-uploads.service';
import { OriginalFileUploadTokenGuard } from './original-file-upload-token.guard';

const MAX_MULTIPART_FILE_BYTES = 50 * 1024 * 1024;

@ApiTags('Fan uploads')
@Controller('uploads/original')
export class OriginalFileUploadsController {
  constructor(
    private readonly originalFileUploadsService: OriginalFileUploadsService,
  ) {}

  @Post(':token')
  @ApiOperation({
    summary: 'Upload a fan original using a signed request token',
  })
  @ApiParam({
    name: 'token',
    description: 'Signed token from the original-file request link.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @HttpCode(200)
  @UseGuards(OriginalFileUploadTokenGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        files: 1,
        fields: 0,
        parts: 2,
        fileSize: MAX_MULTIPART_FILE_BYTES,
      },
    }),
  )
  upload(
    @Param('token') token: string,
    @UploadedFile() file: OriginalFileMultipartUpload | undefined,
  ): Promise<OriginalFileUploadResult> {
    return this.originalFileUploadsService.upload(token, file);
  }
}
