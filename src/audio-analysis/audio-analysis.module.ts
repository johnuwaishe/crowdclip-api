import { Module } from '@nestjs/common';
import { MediaStorageModule } from '../media/media-storage.module';
import { AudioAnalysisController } from './audio-analysis.controller';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioAnalysisProcessor } from './audio-analysis.processor';
import { AudioAnalysisResultsService } from './audio-analysis-results.service';
import { AudioAnalysisWorker } from './audio-analysis.worker';
import { AudioAnalyzerProcessRunner } from './audio-analyzer-process.runner';
import { AudioReferenceCataloguesController } from './audio-reference-catalogues.controller';
import { AudioReferenceCataloguesRepository } from './audio-reference-catalogues.repository';
import { AudioReferenceCataloguesService } from './audio-reference-catalogues.service';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';
import { ConcertAudioAnalyzerClient } from './concert-audio-analyzer.client';
import { SameMomentGroupingService } from './same-moment-grouping.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [MediaStorageModule, WorkspacesModule],
  controllers: [AudioReferenceCataloguesController, AudioAnalysisController],
  providers: [
    AudioAnalysisConfig,
    AudioAnalyzerProcessRunner,
    ConcertAudioAnalyzerClient,
    AudioReferenceCataloguesRepository,
    ClipAudioAnalysesRepository,
    AudioReferenceCataloguesService,
    AudioAnalysisResultsService,
    AudioAnalysisProcessor,
    AudioAnalysisWorker,
    SameMomentGroupingService,
  ],
  exports: [ClipAudioAnalysesRepository, SameMomentGroupingService],
})
export class AudioAnalysisModule {}
