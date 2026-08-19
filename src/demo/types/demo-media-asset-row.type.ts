export type DemoMediaAssetStatus =
  'pending' | 'downloading' | 'stored' | 'failed';

export interface DemoMediaAssetRow {
  id: string;
  demo_id: string;
  creator: string;
  venue: string;
  city: string;
  source_provider: 'youtube';
  source_url: string;
  video_id: string;
  source_start_ms: number;
  reference_start_ms: number;
  excerpt_duration_ms: number;
  status: DemoMediaAssetStatus;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
  last_error: string | null;
  stored_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
