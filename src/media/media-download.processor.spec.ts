import { Logger } from '@nestjs/common';
import { ClipAudioAnalysesRepository } from '../audio-analysis/clip-audio-analyses.repository';
import { MediaAssetsRepository } from '../clips/media-assets.repository';
import { MediaAssetRow } from '../clips/types/media-asset-row.type';
import {
  DatabaseExecutor,
  DatabaseService,
} from '../database/database.service';
import { MediaDownloadConfig } from './media-download.config';
import { MediaDownloadProcessor } from './media-download.processor';
import { RemoteMediaDownloader } from './remote-media-downloader.service';
import { SupabaseObjectStorage } from './supabase-object-storage.service';

describe('MediaDownloadProcessor', () => {
  const now = new Date('2026-07-29T17:00:00.000Z');
  const asset: MediaAssetRow = {
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
    storageBucket: 'clip-media',
    retryDelayMs: 60_000,
    maxAttempts: 3,
  } as MediaDownloadConfig;
  const mediaAssetsRepository = {
    claimNextPendingInstagramStory: jest.fn(),
    markStored: jest.fn(),
    releaseAfterFailure: jest.fn(),
  };
  const transaction = {
    query: jest.fn(),
  } as unknown as DatabaseExecutor;
  const databaseService = {
    withTransaction: jest.fn(
      (callback: (executor: DatabaseExecutor) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as DatabaseService;
  const analysesRepository = {
    enqueueForStoredMediaAsset: jest.fn(),
  };
  const downloader = {
    download: jest.fn(),
  };
  const objectStorage = {
    upload: jest.fn(),
  };

  let processor: MediaDownloadProcessor;
  let loggerLog: jest.SpyInstance;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    processor = new MediaDownloadProcessor(
      config,
      databaseService,
      mediaAssetsRepository as unknown as MediaAssetsRepository,
      analysesRepository as unknown as ClipAudioAnalysesRepository,
      downloader as unknown as RemoteMediaDownloader,
      objectStorage as unknown as SupabaseObjectStorage,
    );
  });

  afterEach(() => {
    loggerLog.mockRestore();
    loggerError.mockRestore();
  });

  it('returns idle when no media asset is pending', async () => {
    mediaAssetsRepository.claimNextPendingInstagramStory.mockResolvedValueOnce(
      null,
    );

    await expect(processor.processNext()).resolves.toEqual({ status: 'idle' });
    expect(downloader.download).not.toHaveBeenCalled();
  });

  it('downloads, uploads, and records the permanent object', async () => {
    const data = Buffer.from([1, 2, 3]);
    mediaAssetsRepository.claimNextPendingInstagramStory.mockResolvedValueOnce(
      asset,
    );
    downloader.download.mockResolvedValueOnce({
      data,
      mimeType: 'video/mp4',
      byteSize: 3,
      extension: 'mp4',
    });
    objectStorage.upload.mockResolvedValueOnce(undefined);
    mediaAssetsRepository.markStored.mockResolvedValueOnce({
      ...asset,
      status: 'stored',
    });

    await expect(processor.processNext()).resolves.toEqual({
      status: 'stored',
      mediaAssetId: asset.id,
      storagePath: 'clip-id/instagram/asset-id.mp4',
    });

    expect(objectStorage.upload).toHaveBeenCalledWith({
      bucket: 'clip-media',
      path: 'clip-id/instagram/asset-id.mp4',
      data,
      contentType: 'video/mp4',
    });
    expect(mediaAssetsRepository.markStored).toHaveBeenCalledWith(
      {
        id: asset.id,
        storageBucket: 'clip-media',
        storagePath: 'clip-id/instagram/asset-id.mp4',
        mimeType: 'video/mp4',
        byteSize: 3,
      },
      transaction,
    );
    expect(analysesRepository.enqueueForStoredMediaAsset).toHaveBeenCalledWith(
      asset.id,
      transaction,
    );
  });

  it.each([
    ['pending', 'retrying'],
    ['failed', 'failed'],
  ] as const)(
    'returns %s assets as %s after a failed attempt',
    async (releasedStatus, resultStatus) => {
      mediaAssetsRepository.claimNextPendingInstagramStory.mockResolvedValueOnce(
        asset,
      );
      downloader.download.mockRejectedValueOnce(new Error('CDN unavailable'));
      mediaAssetsRepository.releaseAfterFailure.mockResolvedValueOnce({
        ...asset,
        status: releasedStatus,
      });

      await expect(processor.processNext()).resolves.toMatchObject({
        status: resultStatus,
        mediaAssetId: asset.id,
        error: 'CDN unavailable',
      });

      expect(mediaAssetsRepository.releaseAfterFailure).toHaveBeenCalledWith(
        asset.id,
        'CDN unavailable',
        3,
        expect.any(Date),
      );
    },
  );
});
