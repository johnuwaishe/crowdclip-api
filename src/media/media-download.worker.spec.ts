import { Logger } from '@nestjs/common';
import { MediaAssetsRepository } from '../clips/media-assets.repository';
import { MediaAssetRow } from '../clips/types/media-asset-row.type';
import { MediaDownloadConfig } from './media-download.config';
import { MediaDownloadProcessor } from './media-download.processor';
import { MediaDownloadWorker } from './media-download.worker';

describe('MediaDownloadWorker', () => {
  const now = new Date('2026-07-29T17:00:00.000Z');
  const baseAsset: MediaAssetRow = {
    id: 'asset-id',
    clip_id: 'clip-id',
    asset_type: 'instagram_story',
    status: 'downloading',
    source_url: 'https://cdn.example.test/story.mp4',
    storage_bucket: null,
    storage_path: null,
    mime_type: null,
    byte_size: null,
    attempt_count: 1,
    last_error: null,
    download_started_at: now,
    next_attempt_at: null,
    stored_at: null,
    created_at: now,
    updated_at: now,
  };

  const config = {
    enabled: false,
    pollIntervalMs: 5_000,
    batchSize: 3,
    staleAfterMs: 600_000,
    maxAttempts: 3,
  } as MediaDownloadConfig;
  const processor = {
    processNext: jest.fn(),
  };
  const mediaAssetsRepository = {
    recoverStaleDownloads: jest.fn(),
  };

  let worker: MediaDownloadWorker;
  let loggerLog: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    mediaAssetsRepository.recoverStaleDownloads.mockResolvedValue([]);
    worker = new MediaDownloadWorker(
      config,
      processor as unknown as MediaDownloadProcessor,
      mediaAssetsRepository as unknown as MediaAssetsRepository,
    );
  });

  afterEach(() => {
    loggerLog.mockRestore();
    jest.useRealTimers();
  });

  it('recovers stale work and drains a bounded batch', async () => {
    mediaAssetsRepository.recoverStaleDownloads.mockResolvedValueOnce([
      {
        ...baseAsset,
        status: 'pending',
      },
      {
        ...baseAsset,
        id: 'abandoned-asset',
        status: 'failed',
      },
    ]);
    processor.processNext
      .mockResolvedValueOnce({
        status: 'stored',
        mediaAssetId: 'stored-asset',
        storagePath: 'clip/instagram/stored.mp4',
      })
      .mockResolvedValueOnce({
        status: 'retrying',
        mediaAssetId: 'retrying-asset',
        error: 'Temporary failure',
      })
      .mockResolvedValueOnce({ status: 'idle' });

    await expect(worker.runOnce()).resolves.toEqual({
      stored: 1,
      retrying: 1,
      failed: 0,
      requeued: 1,
      abandoned: 1,
    });
  });

  it('does not schedule when storage configuration disables the worker', () => {
    jest.useFakeTimers();

    worker.onApplicationBootstrap();
    jest.advanceTimersByTime(10_000);

    expect(processor.processNext).not.toHaveBeenCalled();
    expect(loggerLog).toHaveBeenCalledWith('Media download worker is disabled');
  });
});
