import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AudioAnalysisResultsService } from './audio-analysis-results.service';
import { ClipAudioAnalysisResultRow } from './types/clip-audio-analysis-row.type';

// TODO: Scope these internal inspection endpoints to the authenticated account.
@Controller('internal/audio-analyses')
export class AudioAnalysisController {
  constructor(private readonly resultsService: AudioAnalysisResultsService) {}

  @Get('clips/:clipId')
  listForClip(
    @Param('clipId') clipId: string,
  ): Promise<ClipAudioAnalysisResultRow[]> {
    return this.resultsService.listForClip(clipId);
  }

  @Post(':analysisId/retry')
  @HttpCode(200)
  retry(
    @Param('analysisId') analysisId: string,
  ): Promise<{ id: string; status: 'pending' }> {
    return this.resultsService.retry(analysisId);
  }
}
