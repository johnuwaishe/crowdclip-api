import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ClipsService } from './clips.service';
import {
  ArtistClipMediaChoice,
  ClipDecisionResult,
} from './types/clip-decision.type';
import { ClipReview } from './types/clip-review.type';

const DEFAULT_CLIP_LIMIT = 20;
const MAX_CLIP_LIMIT = 100;

@Controller('clips')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  async listRecent(
    @Query('limit') rawLimit?: string,
  ): Promise<{ clips: ClipReview[] }> {
    const limit = this.parseLimit(rawLimit);
    const clips = await this.clipsService.listRecentForReview(limit);

    return { clips };
  }

  @Patch(':clipId/media-choice')
  async decideMediaChoice(
    @Param('clipId', new ParseUUIDPipe({ version: '4' })) clipId: string,
    @Body() body: unknown,
  ): Promise<ClipDecisionResult> {
    const mediaChoice = this.parseMediaChoice(body);

    return this.clipsService.decideMediaChoice(clipId, mediaChoice);
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
