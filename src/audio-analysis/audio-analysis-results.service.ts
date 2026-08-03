import { ConflictException, Injectable } from '@nestjs/common';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';
import { ClipAudioAnalysisResultRow } from './types/clip-audio-analysis-row.type';

@Injectable()
export class AudioAnalysisResultsService {
  constructor(
    private readonly analysesRepository: ClipAudioAnalysesRepository,
  ) {}

  listForClip(
    clipId: string,
    workspaceId?: string,
  ): Promise<ClipAudioAnalysisResultRow[]> {
    return this.analysesRepository.listForClip(clipId, workspaceId);
  }

  async retry(
    analysisId: string,
    workspaceId?: string,
  ): Promise<{ id: string; status: 'pending' }> {
    const analysis = await this.analysesRepository.retry(
      analysisId,
      workspaceId,
    );
    if (!analysis) {
      throw new ConflictException(
        'Only failed or no-match audio analyses can be retried',
      );
    }
    return { id: analysis.id, status: 'pending' };
  }
}
