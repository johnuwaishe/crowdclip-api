import { Logger } from '@nestjs/common';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioAnalysisProcessor } from './audio-analysis.processor';
import { AudioReferenceCataloguesRepository } from './audio-reference-catalogues.repository';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';
import { ConcertAudioAnalyzerClient } from './concert-audio-analyzer.client';
import { ClaimedClipAudioAnalysisRow } from './types/clip-audio-analysis-row.type';

describe('AudioAnalysisProcessor', () => {
  const now = new Date('2026-08-01T00:00:00.000Z');
  const claimed: ClaimedClipAudioAnalysisRow = {
    id: 'analysis-id',
    clip_id: 'clip-id',
    media_asset_id: 'asset-id',
    catalogue_id: 'catalogue-id',
    matched_reference_track_id: null,
    provider: 'concert_sequence',
    status: 'processing',
    fingerprint_similarity: null,
    second_best_similarity: null,
    peak_margin: null,
    time_scale: null,
    reference_offset_ms: null,
    matched_duration_ms: null,
    attempt_count: 1,
    error_message: null,
    processing_started_at: now,
    next_attempt_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    media_storage_bucket: 'clip-media',
    media_storage_path: 'clip-id/instagram/asset-id.mp4',
  };
  const track = {
    id: 'track-id',
    catalogue_id: 'catalogue-id',
    title: 'Brown Eyed Women',
    artist_name: 'Grateful Dead',
    status: 'ready' as const,
    storage_bucket: 'clip-media',
    storage_path: 'catalogue-id/references/track-id.mp3',
    mime_type: 'audio/mpeg',
    byte_size: '1000',
    last_error: null,
    uploaded_at: now,
    created_at: now,
    updated_at: now,
  };
  const config = {
    signedUrlTtlSeconds: 900,
    maxAttempts: 3,
    retryDelayMs: 60_000,
  } as AudioAnalysisConfig;
  const createSignedUrl = jest.fn();
  const storage = { createSignedUrl } as unknown as SupabaseObjectStorage;
  const listReadyTracks = jest.fn();
  const catalogues = {
    listReadyTracks,
  } as unknown as AudioReferenceCataloguesRepository;
  const claimNextPending = jest.fn();
  const markMatched = jest.fn();
  const markNoMatch = jest.fn();
  const releaseAfterFailure = jest.fn();
  const analyses = {
    claimNextPending,
    markMatched,
    markNoMatch,
    releaseAfterFailure,
  } as unknown as ClipAudioAnalysesRepository;
  const analyse = jest.fn();
  const client = { analyse } as unknown as ConcertAudioAnalyzerClient;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const processor = () =>
    new AudioAnalysisProcessor(config, storage, catalogues, analyses, client);

  it('returns idle without claiming external resources', async () => {
    claimNextPending.mockResolvedValueOnce(null);
    await expect(processor().processNext()).resolves.toEqual({
      status: 'idle',
    });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('stores a successful match', async () => {
    claimNextPending.mockResolvedValueOnce(claimed);
    listReadyTracks.mockResolvedValueOnce([track]);
    createSignedUrl
      .mockResolvedValueOnce('https://storage.test/query')
      .mockResolvedValueOnce('https://storage.test/reference');
    analyse.mockResolvedValueOnce({
      status: 'matched',
      provider: 'concert_sequence',
      referenceTrackId: track.id,
      fingerprintSimilarity: 0.62,
      secondBestSimilarity: 0.56,
      peakMargin: 0.06,
      timeScale: 0.995,
      referenceOffsetMs: 88_576,
      matchedDurationMs: 15_000,
      error: null,
    });
    markMatched.mockResolvedValueOnce({ ...claimed, status: 'matched' });

    await expect(processor().processNext()).resolves.toEqual({
      status: 'matched',
      analysisId: claimed.id,
    });
    expect(markMatched).toHaveBeenCalledWith({
      id: claimed.id,
      referenceTrackId: track.id,
      fingerprintSimilarity: 0.62,
      secondBestSimilarity: 0.56,
      peakMargin: 0.06,
      timeScale: 0.995,
      referenceOffsetMs: 88_576,
      matchedDurationMs: 15_000,
    });
  });

  it('stores a no-match result', async () => {
    claimNextPending.mockResolvedValueOnce(claimed);
    listReadyTracks.mockResolvedValueOnce([track]);
    createSignedUrl
      .mockResolvedValueOnce('https://storage.test/query')
      .mockResolvedValueOnce('https://storage.test/reference');
    analyse.mockResolvedValueOnce({
      status: 'no_match',
      provider: 'concert_sequence',
      referenceTrackId: null,
      fingerprintSimilarity: 0.55,
      secondBestSimilarity: 0.54,
      peakMargin: 0.01,
      timeScale: 1,
      referenceOffsetMs: null,
      matchedDurationMs: null,
      error: null,
    });
    markNoMatch.mockResolvedValueOnce({ ...claimed, status: 'no_match' });

    await expect(processor().processNext()).resolves.toEqual({
      status: 'no_match',
      analysisId: claimed.id,
    });
    expect(markNoMatch).toHaveBeenCalledWith({
      id: claimed.id,
      fingerprintSimilarity: 0.55,
      secondBestSimilarity: 0.54,
      peakMargin: 0.01,
      timeScale: 1,
    });
  });

  it.each([
    ['pending', 'retrying'],
    ['failed', 'failed'],
  ] as const)(
    'releases a failed analysis as %s',
    async (storedStatus, resultStatus) => {
      claimNextPending.mockResolvedValueOnce(claimed);
      listReadyTracks.mockResolvedValueOnce([track]);
      createSignedUrl.mockRejectedValueOnce(new Error('Storage unavailable'));
      releaseAfterFailure.mockResolvedValueOnce({
        ...claimed,
        status: storedStatus,
      });

      await expect(processor().processNext()).resolves.toMatchObject({
        status: resultStatus,
        analysisId: claimed.id,
        error: 'Storage unavailable',
      });
    },
  );
});
