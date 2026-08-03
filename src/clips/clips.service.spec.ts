import {
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { MediaDownloadConfig } from '../media/media-download.config';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { ClipsRepository } from './clips.repository';
import { ClipsService } from './clips.service';
import { MediaAssetsRepository } from './media-assets.repository';
import { OriginalFileRequestsRepository } from './original-file-requests.repository';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';
import { ClipReviewRow } from './types/clip-review-row.type';
import { ClipRow } from './types/clip-row.type';
import { MediaAssetRow } from './types/media-asset-row.type';
import { OriginalFileRequestRow } from './types/original-file-request-row.type';

describe('ClipsService', () => {
  const listRecentForReview = jest.fn();
  const findByIdForUpdate = jest.fn();
  const updateMediaChoice = jest.fn();
  const clipsRepository = {
    listRecentForReview,
    findByIdForUpdate,
    updateMediaChoice,
  } as unknown as ClipsRepository;
  const createSignedUrl = jest.fn();
  const storage = {
    createSignedUrl,
  } as unknown as SupabaseObjectStorage;
  const mediaConfig = {
    previewUrlTtlSeconds: 300,
  } as MediaDownloadConfig;
  const transaction = {
    query: jest.fn(),
  } as unknown as DatabaseExecutor;
  const withTransaction = jest.fn(
    (callback: (executor: DatabaseExecutor) => Promise<unknown>) =>
      callback(transaction),
  );
  const databaseService = {
    withTransaction,
  } as unknown as DatabaseService;
  const findStoredByClipAndType = jest.fn();
  const mediaAssetsRepository = {
    findStoredByClipAndType,
  } as unknown as MediaAssetsRepository;
  const createOriginalFileRequest = jest.fn();
  const findOriginalFileRequestByClipId = jest.fn();
  const originalFileRequestsRepository = {
    create: createOriginalFileRequest,
    findByClipId: findOriginalFileRequestByClipId,
  } as unknown as OriginalFileRequestsRepository;
  const issueUploadToken = jest.fn();
  const recreateUploadToken = jest.fn();
  const uploadTokenService = {
    issue: issueUploadToken,
    recreate: recreateUploadToken,
  } as unknown as OriginalFileUploadTokenService;

  const clipCreatedAt = new Date('2026-07-29T17:00:00.000Z');
  const assetCreatedAt = new Date('2026-07-29T17:00:01.000Z');
  const storedAt = new Date('2026-07-29T17:00:02.000Z');
  const clip: ClipRow = {
    id: 'clip-id',
    fan_id: 'fan-id',
    source_webhook_event_id: 'event-id',
    instagram_account_id: 'instagram-account-id',
    show_id: 'show-id',
    media_choice: 'undecided',
    mentioned_at: clipCreatedAt,
    created_at: clipCreatedAt,
    updated_at: clipCreatedAt,
  };
  const storedAsset: MediaAssetRow = {
    id: 'asset-id',
    clip_id: clip.id,
    asset_type: 'instagram_story',
    status: 'stored',
    source_url: null,
    storage_bucket: 'clip-media',
    storage_path: 'clip-id/instagram/asset-id.mp4',
    mime_type: 'video/mp4',
    byte_size: '4738057',
    attempt_count: 1,
    last_error: null,
    download_started_at: storedAt,
    next_attempt_at: null,
    stored_at: storedAt,
    created_at: assetCreatedAt,
    updated_at: storedAt,
  };
  const originalFileRequest: OriginalFileRequestRow = {
    id: 'request-id',
    clip_id: clip.id,
    status: 'pending',
    upload_token_hash: 'a'.repeat(64),
    expires_at: new Date('2026-08-05T17:00:00.000Z'),
    instagram_message_id: null,
    attempt_count: 0,
    last_error: null,
    sending_started_at: null,
    sent_at: null,
    upload_started_at: null,
    upload_lease_id: null,
    fulfilled_at: null,
    created_at: clipCreatedAt,
    updated_at: clipCreatedAt,
  };
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
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = () =>
    new ClipsService(
      clipsRepository,
      storage,
      mediaConfig,
      databaseService,
      mediaAssetsRepository,
      originalFileRequestsRepository,
      uploadTokenService,
    );

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
    const service = createService();

    await expect(
      service.listRecentForReview(20, 'workspace-id'),
    ).resolves.toEqual([
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

    expect(listRecentForReview).toHaveBeenCalledWith(20, 'workspace-id');
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
    const service = createService();

    const clips = await service.listRecentForReview(20, 'workspace-id');

    expect(clips[0].mediaAssets).toEqual([]);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns a service unavailable error when preview signing fails', async () => {
    listRecentForReview.mockResolvedValueOnce([baseRow]);
    createSignedUrl.mockRejectedValueOnce(new Error('Storage unavailable'));
    const service = createService();

    await expect(
      service.listRecentForReview(20, 'workspace-id'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('chooses a stored Instagram story in one transaction', async () => {
    const updatedClip: ClipRow = {
      ...clip,
      media_choice: 'use_instagram_story',
    };
    findByIdForUpdate.mockResolvedValueOnce(clip);
    findStoredByClipAndType.mockResolvedValueOnce(storedAsset);
    updateMediaChoice.mockResolvedValueOnce(updatedClip);
    const service = createService();

    await expect(
      service.decideMediaChoice(clip.id, 'use_instagram_story', 'workspace-id'),
    ).resolves.toEqual({
      clipId: clip.id,
      mediaChoice: 'use_instagram_story',
      updatedAt: clip.updated_at,
      originalFileRequest: null,
    });

    expect(findByIdForUpdate).toHaveBeenCalledWith(
      clip.id,
      transaction,
      'workspace-id',
    );
    expect(findStoredByClipAndType).toHaveBeenCalledWith(
      clip.id,
      'instagram_story',
      transaction,
    );
    expect(updateMediaChoice).toHaveBeenCalledWith(
      clip.id,
      'use_instagram_story',
      transaction,
    );
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it('creates an original-file request and returns its upload path', async () => {
    const updatedClip: ClipRow = {
      ...clip,
      media_choice: 'request_fan_original',
    };
    findByIdForUpdate.mockResolvedValueOnce(clip);
    updateMediaChoice.mockResolvedValueOnce(updatedClip);
    issueUploadToken.mockReturnValueOnce({
      requestId: originalFileRequest.id,
      expiresAt: originalFileRequest.expires_at,
      rawToken: 'raw-upload-token',
      tokenHash: 'a'.repeat(64),
    });
    createOriginalFileRequest.mockResolvedValueOnce(originalFileRequest);
    const service = createService();

    await expect(
      service.decideMediaChoice(
        clip.id,
        'request_fan_original',
        'workspace-id',
      ),
    ).resolves.toEqual({
      clipId: clip.id,
      mediaChoice: 'request_fan_original',
      updatedAt: clip.updated_at,
      originalFileRequest: {
        id: originalFileRequest.id,
        status: 'pending',
        expiresAt: originalFileRequest.expires_at,
        uploadPath: '/uploads/original/raw-upload-token',
      },
    });

    expect(createOriginalFileRequest).toHaveBeenCalledWith(
      {
        id: originalFileRequest.id,
        clipId: clip.id,
        uploadTokenHash: 'a'.repeat(64),
        expiresAt: originalFileRequest.expires_at,
      },
      transaction,
    );
    expect(issueUploadToken).toHaveBeenCalledWith(604800);
  });

  it('recreates the upload path for an existing same decision', async () => {
    const decidedClip: ClipRow = {
      ...clip,
      media_choice: 'request_fan_original',
    };
    findByIdForUpdate.mockResolvedValueOnce(decidedClip);
    findOriginalFileRequestByClipId.mockResolvedValueOnce(originalFileRequest);
    recreateUploadToken.mockReturnValueOnce({
      requestId: originalFileRequest.id,
      expiresAt: originalFileRequest.expires_at,
      rawToken: 'raw-upload-token',
      tokenHash: originalFileRequest.upload_token_hash,
    });
    const service = createService();

    const result = await service.decideMediaChoice(
      clip.id,
      'request_fan_original',
      'workspace-id',
    );

    expect(result.originalFileRequest?.uploadPath).toBe(
      '/uploads/original/raw-upload-token',
    );
    expect(recreateUploadToken).toHaveBeenCalledWith(
      originalFileRequest.id,
      originalFileRequest.expires_at,
    );
    expect(issueUploadToken).not.toHaveBeenCalled();
    expect(updateMediaChoice).not.toHaveBeenCalled();
  });

  it('does not return an upload path for an expired request', async () => {
    const expiredRequest: OriginalFileRequestRow = {
      ...originalFileRequest,
      status: 'expired',
    };
    findByIdForUpdate.mockResolvedValueOnce({
      ...clip,
      media_choice: 'request_fan_original',
    });
    findOriginalFileRequestByClipId.mockResolvedValueOnce(expiredRequest);
    const service = createService();

    const result = await service.decideMediaChoice(
      clip.id,
      'request_fan_original',
      'workspace-id',
    );

    expect(result.originalFileRequest?.uploadPath).toBeNull();
    expect(recreateUploadToken).not.toHaveBeenCalled();
  });

  it('rejects changing an existing decision', async () => {
    findByIdForUpdate.mockResolvedValueOnce({
      ...clip,
      media_choice: 'use_instagram_story',
    });
    const service = createService();

    await expect(
      service.decideMediaChoice(
        clip.id,
        'request_fan_original',
        'workspace-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects choosing an Instagram story that is not stored', async () => {
    findByIdForUpdate.mockResolvedValueOnce(clip);
    findStoredByClipAndType.mockResolvedValueOnce(null);
    const service = createService();

    await expect(
      service.decideMediaChoice(clip.id, 'use_instagram_story', 'workspace-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateMediaChoice).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown clip', async () => {
    findByIdForUpdate.mockResolvedValueOnce(null);
    const service = createService();

    await expect(
      service.decideMediaChoice(clip.id, 'use_instagram_story', 'workspace-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
