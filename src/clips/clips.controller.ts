import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ClipsService } from './clips.service';
import {
  ArtistClipMediaChoice,
  ClipDecisionResult,
} from './types/clip-decision.type';
import { ClipReview } from './types/clip-review.type';
import { WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { CurrentWorkspaceAccess } from '../workspaces/current-workspace-access.decorator';
import type { WorkspaceAccess } from '../workspaces/types/workspace-access.type';

const DEFAULT_CLIP_LIMIT = 20;
const MAX_CLIP_LIMIT = 100;

@ApiTags('Clips')
@ApiBearerAuth('supabase')
@ApiCookieAuth('crowdclip-session')
@Controller('clips')
@UseGuards(WorkspaceAccessGuard)
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  @ApiOperation({ summary: 'List recent clips for artist review' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  async listRecent(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Query('limit') rawLimit?: string,
  ): Promise<{ clips: ClipReview[] }> {
    const limit = this.parseLimit(rawLimit);
    const clips = await this.clipsService.listRecentForReview(
      limit,
      session.workspaceId,
    );

    return { clips };
  }

  @Patch(':clipId/media-choice')
  @ApiOperation({ summary: 'Choose story media or request the fan original' })
  @ApiParam({ name: 'clipId', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mediaChoice'],
      properties: {
        mediaChoice: {
          type: 'string',
          enum: ['use_instagram_story', 'request_fan_original'],
        },
      },
    },
  })
  async decideMediaChoice(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('clipId', new ParseUUIDPipe({ version: '4' })) clipId: string,
    @Body() body: unknown,
  ): Promise<ClipDecisionResult> {
    const mediaChoice = this.parseMediaChoice(body);

    return this.clipsService.decideMediaChoice(
      clipId,
      mediaChoice,
      session.workspaceId,
    );
  }

  private parseMediaChoice(body: unknown): ArtistClipMediaChoice {
    if (typeof body !== 'object' || body === null || !('mediaChoice' in body)) {
      throw new BadRequestException(
        'mediaChoice must be use_instagram_story or request_fan_original',
      );
    }

    const mediaChoice = body.mediaChoice;

    if (
      mediaChoice !== 'use_instagram_story' &&
      mediaChoice !== 'request_fan_original'
    ) {
      throw new BadRequestException(
        'mediaChoice must be use_instagram_story or request_fan_original',
      );
    }

    return mediaChoice;
  }

  private parseLimit(rawLimit: string | undefined): number {
    if (rawLimit === undefined) {
      return DEFAULT_CLIP_LIMIT;
    }

    if (!/^\d+$/.test(rawLimit)) {
      throw new BadRequestException(
        `limit must be an integer between 1 and ${MAX_CLIP_LIMIT}`,
      );
    }

    const limit = Number(rawLimit);

    if (limit < 1 || limit > MAX_CLIP_LIMIT) {
      throw new BadRequestException(
        `limit must be an integer between 1 and ${MAX_CLIP_LIMIT}`,
      );
    }

    return limit;
  }
}
