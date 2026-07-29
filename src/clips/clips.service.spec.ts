import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { MediaDownloadConfig } from '../media/media-download.config';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { ClipsRepository } from './clips.repository';
import { ClipsService } from './clips.service';
import { ClipReviewRow } from './types/clip-review-row.type';

describe('ClipsService', () => {
  const listRecentForReview = jest.fn();
  const clipsRepository = {
    listRecentForReview,
  } as unknown as ClipsRepository;
  const createSignedUrl = jest.fn();
  const storage = {
    createSignedUrl,
  } as unknown as SupabaseObjectStorage;
  const mediaConfig = {
    previewUrlTtlSeconds: 300,
  } as MediaDownloadConfig;

  const clipCreatedAt = new Date('2026-07-29T17:00:00.000Z');
  const assetCreatedAt = new Date('2026-07-29T17:00:01.000Z');
  const storedAt = new Date('2026-07-29T17:00:02.000Z');
  const baseRow: ClipReviewRow = {
    clip_id: 'clip-id',
    media_choice: 'undecided',
    mentioned_at: clipCreatedAt,
    clip_created_at: clipCreatedAt,
    fan_id: 'fan-id',
    instagram_scoped_user_id: 'instagram-fan-id',
    asset_id: 'asset-id',
    asset_type: 'instagram_story',
    asset_status: 'stored',
    storage_bucket: 'clip-media',
    storage_path: 'clip-id/instagram/asset-id.mp4',
    mime_type: 'video/mp4',
    byte_size: '4738057',
    asset_stored_at: storedAt,
    asset_created_at: assetCreatedAt,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1_753_806_000_000);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('groups rows into clips and signs stored assets only', async () => {
    const pendingRow: ClipReviewRow = {
      ...baseRow,
      asset_id: 'pending-asset-id',
      asset_status: 'pending',
      storage_bucket: null,
      storage_path: null,
      mime_type: null,
      byte_size: null,
      asset_stored_at: null,
    };
    listRecentForReview.mockResolvedValueOnce([baseRow, pendingRow]);
    createSignedUrl.mockResolvedValueOnce(
      'https://storage.test/signed-preview',
    );
    const service = new ClipsService(clipsRepository, storage, mediaConfig);

    await expect(service.listRecentForReview(20)).resolves.toEqual([
      {
        id: 'clip-id',
        mediaChoice: 'undecided',
        mentionedAt: clipCreatedAt,
        createdAt: clipCreatedAt,
        fan: {
          id: 'fan-id',
          instagramScopedUserId: 'instagram-fan-id',
        },
        mediaAssets: [
          {
            id: 'asset-id',
            type: 'instagram_story',
            status: 'stored',
            mimeType: 'video/mp4',
            byteSize: 4738057,
            storedAt,
            createdAt: assetCreatedAt,
            previewUrl: 'https://storage.test/signed-preview',
            previewUrlExpiresAt: new Date(1_753_806_300_000),
          },
          {
            id: 'pending-asset-id',
            type: 'instagram_story',
            status: 'pending',
            mimeType: null,
            byteSize: null,
            storedAt: null,
            createdAt: assetCreatedAt,
            previewUrl: null,
            previewUrlExpiresAt: null,
          },
        ],
      },
    ]);

    expect(listRecentForReview).toHaveBeenCalledWith(20);
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith({
      bucket: 'clip-media',
      path: 'clip-id/instagram/asset-id.mp4',
      expiresInSeconds: 300,
    });
  });

  it('returns clips that do not have media assets', async () => {
    listRecentForReview.mockResolvedValueOnce([
      {
        ...baseRow,
        asset_id: null,
        asset_type: null,
        asset_status: null,
        storage_bucket: null,
        storage_path: null,
        mime_type: null,
        byte_size: null,
        asset_stored_at: null,
        asset_created_at: null,
      },
    ]);
    const service = new ClipsService(clipsRepository, storage, mediaConfig);

    const clips = await service.listRecentForReview(20);

    expect(clips[0].mediaAssets).toEqual([]);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns a service unavailable error when preview signing fails', async () => {
    listRecentForReview.mockResolvedValueOnce([baseRow]);
    createSignedUrl.mockRejectedValueOnce(new Error('Storage unavailable'));
    const service = new ClipsService(clipsRepository, storage, mediaConfig);

    await expect(service.listRecentForReview(20)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
