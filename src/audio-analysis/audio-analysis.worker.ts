import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { AudioAnalysisConfig } from './audio-analysis.config';
import {
  AudioAnalysisProcessingResult,
  AudioAnalysisProcessor,
} from './audio-analysis.processor';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';

export interface AudioAnalysisWorkerSummary {
  matched: number;
  no_match: number;
  retrying: number;
  failed: number;
  requeued: number;
  abandoned: number;
}

@Injectable()
export class AudioAnalysisWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AudioAnalysisWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private activeRun: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly config: AudioAnalysisConfig,
    private readonly processor: AudioAnalysisProcessor,
    private readonly analysesRepository: ClipAudioAnalysesRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      this.logger.log('Audio analysis worker is disabled');
      return;
    }
    this.logger.log(
      `Audio analysis worker started with a ${this.config.pollIntervalMs}ms interval and batch size ${this.config.batchSize}`,
    );
    this.scheduleNext(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.activeRun) await this.activeRun;
    if (this.config.enabled) this.logger.log('Audio analysis worker stopped');
  }

  async runOnce(): Promise<AudioAnalysisWorkerSummary> {
    const staleBefore = new Date(Date.now() - this.config.staleAfterMs);
    const recovered = await this.analysesRepository.recoverStaleProcessing(
      staleBefore,
      this.config.maxAttempts,
    );
    const summary: AudioAnalysisWorkerSummary = {
      matched: 0,
      no_match: 0,
      retrying: 0,
      failed: 0,
      requeued: recovered.filter((analysis) => analysis.status === 'pending')
        .length,
      abandoned: recovered.filter((analysis) => analysis.status === 'failed')
        .length,
    };
    for (let index = 0; index < this.config.batchSize; index += 1) {
      const result = await this.processor.processNext();
      if (result.status === 'idle') break;
      this.record(summary, result);
    }
    return summary;
  }

  private record(
    summary: AudioAnalysisWorkerSummary,
    result: Exclude<AudioAnalysisProcessingResult, { status: 'idle' }>,
  ): void {
    summary[result.status] += 1;
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.activeRun = this.runScheduledCycle();
      void this.activeRun.then(() => {
        this.activeRun = null;
        this.scheduleNext(this.config.pollIntervalMs);
      });
    }, delayMs);
    this.timer.unref();
  }

  private async runScheduledCycle(): Promise<void> {
    try {
      const summary = await this.runOnce();
      const activity =
        summary.matched +
        summary.no_match +
        summary.retrying +
        summary.failed +
        summary.requeued +
        summary.abandoned;
      if (activity > 0) {
        this.logger.log(
          `Audio analysis worker cycle: ${summary.matched} matched, ${summary.no_match} no match, ${summary.retrying} retrying, ${summary.failed} failed, ${summary.requeued} requeued, ${summary.abandoned} abandoned`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Audio analysis worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
