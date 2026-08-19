import { Logger } from '@nestjs/common';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioStemProcessor } from './audio-stem.processor';
import { ClipAudioDerivativesRepository } from './clip-audio-derivatives.repository';
import { ReferenceNormalizedStemRenderer } from './reference-normalized-stem.renderer';
import { ClaimedClipAudioDerivativeRow } from './types/clip-audio-derivative-row.type';

describe('AudioStemProcessor', () => {
  const now = new Date('2026-08-19T00:00:00Z');
  const claimed: ClaimedClipAudioDerivativeRow = {
    id: 'derivative-id',
    analysis_id: 'analysis-id',
    kind: 'reference_normalized_stem',
    algorithm_version: 'reference-normalized-v1',
    status: 'processing',
    storage_bucket: null,
    storage_path: null,
    mime_type: null,
    byte_size: null,
    rendered_duration_ms: null,
    attempt_count: 1,
    error_message: null,
    processing_started_at: now,
    next_attempt_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    media_storage_bucket: 'clip-media',
    media_storage_path: 'clip/video.mp4',
    time_scale: 1.04,
    pitch_shift_cents: 137,
    matched_duration_ms: '15600',
  };
  const config = {
    signedUrlTtlSeconds: 900,
    normalizedStemStorageBucket: 'clip-media',
    maxAttempts: 3,
    retryDelayMs: 60_000,
  } as AudioAnalysisConfig;
  const claimNextPending = jest.fn();
  const markReady = jest.fn();
  const releaseAfterFailure = jest.fn();
  const derivatives = {
    claimNextPending,
    markReady,
    releaseAfterFailure,
  } as unknown as ClipAudioDerivativesRepository;
  const createSignedUrl = jest.fn();
  const upload = jest.fn();
  const storage = {
    createSignedUrl,
    upload,
  } as unknown as SupabaseObjectStorage;
  const render = jest.fn();
  const renderer = { render } as unknown as ReferenceNormalizedStemRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('renders, uploads, and completes a versioned normalized stem', async () => {
    claimNextPending.mockResolvedValueOnce(claimed);
    createSignedUrl.mockResolvedValueOnce('signed:clip');
    render.mockResolvedValueOnce({
      data: Buffer.from('stem'),
      contentType: 'audio/mp4',
      durationMs: 15_600,
    });
    upload.mockResolvedValueOnce(undefined);
    markReady.mockResolvedValueOnce({ ...claimed, status: 'ready' });

    const result = await new AudioStemProcessor(
      config,
      storage,
      derivatives,
      renderer,
    ).processNext();

    expect(result).toEqual({ status: 'ready', derivativeId: claimed.id });
    expect(render).toHaveBeenCalledWith({
      source: 'signed:clip',
      timeScale: 1.04,
      pitchShiftCents: 137,
      targetDurationMs: 15_600,
    });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'normalized-audio/analysis-id/reference-normalized-v1.m4a',
        contentType: 'audio/mp4',
      }),
    );
  });

  it('releases a failed render without publishing original audio', async () => {
    claimNextPending.mockResolvedValueOnce(claimed);
    createSignedUrl.mockResolvedValueOnce('signed:clip');
    render.mockRejectedValueOnce(new Error('rubberband unavailable'));
    releaseAfterFailure.mockResolvedValueOnce({
      ...claimed,
      status: 'pending',
    });

    await expect(
      new AudioStemProcessor(
        config,
        storage,
        derivatives,
        renderer,
      ).processNext(),
    ).resolves.toMatchObject({
      status: 'retrying',
      error: 'rubberband unavailable',
    });
    expect(upload).not.toHaveBeenCalled();
    expect(markReady).not.toHaveBeenCalled();
  });
});
