import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

@Injectable()
export class AudioAnalysisConfig {
  private readonly logger = new Logger(AudioAnalysisConfig.name);

  readonly enabled: boolean;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  readonly staleAfterMs: number;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly processTimeoutMs: number;
  readonly signedUrlTtlSeconds: number;
  readonly maximumReferenceBytes: number;
  readonly referenceStorageBucket: string;
  readonly pythonExecutable: string;
  readonly analyserWorkingDirectory: string;

  constructor(private readonly configService: ConfigService) {
    this.analyserWorkingDirectory = resolve(
      this.configService.get<string>('AUDIO_ANALYSIS_DIRECTORY') ??
        'audio-analysis',
    );
    this.pythonExecutable = resolve(
      this.configService.get<string>('AUDIO_ANALYSIS_PYTHON_PATH') ??
        'audio-analysis/.venv/bin/python',
    );

    const defaultEnabled =
      this.configService.get<string>('NODE_ENV') !== 'test' &&
      existsSync(this.pythonExecutable);
    const requestedEnabled = this.readBoolean(
      'AUDIO_ANALYSIS_WORKER_ENABLED',
      defaultEnabled,
    );
    this.enabled = requestedEnabled && existsSync(this.pythonExecutable);
    this.pollIntervalMs = this.readBoundedInteger(
      'AUDIO_ANALYSIS_WORKER_POLL_INTERVAL_MS',
      5_000,
      500,
      60_000,
    );
    this.batchSize = this.readBoundedInteger(
      'AUDIO_ANALYSIS_WORKER_BATCH_SIZE',
      1,
      1,
      10,
    );
    this.staleAfterMs = this.readBoundedInteger(
      'AUDIO_ANALYSIS_WORKER_STALE_AFTER_MS',
      10 * 60 * 1_000,
      60_000,
      24 * 60 * 60 * 1_000,
    );
    this.maxAttempts = this.readBoundedInteger(
      'AUDIO_ANALYSIS_WORKER_MAX_ATTEMPTS',
      3,
      1,
      10,
    );
    this.retryDelayMs = this.readBoundedInteger(
      'AUDIO_ANALYSIS_WORKER_RETRY_DELAY_MS',
      60_000,
      1_000,
      60 * 60 * 1_000,
    );
    this.processTimeoutMs = this.readBoundedInteger(
      'AUDIO_ANALYSIS_PROCESS_TIMEOUT_MS',
      5 * 60 * 1_000,
      5_000,
      30 * 60 * 1_000,
    );
    this.signedUrlTtlSeconds = this.readBoundedInteger(
      'AUDIO_ANALYSIS_SIGNED_URL_TTL_SECONDS',
      15 * 60,
      60,
      60 * 60,
    );
    this.maximumReferenceBytes = this.readBoundedInteger(
      'AUDIO_REFERENCE_MAX_BYTES',
      100 * 1024 * 1024,
      1,
      100 * 1024 * 1024,
    );
    this.referenceStorageBucket =
      this.configService.get<string>('AUDIO_REFERENCE_STORAGE_BUCKET') ??
      'audio-references';
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(this.referenceStorageBucket)) {
      throw new Error('AUDIO_REFERENCE_STORAGE_BUCKET is invalid');
    }

    if (requestedEnabled && !existsSync(this.pythonExecutable)) {
      this.logger.warn(
        `Audio analysis worker requires Python at ${this.pythonExecutable}; worker disabled`,
      );
    }
  }

  private readBoolean(name: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(name);
    if (value === undefined) return fallback;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
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
    if (value === undefined) return fallback;
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
