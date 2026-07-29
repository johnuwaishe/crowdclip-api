import { QueryResult, QueryResultRow } from 'pg';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { FansRepository } from '../fans/fans.repository';
import { FanRow } from '../fans/types/fan-row.type';
import { ClipsRepository } from './clips.repository';
import { MediaAssetsRepository } from './media-assets.repository';
import { ClipRow } from './types/clip-row.type';
import { MediaAssetRow } from './types/media-asset-row.type';

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
      stored_at: null,
      created_at: now,
      updated_at: now,
    };

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
  });
});
