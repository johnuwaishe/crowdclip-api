import { Injectable, Logger } from '@nestjs/common';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { ClipAudioDerivativesRepository } from './clip-audio-derivatives.repository';
import { ReferenceNormalizedStemRenderer } from './reference-normalized-stem.renderer';

export type AudioStemProcessingResult =
  | { status: 'idle' }
  | { status: 'ready'; derivativeId: string }
  | { status: 'retrying' | 'failed'; derivativeId: string; error: string };

@Injectable()
export class AudioStemProcessor {
  private readonly logger = new Logger(AudioStemProcessor.name);

  constructor(
    private readonly config: AudioAnalysisConfig,
    private readonly storage: SupabaseObjectStorage,
    private readonly derivatives: ClipAudioDerivativesRepository,
    private readonly renderer: ReferenceNormalizedStemRenderer,
  ) {}

  async processNext(): Promise<AudioStemProcessingResult> {
    const derivative = await this.derivatives.claimNextPending();
    if (!derivative) return { status: 'idle' };

    try {
      const source = await this.storage.createSignedUrl({
        bucket: derivative.media_storage_bucket,
        path: derivative.media_storage_path,
        expiresInSeconds: this.config.signedUrlTtlSeconds,
      });
      const rendered = await this.renderer.render({
        source,
        timeScale: derivative.time_scale,
        pitchShiftCents: derivative.pitch_shift_cents,
        targetDurationMs: Number(derivative.matched_duration_ms),
      });
      const safeVersion = derivative.algorithm_version.replace(
        /[^a-zA-Z0-9._-]/g,
        '-',
      );
      const path = `normalized-audio/${derivative.analysis_id}/${safeVersion}.m4a`;
      await this.storage.upload({
        bucket: this.config.normalizedStemStorageBucket,
        path,
        data: rendered.data,
        contentType: rendered.contentType,
        cacheControlSeconds: 31_536_000,
      });
      const ready = await this.derivatives.markReady({
        id: derivative.id,
        bucket: this.config.normalizedStemStorageBucket,
        path,
        mimeType: rendered.contentType,
        byteSize: rendered.data.byteLength,
        renderedDurationMs: rendered.durationMs,
      });
      if (!ready)
        throw new Error(
          'Audio stem could not be completed from its current state',
        );
      return { status: 'ready', derivativeId: derivative.id };
    } catch (error) {
      const message = (
        error instanceof Error ? error.message : 'Unknown stem rendering error'
      ).slice(0, 2_000);
      const released = await this.derivatives.releaseAfterFailure(
        derivative.id,
        message,
        this.config.maxAttempts,
        new Date(Date.now() + this.config.retryDelayMs),
      );
      if (!released)
        throw new Error('Audio stem could not be released after failure', {
          cause: error,
        });
      this.logger.error(`Audio stem ${derivative.id} failed: ${message}`);
      return {
        status: released.status === 'failed' ? 'failed' : 'retrying',
        derivativeId: derivative.id,
        error: message,
      };
    }
  }
}
