import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ShowTimelineRow } from './types/show-timeline-row.type';

@Injectable()
export class ShowTimelineRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async list(showId: string, workspaceId: string): Promise<ShowTimelineRow[]> {
    const result = await this.databaseService.query<ShowTimelineRow>(
      `
        SELECT
          show.id AS show_id,
          show.name AS show_name,
          show.starts_at AS show_starts_at,
          show.status AS show_status,
          reference_track.id AS reference_track_id,
          reference_track.title AS reference_track_title,
          reference_track.artist_name AS reference_track_artist_name,
          reference_track.storage_bucket AS reference_storage_bucket,
          reference_track.storage_path AS reference_storage_path,
          reference_track.created_at AS reference_created_at,
          analysis.clip_id,
          media_asset.id AS media_asset_id,
          media_asset.storage_bucket AS media_storage_bucket,
          media_asset.storage_path AS media_storage_path,
          media_asset.mime_type AS media_mime_type,
          fan.instagram_scoped_user_id AS fan_instagram_scoped_user_id,
          analysis.reference_offset_ms,
          analysis.matched_duration_ms,
          analysis.fingerprint_similarity,
          analysis.peak_margin
          ,analysis.time_scale
          ,analysis.pitch_shift_cents
          ,analysis.pitch_similarity
          ,analysis.pitch_margin
          ,derivative.status AS normalized_audio_status
          ,derivative.storage_bucket AS normalized_audio_storage_bucket
          ,derivative.storage_path AS normalized_audio_storage_path
          ,derivative.mime_type AS normalized_audio_mime_type
          ,derivative.rendered_duration_ms AS normalized_audio_duration_ms
        FROM public.shows AS show
        JOIN public.audio_reference_catalogues AS catalogue
          ON catalogue.show_id = show.id
        JOIN public.audio_reference_tracks AS reference_track
          ON reference_track.catalogue_id = catalogue.id
         AND reference_track.status = 'ready'
        LEFT JOIN public.clip_audio_analyses AS analysis
          ON analysis.show_id = show.id
         AND analysis.matched_reference_track_id = reference_track.id
         AND analysis.status = 'matched'
        LEFT JOIN public.media_assets AS media_asset
          ON media_asset.id = analysis.media_asset_id
         AND media_asset.status = 'stored'
        LEFT JOIN public.clip_audio_derivatives AS derivative
          ON derivative.analysis_id = analysis.id
         AND derivative.kind = 'reference_normalized_stem'
         AND derivative.algorithm_version = 'reference-normalized-v1'
        LEFT JOIN public.clips AS clip
          ON clip.id = analysis.clip_id
        LEFT JOIN public.fans AS fan
          ON fan.id = clip.fan_id
        WHERE show.id = $1
          AND show.workspace_id = $2
        ORDER BY
          reference_track.created_at,
          reference_track.id,
          analysis.reference_offset_ms NULLS LAST,
          analysis.clip_id
      `,
      [showId, workspaceId],
    );
    return result.rows;
  }
}
