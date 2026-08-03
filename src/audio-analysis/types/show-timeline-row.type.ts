export interface ShowTimelineRow {
  show_id: string;
  show_name: string;
  show_starts_at: Date | null;
  show_status: string;
  reference_track_id: string;
  reference_track_title: string;
  reference_track_artist_name: string | null;
  reference_storage_bucket: string;
  reference_storage_path: string;
  reference_created_at: Date;
  clip_id: string | null;
  media_asset_id: string | null;
  media_storage_bucket: string | null;
  media_storage_path: string | null;
  media_mime_type: string | null;
  fan_instagram_scoped_user_id: string | null;
  reference_offset_ms: string | null;
  matched_duration_ms: string | null;
  fingerprint_similarity: number | null;
  peak_margin: number | null;
}
