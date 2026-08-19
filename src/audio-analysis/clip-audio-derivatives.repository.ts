import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ClaimedClipAudioDerivativeRow,
  ClipAudioDerivativeRow,
} from './types/clip-audio-derivative-row.type';

@Injectable()
export class ClipAudioDerivativesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async claimNextPending(): Promise<ClaimedClipAudioDerivativeRow | null> {
    const result = await this.databaseService
      .query<ClaimedClipAudioDerivativeRow>(`
        WITH next_derivative AS (
          SELECT id
          FROM public.clip_audio_derivatives
          WHERE status = 'pending'
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          ORDER BY created_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        ), claimed AS (
          UPDATE public.clip_audio_derivatives AS derivative
          SET status = 'processing',
              attempt_count = derivative.attempt_count + 1,
              error_message = NULL,
              processing_started_at = NOW(),
              next_attempt_at = NULL,
              completed_at = NULL
          FROM next_derivative
          WHERE derivative.id = next_derivative.id
          RETURNING derivative.*
        )
        SELECT
          claimed.*,
          media.storage_bucket AS media_storage_bucket,
          media.storage_path AS media_storage_path,
          analysis.time_scale,
          analysis.pitch_shift_cents,
          analysis.matched_duration_ms
        FROM claimed
        INNER JOIN public.clip_audio_analyses AS analysis
          ON analysis.id = claimed.analysis_id
         AND analysis.status = 'matched'
        INNER JOIN public.media_assets AS media
          ON media.id = analysis.media_asset_id
         AND media.status = 'stored'
        WHERE media.storage_bucket IS NOT NULL
          AND media.storage_path IS NOT NULL
          AND analysis.time_scale IS NOT NULL
          AND analysis.pitch_shift_cents IS NOT NULL
          AND analysis.matched_duration_ms IS NOT NULL
      `);
    return result.rows[0] ?? null;
  }

  async markReady(input: {
    id: string;
    bucket: string;
    path: string;
    mimeType: string;
    byteSize: number;
    renderedDurationMs: number;
  }): Promise<ClipAudioDerivativeRow | null> {
    const result = await this.databaseService.query<ClipAudioDerivativeRow>(
      `
        UPDATE public.clip_audio_derivatives
        SET status = 'ready',
            storage_bucket = $2,
            storage_path = $3,
            mime_type = $4,
            byte_size = $5,
            rendered_duration_ms = $6,
            error_message = NULL,
            processing_started_at = NULL,
            next_attempt_at = NULL,
            completed_at = NOW()
        WHERE id = $1 AND status = 'processing'
        RETURNING *
      `,
      [
        input.id,
        input.bucket,
        input.path,
        input.mimeType,
        input.byteSize,
        input.renderedDurationMs,
      ],
    );
    return result.rows[0] ?? null;
  }

  async releaseAfterFailure(
    id: string,
    errorMessage: string,
    maxAttempts: number,
    nextAttemptAt: Date,
  ): Promise<ClipAudioDerivativeRow | null> {
    const result = await this.databaseService.query<ClipAudioDerivativeRow>(
      `
        UPDATE public.clip_audio_derivatives
        SET status = CASE WHEN attempt_count >= $3 THEN 'failed' ELSE 'pending' END,
            error_message = $2,
            processing_started_at = NULL,
            next_attempt_at = CASE WHEN attempt_count >= $3 THEN NULL ELSE $4 END,
            completed_at = CASE WHEN attempt_count >= $3 THEN NOW() ELSE NULL END
        WHERE id = $1 AND status = 'processing'
        RETURNING *
      `,
      [id, errorMessage, maxAttempts, nextAttemptAt],
    );
    return result.rows[0] ?? null;
  }

  async recoverStaleProcessing(
    staleBefore: Date,
    maxAttempts: number,
  ): Promise<ClipAudioDerivativeRow[]> {
    const result = await this.databaseService.query<ClipAudioDerivativeRow>(
      `
        UPDATE public.clip_audio_derivatives
        SET status = CASE WHEN attempt_count >= $2 THEN 'failed' ELSE 'pending' END,
            error_message = 'Audio stem rendering lease expired',
            processing_started_at = NULL,
            next_attempt_at = CASE WHEN attempt_count >= $2 THEN NULL ELSE NOW() END,
            completed_at = CASE WHEN attempt_count >= $2 THEN NOW() ELSE NULL END
        WHERE status = 'processing' AND processing_started_at < $1
        RETURNING *
      `,
      [staleBefore, maxAttempts],
    );
    return result.rows;
  }
}
