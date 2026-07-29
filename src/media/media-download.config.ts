import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MediaDownloadConfig {
  private readonly logger = new Logger(MediaDownloadConfig.name);

  readonly enabled: boolean;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  readonly staleAfterMs: number;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly maxBytes: number;
  readonly downloadTimeoutMs: number;
  readonly uploadTimeoutMs: number;
  readonly signedUrlTimeoutMs: number;
  readonly previewUrlTtlSeconds: number;
  readonly storageBucket: string;

  private readonly supabaseUrl: string | undefined;
  private readonly serviceRoleKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    this.serviceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    const configured = Boolean(this.supabaseUrl && this.serviceRoleKey);
    const defaultEnabled =
      this.configService.get<string>('NODE_ENV') !== 'test' && configured;
    const requestedEnabled = this.readBoolean(
      'MEDIA_DOWNLOAD_WORKER_ENABLED',
      defaultEnabled,
    );

    this.enabled = requestedEnabled && configured;
    this.pollIntervalMs = this.readBoundedInteger(
      'MEDIA_DOWNLOAD_WORKER_POLL_INTERVAL_MS',
      5_000,
      500,
      60_000,
    );
    this.batchSize = this.readBoundedInteger(
      'MEDIA_DOWNLOAD_WORKER_BATCH_SIZE',
      1,
      1,
      10,
    );
    this.staleAfterMs = this.readBoundedInteger(
      'MEDIA_DOWNLOAD_WORKER_STALE_AFTER_MS',
      10 * 60 * 1_000,
      60_000,
      24 * 60 * 60 * 1_000,
    );
    this.maxAttempts = this.readBoundedInteger(
      'MEDIA_DOWNLOAD_WORKER_MAX_ATTEMPTS',
      3,
      1,
      10,
    );
    this.retryDelayMs = this.readBoundedInteger(
      'MEDIA_DOWNLOAD_WORKER_RETRY_DELAY_MS',
      60_000,
      1_000,
      60 * 60 * 1_000,
    );
    this.maxBytes = this.readBoundedInteger(
      'MEDIA_DOWNLOAD_MAX_BYTES',
      50 * 1024 * 1024,
      1,
      50 * 1024 * 1024,
    );
    this.downloadTimeoutMs = this.readBoundedInteger(
      'MEDIA_DOWNLOAD_TIMEOUT_MS',
      30_000,
      1_000,
      5 * 60 * 1_000,
    );
    this.uploadTimeoutMs = this.readBoundedInteger(
      'MEDIA_UPLOAD_TIMEOUT_MS',
      30_000,
      1_000,
      5 * 60 * 1_000,
    );
    this.signedUrlTimeoutMs = this.readBoundedInteger(
      'MEDIA_SIGNED_URL_TIMEOUT_MS',
      5_000,
      1_000,
      30_000,
    );
    this.previewUrlTtlSeconds = this.readBoundedInteger(
      'MEDIA_PREVIEW_URL_TTL_SECONDS',
      5 * 60,
      60,
      60 * 60,
    );
    this.storageBucket =
      this.configService.get<string>('MEDIA_STORAGE_BUCKET') ?? 'clip-media';

    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(this.storageBucket)) {
      throw new Error('MEDIA_STORAGE_BUCKET has an invalid bucket name');
    }

    if (requestedEnabled && !configured) {
      this.logger.warn(
        'Media download worker requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; worker disabled',
      );
    }
  }

  getSupabaseUrl(): string {
    if (!this.supabaseUrl) {
      throw new Error('SUPABASE_URL is required for media storage');
    }

    return this.supabaseUrl;
  }

  getServiceRoleKey(): string {
    if (!this.serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is required for media storage',
      );
    }

    return this.serviceRoleKey;
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
