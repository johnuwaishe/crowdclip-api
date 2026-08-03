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
import { WorkspaceSessionGuard } from '../workspaces/workspace-session.guard';
import { CurrentWorkspaceSession } from '../workspaces/current-workspace-session.decorator';
import type { WorkspaceSession } from '../workspaces/workspace-session.service';

@Controller('internal/audio-analyses')
@UseGuards(WorkspaceSessionGuard)
export class AudioAnalysisController {
  constructor(private readonly resultsService: AudioAnalysisResultsService) {}

  @Get('clips/:clipId')
  listForClip(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Param('clipId') clipId: string,
  ): Promise<ClipAudioAnalysisResultRow[]> {
    return this.resultsService.listForClip(clipId, session.workspaceId);
  }

  @Post(':analysisId/retry')
  @HttpCode(200)
  retry(
    @CurrentWorkspaceSession() session: WorkspaceSession,
    @Param('analysisId') analysisId: string,
  ): Promise<{ id: string; status: 'pending' }> {
    return this.resultsService.retry(analysisId, session.workspaceId);
  }
}
