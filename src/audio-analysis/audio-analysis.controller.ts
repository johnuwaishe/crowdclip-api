import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AudioAnalysisResultsService } from './audio-analysis-results.service';
import { ClipAudioAnalysisResultRow } from './types/clip-audio-analysis-row.type';
import { WorkspaceAccessGuard } from '../workspaces/workspace-access.guard';
import { CurrentWorkspaceAccess } from '../workspaces/current-workspace-access.decorator';
import type { WorkspaceAccess } from '../workspaces/types/workspace-access.type';

@Controller('internal/audio-analyses')
@UseGuards(WorkspaceAccessGuard)
export class AudioAnalysisController {
  constructor(private readonly resultsService: AudioAnalysisResultsService) {}

  @Get('clips/:clipId')
  listForClip(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('clipId') clipId: string,
  ): Promise<ClipAudioAnalysisResultRow[]> {
    return this.resultsService.listForClip(clipId, session.workspaceId);
  }

  @Post(':analysisId/retry')
  @HttpCode(200)
  retry(
    @CurrentWorkspaceAccess() session: WorkspaceAccess,
    @Param('analysisId') analysisId: string,
  ): Promise<{ id: string; status: 'pending' }> {
    return this.resultsService.retry(analysisId, session.workspaceId);
  }
}
