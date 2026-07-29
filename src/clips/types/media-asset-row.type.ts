export type MediaAssetType = 'instagram_story' | 'fan_original';

export type MediaAssetStatus = 'pending' | 'downloading' | 'stored' | 'failed';

export interface MediaAssetRow {
  id: string;
  clip_id: string;
  asset_type: MediaAssetType;
  status: MediaAssetStatus;
  source_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: string | null;
  attempt_count: number;
  last_error: string | null;
  download_started_at: Date | null;
  stored_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
