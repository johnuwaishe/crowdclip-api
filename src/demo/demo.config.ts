import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dirname, isAbsolute } from 'node:path';

@Injectable()
export class DemoConfig {
  readonly storageBucket: string;
  readonly signedUrlTtlSeconds: number;
  readonly maximumExcerptBytes: number;
  readonly maximumSourceBytes: number;
  readonly sourceDownloadTimeoutMs: number;
  readonly downloadTimeoutMs: number;
  readonly pythonBinDirectory: string | null;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  readonly referenceAudioPath: string | null;
  readonly maximumReferenceAudioBytes: number;
  readonly referenceArtworkPath: string | null;

  constructor(private readonly configService: ConfigService) {
    this.storageBucket =
      this.configService.get<string>('DEMO_MEDIA_STORAGE_BUCKET') ??
      'demo-media';
    this.signedUrlTtlSeconds = this.readInteger(
      'DEMO_MEDIA_SIGNED_URL_TTL_SECONDS',
      60 * 60,
      60,
      24 * 60 * 60,
    );
    this.maximumExcerptBytes = this.readInteger(
      'DEMO_MEDIA_MAX_BYTES',
      25 * 1024 * 1024,
      1,
      25 * 1024 * 1024,
    );
    this.maximumSourceBytes = this.readInteger(
      'DEMO_MEDIA_MAX_SOURCE_BYTES',
      400 * 1024 * 1024,
      1024 * 1024,
      2 * 1024 * 1024 * 1024,
    );
    this.downloadTimeoutMs = this.readInteger(
      'DEMO_MEDIA_DOWNLOAD_TIMEOUT_MS',
      2 * 60 * 1_000,
      10_000,
      10 * 60 * 1_000,
    );
    this.sourceDownloadTimeoutMs = this.readInteger(
      'DEMO_MEDIA_SOURCE_TIMEOUT_MS',
      15 * 60 * 1_000,
      30_000,
      60 * 60 * 1_000,
    );

    const pythonPath = this.configService.get<string>('DEMO_MEDIA_PYTHON_PATH');
    if (pythonPath && !isAbsolute(pythonPath)) {
      throw new Error('DEMO_MEDIA_PYTHON_PATH must be an absolute path');
    }
    this.pythonBinDirectory = pythonPath ? dirname(pythonPath) : null;
    this.ffmpegPath =
      this.configService.get<string>('DEMO_MEDIA_FFMPEG_PATH') || 'ffmpeg';
    this.ffprobePath =
      this.configService.get<string>('DEMO_MEDIA_FFPROBE_PATH') || 'ffprobe';

    const referenceAudioPath = this.configService.get<string>(
      'DEMO_REFERENCE_AUDIO_PATH',
    );
    if (referenceAudioPath && !isAbsolute(referenceAudioPath)) {
      throw new Error('DEMO_REFERENCE_AUDIO_PATH must be an absolute path');
    }
    this.referenceAudioPath = referenceAudioPath?.trim() || null;

    const referenceArtworkPath = this.configService.get<string>(
      'DEMO_REFERENCE_ARTWORK_PATH',
    );
    if (referenceArtworkPath && !isAbsolute(referenceArtworkPath)) {
      throw new Error('DEMO_REFERENCE_ARTWORK_PATH must be an absolute path');
    }
    this.referenceArtworkPath = referenceArtworkPath?.trim() || null;

    this.maximumReferenceAudioBytes = this.readInteger(
      'DEMO_REFERENCE_AUDIO_MAX_BYTES',
      12 * 1024 * 1024,
      1,
      25 * 1024 * 1024,
    );

    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(this.storageBucket)) {
      throw new Error('DEMO_MEDIA_STORAGE_BUCKET has an invalid bucket name');
    }
  }

  private readInteger(
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = this.configService.get<string>(name);
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new Error(
        `${name} must be an integer between ${minimum} and ${maximum}`,
      );
    }
    return parsed;
  }
}
