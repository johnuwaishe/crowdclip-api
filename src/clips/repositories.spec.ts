import { QueryResult, QueryResultRow } from 'pg';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { FansRepository } from '../fans/fans.repository';
import { FanRow } from '../fans/types/fan-row.type';
import { ClipsRepository } from './clips.repository';
import { MediaAssetsRepository } from './media-assets.repository';
import { OriginalFileRequestsRepository } from './original-file-requests.repository';
import { ClipReviewRow } from './types/clip-review-row.type';
import { ClipRow } from './types/clip-row.type';
import { MediaAssetRow } from './types/media-asset-row.type';
import { OriginalFileRequestRow } from './types/original-file-request-row.type';

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

describe('clip workflow repositories', () => {
  const query = jest.fn();
  const databaseService = {
    query,
  } as unknown as DatabaseService;
  const executor = {
    query,
  } as unknown as DatabaseExecutor;

  const now = new Date('2026-07-29T17:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('FansRepository', () => {
    const fan: FanRow = {
      id: 'fan-id',
      instagram_scoped_user_id: 'instagram-fan-id',
      created_at: now,
      updated_at: now,
    };

    it('returns a newly inserted fan', async () => {
      query.mockResolvedValueOnce(queryResult([fan]));
      const repository = new FansRepository(databaseService);

      await expect(
        repository.findOrCreate(
          { instagramScopedUserId: 'instagram-fan-id' },
          executor,
        ),
      ).resolves.toBe(fan);

      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.fans'),
        ['instagram-fan-id'],
      );
    });

    it('returns the existing fan after an insert conflict', async () => {
      query
        .mockResolvedValueOnce(queryResult([]))
        .mockResolvedValueOnce(queryResult([fan]));
      const repository = new FansRepository(databaseService);

      await expect(
        repository.findOrCreate(
          { instagramScopedUserId: 'instagram-fan-id' },
          executor,
        ),
      ).resolves.toBe(fan);

      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('WHERE instagram_scoped_user_id = $1'),
        ['instagram-fan-id'],
      );
    });
  });

  describe('ClipsRepository', () => {
    const clip: ClipRow = {
      id: 'clip-id',
      fan_id: 'fan-id',
      source_webhook_event_id: 'event-id',
      media_choice: 'undecided',
      mentioned_at: now,
      created_at: now,
      updated_at: now,
    };

    it('locks a clip before making a decision', async () => {
      query.mockResolvedValueOnce(queryResult([clip]));
      const repository = new ClipsRepository(databaseService);

      await expect(
        repository.findByIdForUpdate(clip.id, executor),
      ).resolves.toBe(clip);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        [clip.id],
      );
    });

    it('updates only an undecided clip', async () => {
      const updatedClip: ClipRow = {
        ...clip,
        media_choice: 'use_instagram_story',
      };
      query.mockResolvedValueOnce(queryResult([updatedClip]));
      const repository = new ClipsRepository(databaseService);

      await expect(
        repository.updateMediaChoice(clip.id, 'use_instagram_story', executor),
      ).resolves.toBe(updatedClip);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("AND media_choice = 'undecided'"),
        [clip.id, 'use_instagram_story'],
      );
    });

    it('lists a bounded set of recent clips with fans and assets', async () => {
      const reviewRow: ClipReviewRow = {
        clip_id: clip.id,
        media_choice: clip.media_choice,
        mentioned_at: clip.mentioned_at,
        clip_created_at: clip.created_at,
        fan_id: 'fan-id',
        instagram_scoped_user_id: 'instagram-fan-id',
        asset_id: 'asset-id',
        asset_type: 'instagram_story',
        asset_status: 'stored',
        storage_bucket: 'clip-media',
        storage_path: 'clip-id/instagram/asset-id.mp4',
        mime_type: 'video/mp4',
        byte_size: '1024',
        asset_stored_at: now,
        asset_created_at: now,
      };
      query.mockResolvedValueOnce(queryResult([reviewRow]));
      const repository = new ClipsRepository(databaseService);

      await expect(repository.listRecentForReview(20)).resolves.toEqual([
        reviewRow,
      ]);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        [20],
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN public.media_assets'),
        [20],
      );
    });

    it('returns a newly inserted clip', async () => {
      query.mockResolvedValueOnce(queryResult([clip]));
      const repository = new ClipsRepository(databaseService);

      await expect(
        repository.findOrCreate(
          {
            fanId: 'fan-id',
            sourceWebhookEventId: 'event-id',
            mentionedAt: now,
          },
          executor,
        ),
      ).resolves.toBe(clip);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.clips'),
        ['fan-id', 'event-id', now],
      );
    });

    it('returns the existing clip after an insert conflict', async () => {
      query
        .mockResolvedValueOnce(queryResult([]))
        .mockResolvedValueOnce(queryResult([clip]));
      const repository = new ClipsRepository(databaseService);

      await expect(
        repository.findOrCreate(
          {
            fanId: 'fan-id',
            sourceWebhookEventId: 'event-id',
            mentionedAt: now,
          },
          executor,
        ),
      ).resolves.toBe(clip);

      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('WHERE source_webhook_event_id = $1'),
        ['event-id'],
      );
    });
  });

  describe('MediaAssetsRepository', () => {
    const asset: MediaAssetRow = {
      id: 'asset-id',
      clip_id: 'clip-id',
      asset_type: 'instagram_story',
      status: 'pending',
      source_url: 'https://example.test/story',
      storage_bucket: null,
      storage_path: null,
      mime_type: null,
      byte_size: null,
      attempt_count: 0,
      last_error: null,
      download_started_at: null,
      next_attempt_at: null,
      stored_at: null,
      created_at: now,
      updated_at: now,
    };

    it('finds a stored media version for a decision', async () => {
      const storedAsset: MediaAssetRow = {
        ...asset,
        status: 'stored',
        storage_bucket: 'clip-media',
        storage_path: 'clip-id/instagram/asset-id.mp4',
        stored_at: now,
      };
      query.mockResolvedValueOnce(queryResult([storedAsset]));
      const repository = new MediaAssetsRepository(databaseService);

      await expect(
        repository.findStoredByClipAndType(
          'clip-id',
          'instagram_story',
          executor,
        ),
      ).resolves.toBe(storedAsset);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("AND status = 'stored'"),
        ['clip-id', 'instagram_story'],
      );
    });

    it('returns a newly inserted media asset', async () => {
      query.mockResolvedValueOnce(queryResult([asset]));
      const repository = new MediaAssetsRepository(databaseService);

      await expect(
        repository.findOrCreate(
          {
            clipId: 'clip-id',
            assetType: 'instagram_story',
            sourceUrl: 'https://example.test/story',
          },
          executor,
        ),
      ).resolves.toBe(asset);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.media_assets'),
        ['clip-id', 'instagram_story', 'https://example.test/story'],
      );
    });

    it('creates a stored fan-original version in the same clip', async () => {
      const fanOriginal: MediaAssetRow = {
        ...asset,
        id: 'fan-original-id',
        asset_type: 'fan_original',
        status: 'stored',
        source_url: null,
        storage_bucket: 'clip-media',
        storage_path: 'clip-id/original/request-id.mp4',
        mime_type: 'video/mp4',
        byte_size: '4096',
        stored_at: now,
      };
      query.mockResolvedValueOnce(queryResult([fanOriginal]));
      const repository = new MediaAssetsRepository(databaseService);

      await expect(
        repository.createStoredFanOriginal(
          {
            clipId: 'clip-id',
            storageBucket: 'clip-media',
            storagePath: 'clip-id/original/request-id.mp4',
            mimeType: 'video/mp4',
            byteSize: 4096,
          },
          executor,
        ),
      ).resolves.toBe(fanOriginal);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("'fan_original'"),
        [
          'clip-id',
          'clip-media',
          'clip-id/original/request-id.mp4',
          'video/mp4',
          4096,
        ],
      );
    });

    it('returns the existing media asset after an insert conflict', async () => {
      query
        .mockResolvedValueOnce(queryResult([]))
        .mockResolvedValueOnce(queryResult([asset]));
      const repository = new MediaAssetsRepository(databaseService);

      await expect(
        repository.findOrCreate(
          {
            clipId: 'clip-id',
            assetType: 'instagram_story',
            sourceUrl: 'https://example.test/story',
          },
          executor,
        ),
      ).resolves.toBe(asset);

      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('AND asset_type = $2'),
        ['clip-id', 'instagram_story'],
      );
    });

    it('atomically claims a pending Instagram story asset', async () => {
      const downloadingAsset: MediaAssetRow = {
        ...asset,
        status: 'downloading',
        attempt_count: 1,
        download_started_at: now,
      };
      query.mockResolvedValueOnce(queryResult([downloadingAsset]));
      const repository = new MediaAssetsRepository(databaseService);

      await expect(repository.claimNextPendingInstagramStory()).resolves.toBe(
        downloadingAsset,
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("asset_type = 'instagram_story'"),
      );
    });

    it('records the permanent storage location', async () => {
      const storedAsset: MediaAssetRow = {
        ...asset,
        status: 'stored',
        storage_bucket: 'clip-media',
        storage_path: 'clip-id/instagram/asset-id.mp4',
        mime_type: 'video/mp4',
        byte_size: '1024',
        stored_at: now,
      };
      query.mockResolvedValueOnce(queryResult([storedAsset]));
      const repository = new MediaAssetsRepository(databaseService);

      await expect(
        repository.markStored({
          id: asset.id,
          storageBucket: 'clip-media',
          storagePath: 'clip-id/instagram/asset-id.mp4',
          mimeType: 'video/mp4',
          byteSize: 1024,
        }),
      ).resolves.toBe(storedAsset);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("AND status = 'downloading'"),
        [
          asset.id,
          'clip-media',
          'clip-id/instagram/asset-id.mp4',
          'video/mp4',
          1024,
        ],
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('source_url = NULL'),
        expect.any(Array),
      );
    });

    it('schedules retryable failures and recovers stale downloads', async () => {
      const nextAttemptAt = new Date('2026-07-29T17:01:00.000Z');
      const pendingAsset: MediaAssetRow = {
        ...asset,
        attempt_count: 1,
        last_error: 'Download failed',
        next_attempt_at: nextAttemptAt,
      };
      query
        .mockResolvedValueOnce(queryResult([pendingAsset]))
        .mockResolvedValueOnce(queryResult([pendingAsset]));
      const repository = new MediaAssetsRepository(databaseService);

      await expect(
        repository.releaseAfterFailure(
          asset.id,
          'Download failed',
          3,
          nextAttemptAt,
        ),
      ).resolves.toBe(pendingAsset);

      await expect(repository.recoverStaleDownloads(now, 3)).resolves.toEqual([
        pendingAsset,
      ]);

      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHEN attempt_count >= $3'),
        [asset.id, 'Download failed', 3, nextAttemptAt],
      );
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('AND download_started_at < $1'),
        [now, 3, 'Download lease expired before completion'],
      );
    });
  });

  describe('OriginalFileRequestsRepository', () => {
    const request: OriginalFileRequestRow = {
      id: 'request-id',
      clip_id: 'clip-id',
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
      created_at: now,
      updated_at: now,
    };

    it('creates an expiring request with only the token hash', async () => {
      query.mockResolvedValueOnce(queryResult([request]));
      const repository = new OriginalFileRequestsRepository(databaseService);

      await expect(
        repository.create(
          {
            id: request.id,
            clipId: 'clip-id',
            uploadTokenHash: 'a'.repeat(64),
            expiresAt: request.expires_at,
          },
          executor,
        ),
      ).resolves.toBe(request);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('VALUES ($1, $2, $3, $4)'),
        [request.id, 'clip-id', 'a'.repeat(64), request.expires_at],
      );
    });

    it('finds an existing request for an idempotent decision', async () => {
      query.mockResolvedValueOnce(queryResult([request]));
      const repository = new OriginalFileRequestsRepository(databaseService);

      await expect(repository.findByClipId('clip-id', executor)).resolves.toBe(
        request,
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE clip_id = $1'),
        ['clip-id'],
      );
    });

    it('atomically claims an eligible request for upload', async () => {
      const staleBefore = new Date('2026-07-29T16:55:00.000Z');
      const uploadLeaseId = '7ad85e44-af72-430c-a8ca-14db25b3e37e';
      const uploadingRequest: OriginalFileRequestRow = {
        ...request,
        status: 'uploading',
        upload_started_at: now,
        upload_lease_id: uploadLeaseId,
      };
      query.mockResolvedValueOnce(queryResult([uploadingRequest]));
      const repository = new OriginalFileRequestsRepository(databaseService);

      await expect(
        repository.claimForUpload({
          requestId: request.id,
          uploadTokenHash: request.upload_token_hash,
          uploadLeaseId,
          staleBefore,
        }),
      ).resolves.toBe(uploadingRequest);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'uploading'"),
        [request.id, request.upload_token_hash, uploadLeaseId, staleBefore],
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'sent', 'failed')"),
        expect.any(Array),
      );
    });

    it('releases a failed upload back to a retryable state', async () => {
      const uploadLeaseId = '7ad85e44-af72-430c-a8ca-14db25b3e37e';
      query.mockResolvedValueOnce(queryResult([request]));
      const repository = new OriginalFileRequestsRepository(databaseService);

      await expect(
        repository.releaseUploadAfterFailure(
          request.id,
          uploadLeaseId,
          'Storage unavailable',
        ),
      ).resolves.toBe(request);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("WHEN sent_at IS NOT NULL THEN 'sent'"),
        [request.id, uploadLeaseId, 'Storage unavailable'],
      );
    });

    it('locks and fulfills a claimed upload request', async () => {
      const uploadLeaseId = '7ad85e44-af72-430c-a8ca-14db25b3e37e';
      const uploadingRequest: OriginalFileRequestRow = {
        ...request,
        status: 'uploading',
        upload_started_at: now,
        upload_lease_id: uploadLeaseId,
      };
      const fulfilledRequest: OriginalFileRequestRow = {
        ...uploadingRequest,
        status: 'fulfilled',
        upload_started_at: null,
        upload_lease_id: null,
        fulfilled_at: now,
      };
      query
        .mockResolvedValueOnce(queryResult([uploadingRequest]))
        .mockResolvedValueOnce(queryResult([fulfilledRequest]));
      const repository = new OriginalFileRequestsRepository(databaseService);

      await expect(
        repository.findByIdForUpdate(request.id, executor),
      ).resolves.toBe(uploadingRequest);
      await expect(
        repository.markFulfilled(request.id, uploadLeaseId, executor),
      ).resolves.toBe(fulfilledRequest);

      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('FOR UPDATE'),
        [request.id],
      );
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("AND status = 'uploading'"),
        [request.id, uploadLeaseId],
      );
    });
  });
});
