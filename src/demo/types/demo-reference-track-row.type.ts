export type DemoReferenceTrackStatus =
  'pending' | 'ingesting' | 'stored' | 'failed';

export interface DemoReferenceTrackRow {
  demo_id: string;
  artist: string;
  title: string;
  duration_ms: number;
  status: DemoReferenceTrackStatus;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
  peaks: number[] | null;
  artwork_bucket: string | null;
  artwork_path: string | null;
  artwork_mime_type: string | null;
  last_error: string | null;
  stored_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
