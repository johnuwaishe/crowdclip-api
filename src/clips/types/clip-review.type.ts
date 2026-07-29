import { ClipMediaChoice } from './clip-row.type';
import { MediaAssetStatus, MediaAssetType } from './media-asset-row.type';

export interface ClipReviewMediaAsset {
  id: string;
  type: MediaAssetType;
  status: MediaAssetStatus;
  mimeType: string | null;
  byteSize: number | null;
  storedAt: Date | null;
  createdAt: Date;
  previewUrl: string | null;
  previewUrlExpiresAt: Date | null;
}

export interface ClipReview {
  id: string;
  mediaChoice: ClipMediaChoice;
  mentionedAt: Date | null;
  createdAt: Date;
  fan: {
    id: string;
    instagramScopedUserId: string;
  };
  mediaAssets: ClipReviewMediaAsset[];
}
