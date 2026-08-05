import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AudioAnalysisResultsService } from './audio-analysis-results.service';
import { ClipAudioAnalysisResultRow } from './types/clip-audio-analysis-row.type';
import { WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { CurrentWorkspaceAccess } from '../workspaces/current-workspace-access.decorator';
import type { WorkspaceAccess } from '../workspaces/types/workspace-access.type';

@ApiTags('Audio analysis')
@ApiBearerAuth('supabase')
@ApiCookieAuth('crowdclip-session')
@Controller('internal/audio-analyses')
@UseGuards(WorkspaceAccessGuard)
export class AudioAnalysisController {
  constructor(private readonly resultsService: AudioAnalysisResultsService) {}

  @Get('clips/:clipId')
  @ApiOperation({ summary: 'List audio-analysis attempts for a clip' })
  @ApiParam({ name: 'clipId', format: 'uuid' })
  listForClip(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('clipId') clipId: string,
  ): Promise<ClipAudioAnalysisResultRow[]> {
    return this.resultsService.listForClip(clipId, session.workspaceId);
  }

  @Post(':analysisId/retry')
  @ApiOperation({ summary: 'Retry a failed or unmatched audio analysis' })
  @ApiParam({ name: 'analysisId', format: 'uuid' })
  @HttpCode(200)
  retry(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('analysisId') analysisId: string,
  ): Promise<{ id: string; status: 'pending' }> {
    return this.resultsService.retry(analysisId, session.workspaceId);
  }
}
