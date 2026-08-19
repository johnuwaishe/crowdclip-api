export type ClipAudioAnalysisStatus =
  'pending' | 'processing' | 'matched' | 'no_match' | 'failed';

export interface ClipAudioAnalysisRow {
  id: string;
  clip_id: string;
  media_asset_id: string;
  catalogue_id: string;
  show_id: string;
  matched_reference_track_id: string | null;
  provider: string;
  status: ClipAudioAnalysisStatus;
  fingerprint_similarity: number | null;
  second_best_similarity: number | null;
  peak_margin: number | null;
  time_scale: number | null;
  pitch_shift_cents: number | null;
  pitch_similarity: number | null;
  pitch_margin: number | null;
  reference_offset_ms: string | null;
  matched_duration_ms: string | null;
  attempt_count: number;
  error_message: string | null;
  processing_started_at: Date | null;
  next_attempt_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ClaimedClipAudioAnalysisRow extends ClipAudioAnalysisRow {
  media_storage_bucket: string;
  media_storage_path: string;
}

export interface ClipAudioAnalysisResultRow extends ClipAudioAnalysisRow {
  show_name: string;
  catalogue_name: string;
  matched_reference_track_title: string | null;
  matched_reference_track_artist_name: string | null;
}
