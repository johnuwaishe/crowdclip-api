import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { MediaAssetsRepository } from '../clips/media-assets.repository';
import { MediaDownloadConfig } from './media-download.config';
import {
  MediaDownloadProcessingResult,
  MediaDownloadProcessor,
} from './media-download.processor';

export interface MediaDownloadWorkerSummary {
  stored: number;
  retrying: number;
  failed: number;
  requeued: number;
  abandoned: number;
}

@Injectable()
export class MediaDownloadWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MediaDownloadWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private activeRun: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly config: MediaDownloadConfig,
    private readonly processor: MediaDownloadProcessor,
    private readonly mediaAssetsRepository: MediaAssetsRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      this.logger.log('Media download worker is disabled');
      return;
    }

    this.logger.log(
      `Media download worker started with a ${this.config.pollIntervalMs}ms interval and batch size ${this.config.batchSize}`,
    );
    this.scheduleNext(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.activeRun) {
      await this.activeRun;
    }

    if (this.config.enabled) {
      this.logger.log('Media download worker stopped');
    }
  }

  async runOnce(): Promise<MediaDownloadWorkerSummary> {
    const staleBefore = new Date(Date.now() - this.config.staleAfterMs);
    const recoveredAssets =
      await this.mediaAssetsRepository.recoverStaleDownloads(
        staleBefore,
        this.config.maxAttempts,
      );

    const summary: MediaDownloadWorkerSummary = {
      stored: 0,
      retrying: 0,
      failed: 0,
      requeued: recoveredAssets.filter((asset) => asset.status === 'pending')
        .length,
      abandoned: recoveredAssets.filter((asset) => asset.status === 'failed')
        .length,
    };

    for (let index = 0; index < this.config.batchSize; index += 1) {
      const result = await this.processor.processNext();

      if (result.status === 'idle') {
        break;
      }

      this.recordResult(summary, result);
    }

    return summary;
  }

  private recordResult(
    summary: MediaDownloadWorkerSummary,
    result: Exclude<MediaDownloadProcessingResult, { status: 'idle' }>,
  ): void {
    summary[result.status] += 1;
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopping) {
      return;
    }

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
        summary.stored +
        summary.retrying +
        summary.failed +
        summary.requeued +
        summary.abandoned;

      if (activity > 0) {
        this.logger.log(
          `Media download worker cycle: ${summary.stored} stored, ${summary.retrying} retrying, ${summary.failed} failed, ${summary.requeued} requeued, ${summary.abandoned} abandoned`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Media download worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
