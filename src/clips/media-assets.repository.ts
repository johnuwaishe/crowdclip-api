import { Injectable } from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { MediaAssetRow, MediaAssetType } from './types/media-asset-row.type';

export interface FindOrCreateMediaAssetInput {
  clipId: string;
  assetType: MediaAssetType;
  sourceUrl: string | null;
}

export interface StoreMediaAssetInput {
  id: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
}

export interface CreateStoredFanOriginalInput {
  clipId: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
}

@Injectable()
export class MediaAssetsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findStoredByClipAndType(
    clipId: string,
    assetType: MediaAssetType,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<MediaAssetRow | null> {
    const result = await executor.query<MediaAssetRow>(
      `
        SELECT *
        FROM public.media_assets
        WHERE clip_id = $1
          AND asset_type = $2
          AND status = 'stored'
      `,
      [clipId, assetType],
    );

    return result.rows[0] ?? null;
  }

  async createStoredFanOriginal(
    input: CreateStoredFanOriginalInput,
    executor: DatabaseExecutor,
  ): Promise<MediaAssetRow> {
    const insertResult = await executor.query<MediaAssetRow>(
      `
        INSERT INTO public.media_assets (
          clip_id,
          asset_type,
          status,
          storage_bucket,
          storage_path,
          mime_type,
          byte_size,
          stored_at
        )
        VALUES (
          $1,
          'fan_original',
          'stored',
          $2,
          $3,
          $4,
          $5,
          NOW()
        )
        ON CONFLICT (clip_id, asset_type)
        DO NOTHING
        RETURNING *
      `,
      [
        input.clipId,
        input.storageBucket,
        input.storagePath,
        input.mimeType,
        input.byteSize,
      ],
    );

    const insertedAsset = insertResult.rows[0];

    if (insertedAsset) {
      return insertedAsset;
    }

    const existingAsset = await this.findStoredByClipAndType(
      input.clipId,
      'fan_original',
      executor,
    );

    if (!existingAsset) {
      throw new Error(
        'Fan-original media asset exists but is not in the stored state',
      );
    }

    return existingAsset;
  }

  async findOrCreate(
    input: FindOrCreateMediaAssetInput,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<MediaAssetRow> {
    const insertResult = await executor.query<MediaAssetRow>(
      `
        INSERT INTO public.media_assets (
          clip_id,
          asset_type,
          source_url
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (clip_id, asset_type)
        DO NOTHING
        RETURNING *
      `,
      [input.clipId, input.assetType, input.sourceUrl],
    );

    const insertedAsset = insertResult.rows[0];

    if (insertedAsset) {
      return insertedAsset;
    }

    const existingResult = await executor.query<MediaAssetRow>(
      `
        SELECT *
        FROM public.media_assets
        WHERE clip_id = $1
          AND asset_type = $2
      `,
      [input.clipId, input.assetType],
    );

    const existingAsset = existingResult.rows[0];

    if (!existingAsset) {
      throw new Error('Media asset was not found after insert conflict');
    }

    return existingAsset;
  }

  async claimNextPendingInstagramStory(): Promise<MediaAssetRow | null> {
    const result = await this.databaseService.query<MediaAssetRow>(
      `
        WITH next_asset AS (
          SELECT id
          FROM public.media_assets
          WHERE status = 'pending'
            AND asset_type = 'instagram_story'
            AND (
              next_attempt_at IS NULL
              OR next_attempt_at <= NOW()
            )
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE public.media_assets AS media_asset
        SET status = 'downloading',
            attempt_count = media_asset.attempt_count + 1,
            last_error = NULL,
            download_started_at = NOW(),
            next_attempt_at = NULL
        FROM next_asset
        WHERE media_asset.id = next_asset.id
        RETURNING media_asset.*
      `,
    );

    return result.rows[0] ?? null;
  }

  async markStored(
    input: StoreMediaAssetInput,
    executor: DatabaseExecutor = this.databaseService,
  ): Promise<MediaAssetRow | null> {
    const result = await executor.query<MediaAssetRow>(
      `
        UPDATE public.media_assets
        SET status = 'stored',
            source_url = NULL,
            storage_bucket = $2,
            storage_path = $3,
            mime_type = $4,
            byte_size = $5,
            last_error = NULL,
            stored_at = NOW(),
            next_attempt_at = NULL
        WHERE id = $1
          AND status = 'downloading'
        RETURNING *
      `,
      [
        input.id,
        input.storageBucket,
        input.storagePath,
        input.mimeType,
        input.byteSize,
      ],
    );

    return result.rows[0] ?? null;
  }

  async releaseAfterFailure(
    id: string,
    errorMessage: string,
    maxAttempts: number,
    nextAttemptAt: Date,
  ): Promise<MediaAssetRow | null> {
    const result = await this.databaseService.query<MediaAssetRow>(
      `
        UPDATE public.media_assets
        SET status = CASE
              WHEN attempt_count >= $3 THEN 'failed'
              ELSE 'pending'
            END,
            last_error = $2,
            download_started_at = NULL,
            next_attempt_at = CASE
              WHEN attempt_count >= $3 THEN NULL
              ELSE $4
            END
        WHERE id = $1
          AND status = 'downloading'
        RETURNING *
      `,
      [id, errorMessage, maxAttempts, nextAttemptAt],
    );

    return result.rows[0] ?? null;
  }

  async recoverStaleDownloads(
    staleBefore: Date,
    maxAttempts: number,
  ): Promise<MediaAssetRow[]> {
    const result = await this.databaseService.query<MediaAssetRow>(
      `
        UPDATE public.media_assets
        SET status = CASE
              WHEN attempt_count >= $2 THEN 'failed'
              ELSE 'pending'
            END,
            last_error = $3,
            download_started_at = NULL,
            next_attempt_at = CASE
              WHEN attempt_count >= $2 THEN NULL
              ELSE NOW()
            END
        WHERE status = 'downloading'
          AND download_started_at < $1
        RETURNING *
      `,
      [staleBefore, maxAttempts, 'Download lease expired before completion'],
    );

    return result.rows;
  }
}
