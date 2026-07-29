import { ClipMediaChoice } from './clip-row.type';
import { MediaAssetStatus, MediaAssetType } from './media-asset-row.type';

export interface ClipReviewRow {
  clip_id: string;
  media_choice: ClipMediaChoice;
  mentioned_at: Date | null;
  clip_created_at: Date;
  fan_id: string;
  instagram_scoped_user_id: string;
  asset_id: string | null;
  asset_type: MediaAssetType | null;
  asset_status: MediaAssetStatus | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  byte_size: string | null;
  asset_stored_at: Date | null;
  asset_created_at: Date | null;
}
