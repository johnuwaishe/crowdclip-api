export type AudioReferenceTrackStatus = 'uploading' | 'ready' | 'failed';

export interface AudioReferenceTrackRow {
  id: string;
  catalogue_id: string;
  title: string;
  artist_name: string | null;
  status: AudioReferenceTrackStatus;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: string | null;
  last_error: string | null;
  uploaded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
