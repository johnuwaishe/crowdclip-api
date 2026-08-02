import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';
import { ClipAudioAnalysisResultRow } from './types/clip-audio-analysis-row.type';

@Injectable()
export class AudioAnalysisResultsService {
  constructor(
    private readonly analysesRepository: ClipAudioAnalysesRepository,
  ) {}

  listForClip(clipId: string): Promise<ClipAudioAnalysisResultRow[]> {
    return this.analysesRepository.listForClip(clipId);
  }

  async retry(analysisId: string): Promise<{ id: string; status: 'pending' }> {
    const analysis = await this.analysesRepository.retry(analysisId);
    if (!analysis) {
      throw new ConflictException(
        'Only failed or no-match audio analyses can be retried',
      );
    }
    if (!analysis.id) {
      throw new NotFoundException('Audio analysis not found');
    }
    return { id: analysis.id, status: 'pending' };
  }
}
