export type ClipAudioDerivativeStatus =
  'pending' | 'processing' | 'ready' | 'failed';

export interface ClipAudioDerivativeRow {
  id: string;
  analysis_id: string;
  kind: 'reference_normalized_stem';
  algorithm_version: string;
  status: ClipAudioDerivativeStatus;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: string | null;
  rendered_duration_ms: string | null;
  attempt_count: number;
  error_message: string | null;
  processing_started_at: Date | null;
  next_attempt_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ClaimedClipAudioDerivativeRow extends ClipAudioDerivativeRow {
  media_storage_bucket: string;
  media_storage_path: string;
  time_scale: number;
  pitch_shift_cents: number;
  matched_duration_ms: string;
}
