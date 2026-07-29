import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StoryMentionProcessingResult,
  StoryMentionProcessor,
} from './story-mention.processor';
import { WebhookEventsRepository } from './webhook-events.repository';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export interface StoryMentionWorkerSummary {
  processed: number;
  failed: number;
  requeued: number;
  abandoned: number;
}

@Injectable()
export class StoryMentionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(StoryMentionWorker.name);
  private readonly enabled: boolean;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly staleAfterMs: number;
  private readonly maxAttempts: number;

  private timer: NodeJS.Timeout | undefined;
  private activeRun: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly storyMentionProcessor: StoryMentionProcessor,
    private readonly webhookEventsRepository: WebhookEventsRepository,
  ) {
    const defaultEnabled =
      this.configService.get<string>('NODE_ENV') !== 'test';

    this.enabled = this.readBoolean(
      'STORY_MENTION_WORKER_ENABLED',
      defaultEnabled,
    );
    this.pollIntervalMs = this.readBoundedInteger(
      'STORY_MENTION_WORKER_POLL_INTERVAL_MS',
      DEFAULT_POLL_INTERVAL_MS,
      250,
      60_000,
    );
    this.batchSize = this.readBoundedInteger(
      'STORY_MENTION_WORKER_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
      1,
      100,
    );
    this.staleAfterMs = this.readBoundedInteger(
      'STORY_MENTION_WORKER_STALE_AFTER_MS',
      DEFAULT_STALE_AFTER_MS,
      30_000,
      24 * 60 * 60 * 1_000,
    );
    this.maxAttempts = this.readBoundedInteger(
      'STORY_MENTION_WORKER_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
      1,
      20,
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Story mention worker is disabled');
      return;
    }

    this.logger.log(
      `Story mention worker started with a ${this.pollIntervalMs}ms interval and batch size ${this.batchSize}`,
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

    if (this.enabled) {
      this.logger.log('Story mention worker stopped');
    }
  }

  async runOnce(): Promise<StoryMentionWorkerSummary> {
    const staleBefore = new Date(Date.now() - this.staleAfterMs);
    const recoveredEvents =
      await this.webhookEventsRepository.recoverStaleProcessingByType(
        'story_mention',
        staleBefore,
        this.maxAttempts,
      );

    const summary: StoryMentionWorkerSummary = {
      processed: 0,
      failed: 0,
      requeued: recoveredEvents.filter((event) => event.status === 'pending')
        .length,
      abandoned: recoveredEvents.filter((event) => event.status === 'failed')
        .length,
    };

    for (let index = 0; index < this.batchSize; index += 1) {
      const result = await this.storyMentionProcessor.processNext();

      if (result.status === 'idle') {
        break;
      }

      this.recordResult(summary, result);
    }

    return summary;
  }

  private recordResult(
    summary: StoryMentionWorkerSummary,
    result: Exclude<StoryMentionProcessingResult, { status: 'idle' }>,
  ): void {
    if (result.status === 'processed') {
      summary.processed += 1;
    } else {
      summary.failed += 1;
    }
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
        this.scheduleNext(this.pollIntervalMs);
      });
    }, delayMs);

    this.timer.unref();
  }

  private async runScheduledCycle(): Promise<void> {
    try {
      const summary = await this.runOnce();
      const activity =
        summary.processed +
        summary.failed +
        summary.requeued +
        summary.abandoned;

      if (activity > 0) {
        this.logger.log(
          `Story mention worker cycle: ${summary.processed} processed, ${summary.failed} failed, ${summary.requeued} requeued, ${summary.abandoned} abandoned`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Story mention worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private readBoolean(name: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(name);

    if (value === undefined) {
      return fallback;
    }

    if (value === 'true' || value === '1') {
      return true;
    }

    if (value === 'false' || value === '0') {
      return false;
    }

    this.logger.warn(
      `${name} must be true, false, 1, or 0; using ${String(fallback)}`,
    );

    return fallback;
  }

  private readBoundedInteger(
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = this.configService.get<string>(name);

    if (value === undefined) {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      this.logger.warn(
        `${name} must be an integer between ${minimum} and ${maximum}; using ${fallback}`,
      );

      return fallback;
    }

    return parsed;
  }
}
