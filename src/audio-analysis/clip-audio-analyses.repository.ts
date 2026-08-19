import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import {
  ClaimedClipAudioAnalysisRow,
  ClipAudioAnalysisResultRow,
  ClipAudioAnalysisRow,
} from './types/clip-audio-analysis-row.type';

const PROVIDER = 'concert_sequence';

export interface CompleteMatchedAnalysisInput {
  id: string;
  referenceTrackId: string;
  fingerprintSimilarity: number;
  secondBestSimilarity: number;
  peakMargin: number;
  timeScale: number;
  pitchShiftCents: number;
  pitchSimilarity: number;
  pitchMargin: number;
  referenceOffsetMs: number;
  matchedDurationMs: number;
}

export interface CompleteNoMatchAnalysisInput {
  id: string;
  fingerprintSimilarity: number;
  secondBestSimilarity: number;
  peakMargin: number;
  timeScale: number;
}

@Injectable()
export class ClipAudioAnalysesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async enqueueForStoredMediaAsset(
    mediaAssetId: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<ClipAudioAnalysisRow | null> {
    const result = await executor.query<ClipAudioAnalysisRow>(
      `
        INSERT INTO public.clip_audio_analyses AS analysis (
          clip_id,
          media_asset_id,
          catalogue_id,
          show_id,
          provider,
          status
        )
        SELECT
          clip.id,
          media_asset.id,
          catalogue.id,
          clip.show_id,
          $2,
          'pending'
        FROM public.media_assets AS media_asset
        INNER JOIN public.clips AS clip
          ON clip.id = media_asset.clip_id
        INNER JOIN public.audio_reference_catalogues AS catalogue
          ON catalogue.show_id = clip.show_id
        WHERE media_asset.id = $1
          AND media_asset.status = 'stored'
          AND (
            media_asset.mime_type LIKE 'video/%'
            OR media_asset.mime_type LIKE 'audio/%'
          )
          AND EXISTS (
            SELECT 1
            FROM public.audio_reference_tracks AS reference_track
            WHERE reference_track.catalogue_id = catalogue.id
              AND reference_track.status = 'ready'
          )
        ON CONFLICT (clip_id, catalogue_id, provider)
        DO UPDATE SET media_asset_id = EXCLUDED.media_asset_id,
                      status = 'pending',
                      matched_reference_track_id = NULL,
                      fingerprint_similarity = NULL,
                      second_best_similarity = NULL,
                      peak_margin = NULL,
                      time_scale = NULL,
                      pitch_shift_cents = NULL,
                      pitch_similarity = NULL,
                      pitch_margin = NULL,
                      reference_offset_ms = NULL,
                      matched_duration_ms = NULL,
                      attempt_count = 0,
                      error_message = NULL,
                      processing_started_at = NULL,
                      next_attempt_at = NULL,
                      completed_at = NULL
        WHERE analysis.status IN ('failed', 'no_match')
        RETURNING analysis.*
      `,
      [mediaAssetId, PROVIDER],
    );
    return result.rows[0] ?? null;
  }

  async enqueueStoredClipsForCatalogue(
    catalogueId: string,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<number> {
    const result = await executor.query<ClipAudioAnalysisRow>(
      `
        INSERT INTO public.clip_audio_analyses AS analysis (
          clip_id,
          media_asset_id,
          catalogue_id,
          show_id,
          provider,
          status
        )
        SELECT
          clip.id,
          preferred_asset.id,
          catalogue.id,
          catalogue.show_id,
          $2,
          'pending'
        FROM public.audio_reference_catalogues AS catalogue
        INNER JOIN public.clips AS clip
          ON clip.show_id = catalogue.show_id
        INNER JOIN LATERAL (
          SELECT media_asset.id
          FROM public.media_assets AS media_asset
          WHERE media_asset.clip_id = clip.id
            AND media_asset.status = 'stored'
            AND (
              media_asset.mime_type LIKE 'video/%'
              OR media_asset.mime_type LIKE 'audio/%'
            )
          ORDER BY
            (media_asset.asset_type = 'fan_original') DESC,
            media_asset.stored_at DESC,
            media_asset.id
          LIMIT 1
        ) AS preferred_asset ON TRUE
        WHERE catalogue.id = $1
          AND EXISTS (
            SELECT 1
            FROM public.audio_reference_tracks AS reference_track
            WHERE reference_track.catalogue_id = catalogue.id
              AND reference_track.status = 'ready'
          )
        ON CONFLICT (clip_id, catalogue_id, provider)
        DO UPDATE SET media_asset_id = EXCLUDED.media_asset_id,
                      status = 'pending',
                      matched_reference_track_id = NULL,
                      fingerprint_similarity = NULL,
                      second_best_similarity = NULL,
                      peak_margin = NULL,
                      time_scale = NULL,
                      pitch_shift_cents = NULL,
                      pitch_similarity = NULL,
                      pitch_margin = NULL,
                      reference_offset_ms = NULL,
                      matched_duration_ms = NULL,
                      attempt_count = 0,
                      error_message = NULL,
                      processing_started_at = NULL,
                      next_attempt_at = NULL,
                      completed_at = NULL
        WHERE analysis.status IN ('failed', 'no_match')
        RETURNING analysis.*
      `,
      [catalogueId, PROVIDER],
    );
    return result.rowCount ?? result.rows.length;
  }

  async claimNextPending(): Promise<ClaimedClipAudioAnalysisRow | null> {
    const result =
      await this.databaseService.query<ClaimedClipAudioAnalysisRow>(
        `
          WITH next_analysis AS (
            SELECT id
            FROM public.clip_audio_analyses
            WHERE status = 'pending'
              AND (
                next_attempt_at IS NULL
                OR next_attempt_at <= NOW()
              )
            ORDER BY created_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          ), claimed AS (
            UPDATE public.clip_audio_analyses AS analysis
            SET status = 'processing',
                attempt_count = analysis.attempt_count + 1,
                error_message = NULL,
                processing_started_at = NOW(),
                next_attempt_at = NULL,
                completed_at = NULL
            FROM next_analysis
            WHERE analysis.id = next_analysis.id
            RETURNING analysis.*
          )
          SELECT
            claimed.*,
            media_asset.storage_bucket AS media_storage_bucket,
            media_asset.storage_path AS media_storage_path
          FROM claimed
          INNER JOIN public.media_assets AS media_asset
            ON media_asset.id = claimed.media_asset_id
          WHERE media_asset.status = 'stored'
            AND media_asset.storage_bucket IS NOT NULL
            AND media_asset.storage_path IS NOT NULL
        `,
      );
    return result.rows[0] ?? null;
  }

  async markMatched(
    input: CompleteMatchedAnalysisInput,
  ): Promise<ClipAudioAnalysisRow | null> {
    const result = await this.databaseService.query<ClipAudioAnalysisRow>(
      `
        UPDATE public.clip_audio_analyses
        SET status = 'matched',
            matched_reference_track_id = $2,
            fingerprint_similarity = $3,
            second_best_similarity = $4,
            peak_margin = $5,
            time_scale = $6,
            pitch_shift_cents = $7,
            pitch_similarity = $8,
            pitch_margin = $9,
            reference_offset_ms = $10,
            matched_duration_ms = $11,
            error_message = NULL,
            processing_started_at = NULL,
            next_attempt_at = NULL,
            completed_at = NOW()
        WHERE id = $1
          AND status = 'processing'
        RETURNING *
      `,
      [
        input.id,
        input.referenceTrackId,
        input.fingerprintSimilarity,
        input.secondBestSimilarity,
        input.peakMargin,
        input.timeScale,
        input.pitchShiftCents,
        input.pitchSimilarity,
        input.pitchMargin,
        input.referenceOffsetMs,
        input.matchedDurationMs,
      ],
    );
    return result.rows[0] ?? null;
  }

  async markNoMatch(
    input: CompleteNoMatchAnalysisInput,
  ): Promise<ClipAudioAnalysisRow | null> {
    const result = await this.databaseService.query<ClipAudioAnalysisRow>(
      `
        UPDATE public.clip_audio_analyses
        SET status = 'no_match',
            matched_reference_track_id = NULL,
            fingerprint_similarity = $2,
            second_best_similarity = $3,
            peak_margin = $4,
            time_scale = $5,
            pitch_shift_cents = NULL,
            pitch_similarity = NULL,
            pitch_margin = NULL,
            reference_offset_ms = NULL,
            matched_duration_ms = NULL,
            error_message = NULL,
            processing_started_at = NULL,
            next_attempt_at = NULL,
            completed_at = NOW()
        WHERE id = $1
          AND status = 'processing'
        RETURNING *
      `,
      [
        input.id,
        input.fingerprintSimilarity,
        input.secondBestSimilarity,
        input.peakMargin,
        input.timeScale,
      ],
    );
    return result.rows[0] ?? null;
  }

  async releaseAfterFailure(
    id: string,
    errorMessage: string,
    maxAttempts: number,
    nextAttemptAt: Date,
  ): Promise<ClipAudioAnalysisRow | null> {
    const result = await this.databaseService.query<ClipAudioAnalysisRow>(
      `
        UPDATE public.clip_audio_analyses
        SET status = CASE
              WHEN attempt_count >= $3 THEN 'failed'
              ELSE 'pending'
            END,
            error_message = $2,
            processing_started_at = NULL,
            next_attempt_at = CASE
              WHEN attempt_count >= $3 THEN NULL
              ELSE $4
            END,
            completed_at = CASE
              WHEN attempt_count >= $3 THEN NOW()
              ELSE NULL
            END
        WHERE id = $1
          AND status = 'processing'
        RETURNING *
      `,
      [id, errorMessage, maxAttempts, nextAttemptAt],
    );
    return result.rows[0] ?? null;
  }

  async recoverStaleProcessing(
    staleBefore: Date,
    maxAttempts: number,
  ): Promise<ClipAudioAnalysisRow[]> {
    const result = await this.databaseService.query<ClipAudioAnalysisRow>(
      `
        UPDATE public.clip_audio_analyses
        SET status = CASE
              WHEN attempt_count >= $2 THEN 'failed'
              ELSE 'pending'
            END,
            error_message = $3,
            processing_started_at = NULL,
            next_attempt_at = CASE
              WHEN attempt_count >= $2 THEN NULL
              ELSE NOW()
            END,
            completed_at = CASE
              WHEN attempt_count >= $2 THEN NOW()
              ELSE NULL
            END
        WHERE status = 'processing'
          AND processing_started_at < $1
        RETURNING *
      `,
      [staleBefore, maxAttempts, 'Audio analysis lease expired'],
    );
    return result.rows;
  }

  async retry(
    id: string,
    workspaceId?: string,
  ): Promise<ClipAudioAnalysisRow | null> {
    const result = await this.databaseService.query<ClipAudioAnalysisRow>(
      `
        UPDATE public.clip_audio_analyses
        SET status = 'pending',
            matched_reference_track_id = NULL,
            fingerprint_similarity = NULL,
            second_best_similarity = NULL,
            peak_margin = NULL,
            time_scale = NULL,
            pitch_shift_cents = NULL,
            pitch_similarity = NULL,
            pitch_margin = NULL,
            reference_offset_ms = NULL,
            matched_duration_ms = NULL,
            attempt_count = 0,
            error_message = NULL,
            processing_started_at = NULL,
            next_attempt_at = NULL,
            completed_at = NULL
        WHERE id = $1
          AND status IN ('failed', 'no_match')
          AND (
            $2::uuid IS NULL
            OR EXISTS (
              SELECT 1
              FROM public.shows AS show
              WHERE show.id = clip_audio_analyses.show_id
                AND show.workspace_id = $2
            )
          )
        RETURNING *
      `,
      [id, workspaceId ?? null],
    );
    return result.rows[0] ?? null;
  }

  async listForClip(
    clipId: string,
    workspaceId?: string,
  ): Promise<ClipAudioAnalysisResultRow[]> {
    const result = await this.databaseService.query<ClipAudioAnalysisResultRow>(
      `
          SELECT
            analysis.*,
            show.name AS show_name,
            catalogue.name AS catalogue_name,
            reference_track.title AS matched_reference_track_title,
            reference_track.artist_name AS matched_reference_track_artist_name
          FROM public.clip_audio_analyses AS analysis
          INNER JOIN public.audio_reference_catalogues AS catalogue
            ON catalogue.id = analysis.catalogue_id
          INNER JOIN public.shows AS show
            ON show.id = analysis.show_id
          LEFT JOIN public.audio_reference_tracks AS reference_track
            ON reference_track.id = analysis.matched_reference_track_id
          WHERE analysis.clip_id = $1
            AND ($2::uuid IS NULL OR show.workspace_id = $2)
          ORDER BY analysis.created_at DESC, analysis.id DESC
        `,
      [clipId, workspaceId ?? null],
    );
    return result.rows;
  }
}
