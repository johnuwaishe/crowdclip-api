import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DemoReferenceTrackRow } from './types/demo-reference-track-row.type';

@Injectable()
export class DemoReferenceTracksRepository {
  constructor(private readonly database: DatabaseService) {}

  async upsert(
    demoId: string,
    track: { artist: string; title: string; durationMs: number },
  ): Promise<DemoReferenceTrackRow> {
    const result = await this.database.query<DemoReferenceTrackRow>(
      `
        INSERT INTO public.demo_reference_tracks (demo_id, artist, title, duration_ms)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (demo_id) DO UPDATE SET
          artist = EXCLUDED.artist,
          title = EXCLUDED.title,
          duration_ms = EXCLUDED.duration_ms
        RETURNING *
      `,
      [demoId, track.artist, track.title, track.durationMs],
    );
    return result.rows[0];
  }

  async get(demoId: string): Promise<DemoReferenceTrackRow | null> {
    const result = await this.database.query<DemoReferenceTrackRow>(
      'SELECT * FROM public.demo_reference_tracks WHERE demo_id = $1',
      [demoId],
    );
    return result.rows[0] ?? null;
  }

  async markIngesting(demoId: string): Promise<void> {
    await this.database.query(
      `UPDATE public.demo_reference_tracks
       SET status = 'ingesting', last_error = NULL
       WHERE demo_id = $1 AND status IN ('pending', 'failed')`,
      [demoId],
    );
  }

  async markStored(input: {
    demoId: string;
    bucket: string;
    path: string;
    mimeType: string;
    byteSize: number;
    peaks: number[];
  }): Promise<void> {
    await this.database.query(
      `UPDATE public.demo_reference_tracks
       SET status = 'stored', storage_bucket = $2, storage_path = $3,
           mime_type = $4, byte_size = $5, peaks = $6, stored_at = NOW(),
           last_error = NULL
       WHERE demo_id = $1 AND status = 'ingesting'`,
      [
        input.demoId,
        input.bucket,
        input.path,
        input.mimeType,
        input.byteSize,
        input.peaks,
      ],
    );
  }

  async markArtworkStored(input: {
    demoId: string;
    bucket: string;
    path: string;
    mimeType: string;
  }): Promise<void> {
    await this.database.query(
      `UPDATE public.demo_reference_tracks
       SET artwork_bucket = $2, artwork_path = $3, artwork_mime_type = $4
       WHERE demo_id = $1`,
      [input.demoId, input.bucket, input.path, input.mimeType],
    );
  }

  async markFailed(demoId: string, error: string): Promise<void> {
    await this.database.query(
      `UPDATE public.demo_reference_tracks
       SET status = 'failed', last_error = $2
       WHERE demo_id = $1 AND status = 'ingesting'`,
      [demoId, error.slice(0, 1000)],
    );
  }
}
