import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ClipsService } from './clips.service';
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
