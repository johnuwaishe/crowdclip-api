import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { ClipAudioDerivativesRepository } from './clip-audio-derivatives.repository';
import { AudioStemProcessor } from './audio-stem.processor';

@Injectable()
export class AudioStemWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AudioStemWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private active: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly config: AudioAnalysisConfig,
    private readonly processor: AudioStemProcessor,
    private readonly derivatives: ClipAudioDerivativesRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.stemRendererEnabled) {
      this.logger.log(
        'Audio stem renderer is disabled; normalization jobs remain pending',
      );
      return;
    }
    this.schedule(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.active) await this.active;
  }

  async runOnce(): Promise<void> {
    await this.derivatives.recoverStaleProcessing(
      new Date(Date.now() - this.config.staleAfterMs),
      this.config.maxAttempts,
    );
    for (let index = 0; index < this.config.batchSize; index += 1) {
      if ((await this.processor.processNext()).status === 'idle') break;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.active = this.runOnce().catch((error) =>
        this.logger.error(
          'Audio stem worker cycle failed',
          error instanceof Error ? error.stack : undefined,
        ),
      );
      void this.active.finally(() => {
        this.active = null;
        this.schedule(this.config.pollIntervalMs);
      });
    }, delayMs);
    this.timer.unref();
  }
}
