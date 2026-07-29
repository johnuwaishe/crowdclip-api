import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MediaDownloadConfig } from '../media/media-download.config';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { ClipsRepository } from './clips.repository';
import { ClipReviewRow } from './types/clip-review-row.type';
import { ClipReview, ClipReviewMediaAsset } from './types/clip-review.type';

interface PreviewTarget {
  bucket: string;
  path: string;
}

const PREVIEW_SIGNING_CONCURRENCY = 10;

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);

  constructor(
    private readonly clipsRepository: ClipsRepository,
    private readonly storage: SupabaseObjectStorage,
    private readonly mediaConfig: MediaDownloadConfig,
  ) {}

  async listRecentForReview(limit: number): Promise<ClipReview[]> {
    const rows = await this.clipsRepository.listRecentForReview(limit);
    const clipsById = new Map<string, ClipReview>();
    const previewTargets = new Map<string, PreviewTarget>();

    for (const row of rows) {
      let clip = clipsById.get(row.clip_id);

      if (!clip) {
        clip = this.createClipReview(row);
        clipsById.set(row.clip_id, clip);
      }

      const asset = this.createMediaAsset(row);

      if (!asset) {
        continue;
      }

      clip.mediaAssets.push(asset);

      if (asset.status === 'stored' && row.storage_bucket && row.storage_path) {
        previewTargets.set(asset.id, {
          bucket: row.storage_bucket,
          path: row.storage_path,
        });
      }
    }

    const clips = [...clipsById.values()];
    const expiresAt = new Date(
      Date.now() + this.mediaConfig.previewUrlTtlSeconds * 1_000,
    );

    try {
      await this.signPreviews(clips, previewTargets, expiresAt);
    } catch (error) {
      this.logger.error(
        'Failed to create one or more clip preview URLs',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Clip previews are temporarily unavailable',
        { cause: error },
      );
    }

    return clips;
  }

  private async signPreviews(
    clips: ClipReview[],
    previewTargets: Map<string, PreviewTarget>,
    expiresAt: Date,
  ): Promise<void> {
    const signableAssets = clips
      .flatMap((clip) => clip.mediaAssets)
      .filter((asset) => previewTargets.has(asset.id));

    for (
      let offset = 0;
      offset < signableAssets.length;
      offset += PREVIEW_SIGNING_CONCURRENCY
    ) {
      const batch = signableAssets.slice(
        offset,
        offset + PREVIEW_SIGNING_CONCURRENCY,
      );

      await Promise.all(
        batch.map(async (asset) => {
          const target = previewTargets.get(asset.id);

          if (!target) {
            return;
          }

          asset.previewUrl = await this.storage.createSignedUrl({
            bucket: target.bucket,
            path: target.path,
            expiresInSeconds: this.mediaConfig.previewUrlTtlSeconds,
          });
          asset.previewUrlExpiresAt = expiresAt;
        }),
      );
    }
  }

  private createClipReview(row: ClipReviewRow): ClipReview {
    return {
      id: row.clip_id,
      mediaChoice: row.media_choice,
      mentionedAt: row.mentioned_at,
      createdAt: row.clip_created_at,
      fan: {
        id: row.fan_id,
        instagramScopedUserId: row.instagram_scoped_user_id,
      },
      mediaAssets: [],
    };
  }

  private createMediaAsset(row: ClipReviewRow): ClipReviewMediaAsset | null {
    if (
      !row.asset_id ||
      !row.asset_type ||
      !row.asset_status ||
      !row.asset_created_at
    ) {
      return null;
    }

    return {
      id: row.asset_id,
      type: row.asset_type,
      status: row.asset_status,
      mimeType: row.mime_type,
      byteSize: row.byte_size === null ? null : Number(row.byte_size),
      storedAt: row.asset_stored_at,
      createdAt: row.asset_created_at,
      previewUrl: null,
      previewUrlExpiresAt: null,
    };
  }
}
