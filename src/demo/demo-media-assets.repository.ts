import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DemoClipSource } from './casino-demo';
import { DemoMediaAssetRow } from './types/demo-media-asset-row.type';

@Injectable()
export class DemoMediaAssetsRepository {
  constructor(private readonly database: DatabaseService) {}

  async upsert(
    demoId: string,
    source: DemoClipSource,
  ): Promise<DemoMediaAssetRow> {
    const result = await this.database.query<DemoMediaAssetRow>(
      `
        INSERT INTO public.demo_media_assets (
          id, demo_id, creator, venue, city, source_provider, source_url,
          video_id, source_start_ms, reference_start_ms, excerpt_duration_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          demo_id = EXCLUDED.demo_id,
          creator = EXCLUDED.creator,
          venue = EXCLUDED.venue,
          city = EXCLUDED.city,
          source_provider = EXCLUDED.source_provider,
          source_url = EXCLUDED.source_url,
          video_id = EXCLUDED.video_id,
          source_start_ms = EXCLUDED.source_start_ms,
          reference_start_ms = EXCLUDED.reference_start_ms,
          excerpt_duration_ms = EXCLUDED.excerpt_duration_ms
        RETURNING *
      `,
      [
        source.id,
        demoId,
        source.creator,
        source.venue,
        source.city,
        source.platform,
        source.sourceUrl,
        source.videoId,
        source.sourceStartMs,
        source.referenceStartMs,
        source.excerptDurationMs,
      ],
    );
    return result.rows[0];
  }

  async list(demoId: string): Promise<DemoMediaAssetRow[]> {
    const result = await this.database.query<DemoMediaAssetRow>(
      'SELECT * FROM public.demo_media_assets WHERE demo_id = $1 ORDER BY created_at, id',
      [demoId],
    );
    return result.rows;
  }

  async markDownloading(id: string): Promise<void> {
    await this.database.query(
      `UPDATE public.demo_media_assets
       SET status = 'downloading', last_error = NULL
       WHERE id = $1 AND status IN ('pending', 'failed')`,
      [id],
    );
  }

  async markStored(input: {
    id: string;
    bucket: string;
    path: string;
    mimeType: string;
    byteSize: number;
  }): Promise<void> {
    await this.database.query(
      `UPDATE public.demo_media_assets
       SET status = 'stored', storage_bucket = $2, storage_path = $3,
           mime_type = $4, byte_size = $5, stored_at = NOW(), last_error = NULL
       WHERE id = $1 AND status = 'downloading'`,
      [input.id, input.bucket, input.path, input.mimeType, input.byteSize],
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.database.query(
      `UPDATE public.demo_media_assets
       SET status = 'failed', last_error = $2
       WHERE id = $1 AND status = 'downloading'`,
      [id, error.slice(0, 1000)],
    );
  }
}
