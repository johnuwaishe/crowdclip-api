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

@Injectable()
export class MediaAssetsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

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
}
