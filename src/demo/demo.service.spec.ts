import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import {
  CASINO_DEMO_SOURCES,
  CASINO_REFERENCE_DURATION_MS,
} from './casino-demo';
import { DemoArtworkIngestor } from './demo-artwork.service';
import { DemoClipDownloader } from './demo-clip-downloader.service';
import { DemoConfig } from './demo.config';
import { DemoMediaAssetsRepository } from './demo-media-assets.repository';
import { DemoReferenceAudioIngestor } from './demo-reference-audio.service';
import { DemoReferenceTracksRepository } from './demo-reference-tracks.repository';
import { DemoService } from './demo.service';

const row = (id: string, status: 'pending' | 'stored' = 'pending') => ({
  id,
  demo_id: 'baby-keem-casino-live',
  creator: 'Creator',
  venue: 'Venue',
  city: 'City',
  source_provider: 'youtube' as const,
  source_url: 'https://www.youtube.com/watch?v=f7_t_nfAmcE',
  video_id: 'f7_t_nfAmcE',
  source_start_ms: 0,
  reference_start_ms: 12000,
  excerpt_duration_ms: 12000,
  status,
  storage_bucket: status === 'stored' ? 'demo-media' : null,
  storage_path: status === 'stored' ? `baby-keem-casino-live/${id}.mp4` : null,
  mime_type: status === 'stored' ? 'video/mp4' : null,
  byte_size: status === 'stored' ? 1024 : null,
  last_error: null,
  stored_at: status === 'stored' ? new Date() : null,
  created_at: new Date(),
  updated_at: new Date(),
});

const referenceRow = (
  status: 'pending' | 'ingesting' | 'stored' | 'failed' = 'pending',
  artwork = false,
) => ({
  artwork_bucket: artwork ? 'demo-media' : null,
  artwork_path: artwork ? 'baby-keem-casino-live/reference-artwork' : null,
  artwork_mime_type: artwork ? 'image/jpeg' : null,
  demo_id: 'baby-keem-casino-live',
  artist: 'Baby Keem',
  title: 'CA$INO',
  duration_ms: CASINO_REFERENCE_DURATION_MS,
  status,
  storage_bucket: status === 'stored' ? 'demo-media' : null,
  storage_path:
    status === 'stored' ? 'baby-keem-casino-live/reference.m4a' : null,
  mime_type: status === 'stored' ? 'audio/mp4' : null,
  byte_size: status === 'stored' ? 4096 : null,
  peaks: status === 'stored' ? Array.from({ length: 118 }, () => 500) : null,
  last_error: status === 'failed' ? 'ffmpeg unavailable' : null,
  stored_at: status === 'stored' ? new Date() : null,
  created_at: new Date(),
  updated_at: new Date(),
});

describe('DemoService', () => {
  const repository = {
    list: jest.fn(),
    upsert: jest.fn(),
    markDownloading: jest.fn(),
    markStored: jest.fn(),
    markFailed: jest.fn(),
  };
  const downloader = { download: jest.fn(), release: jest.fn() };
  const storage = { upload: jest.fn(), createSignedUrl: jest.fn() };
  const referenceTracks = {
    get: jest.fn(),
    upsert: jest.fn(),
    markIngesting: jest.fn(),
    markStored: jest.fn(),
    markFailed: jest.fn(),
    markArtworkStored: jest.fn(),
  };
  const referenceAudio = { ingest: jest.fn() };
  const referenceArtwork = { ingest: jest.fn() };
  const config = {
    storageBucket: 'demo-media',
    signedUrlTtlSeconds: 900,
    referenceAudioPath: null as string | null,
    referenceArtworkPath: null as string | null,
  };
  // Rebuilt per test: the service memoises signed URLs, so a shared instance
  // would let one test's cache silently satisfy the next test's assertion.
  let service: DemoService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DemoService(
      repository as unknown as DemoMediaAssetsRepository,
      downloader as unknown as DemoClipDownloader,
      storage as unknown as SupabaseObjectStorage,
      config as DemoConfig,
      referenceTracks as unknown as DemoReferenceTracksRepository,
      referenceAudio as unknown as DemoReferenceAudioIngestor,
      referenceArtwork as unknown as DemoArtworkIngestor,
    );
    config.referenceAudioPath = null;
    config.referenceArtworkPath = null;
    referenceTracks.get.mockResolvedValue(null);
    referenceTracks.upsert.mockResolvedValue(referenceRow('pending'));
    referenceArtwork.ingest.mockResolvedValue({
      data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      mimeType: 'image/jpeg',
      byteSize: 4,
    });
    referenceAudio.ingest.mockResolvedValue({
      data: Buffer.from('0000ftypM4A '),
      mimeType: 'audio/mp4',
      byteSize: 12,
      peaks: Array.from({ length: 118 }, (_, index) => index * 8),
    });
  });

  it('signs only stored private objects and never exposes storage paths', async () => {
    repository.list.mockResolvedValue([
      row(CASINO_DEMO_SOURCES[0].id, 'stored'),
      row(CASINO_DEMO_SOURCES[1].id, 'pending'),
      {
        ...row(CASINO_DEMO_SOURCES[2].id, 'pending'),
        status: 'failed',
        last_error: 'network unavailable',
      },
    ]);
    storage.createSignedUrl.mockResolvedValue(
      'https://storage.example/signed?token=short-lived',
    );

    const result = await service.getDemo();

    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrl).toHaveBeenCalledWith({
      bucket: 'demo-media',
      path: `baby-keem-casino-live/${CASINO_DEMO_SOURCES[0].id}.mp4`,
      expiresInSeconds: 900,
    });
    expect(result.clips[0].playbackUrl).toContain('signed?token=');
    expect(result.clips[1].playbackUrl).toBeNull();
    expect(result.clips[2].error).toBe('Excerpt unavailable');
    expect(JSON.stringify(result)).not.toContain('storage_path');
    expect(JSON.stringify(result)).not.toContain('network unavailable');
  });

  it('skips already stored excerpts and uploads pending excerpts privately', async () => {
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(
          row(
            source.id,
            source.id === CASINO_DEMO_SOURCES[0].id ? 'stored' : 'pending',
          ),
        ),
    );
    downloader.download.mockResolvedValue({
      data: Buffer.from('0000ftyp'),
      mimeType: 'video/mp4',
      byteSize: 8,
    });

    const result = await service.seed();

    expect(result.skipped).toEqual([CASINO_DEMO_SOURCES[0].id]);
    expect(result.stored).toHaveLength(CASINO_DEMO_SOURCES.length - 1);
    expect(storage.upload).toHaveBeenCalledTimes(
      CASINO_DEMO_SOURCES.length - 1,
    );
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'demo-media',
        contentType: 'video/mp4',
      }),
    );
    expect(repository.markStored).toHaveBeenCalledTimes(
      CASINO_DEMO_SOURCES.length - 1,
    );
  });

  it('records a bounded failure without aborting the remaining seed', async () => {
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(row(source.id)),
    );
    downloader.download
      .mockRejectedValueOnce(new Error('download unavailable'))
      .mockResolvedValue({
        data: Buffer.from('0000ftyp'),
        mimeType: 'video/mp4',
        byteSize: 8,
      });

    const result = await service.seed();

    // Seeding walks excerpts grouped by upload, so which clip draws the single
    // rejection depends on that order rather than on the array order.
    expect(result.failed).toHaveLength(1);
    expect(result.stored).toHaveLength(CASINO_DEMO_SOURCES.length - 1);
    expect(repository.markFailed).toHaveBeenCalledWith(
      result.failed[0],
      'download unavailable',
    );
  });
  it('signs the stored reference track with the same private-object pattern', async () => {
    repository.list.mockResolvedValue([]);
    referenceTracks.get.mockResolvedValue(referenceRow('stored'));
    storage.createSignedUrl.mockResolvedValue(
      'https://storage.example/signed?token=short-lived',
    );

    const result = await service.getDemo();

    expect(storage.createSignedUrl).toHaveBeenCalledWith({
      bucket: 'demo-media',
      path: 'baby-keem-casino-live/reference.m4a',
      expiresInSeconds: 900,
    });
    expect(result.referenceTrack.playbackUrl).toContain('signed?token=');
    expect(result.referenceTrack.durationMs).toBe(CASINO_REFERENCE_DURATION_MS);
    expect(result.referenceTrack.peaks).toHaveLength(118);
    expect(result.referenceTrack.bundled).toBe(false);
  });

  it('returns a null reference URL when the track is absent or unstored', async () => {
    repository.list.mockResolvedValue([]);

    referenceTracks.get.mockResolvedValue(null);
    await expect(service.getDemo()).resolves.toMatchObject({
      referenceTrack: { playbackUrl: null },
    });

    referenceTracks.get.mockResolvedValue(referenceRow('failed'));
    const failed = await service.getDemo();

    expect(failed.referenceTrack.playbackUrl).toBeNull();
    expect(failed.referenceTrack.peaks).toBeNull();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
    expect(JSON.stringify(failed)).not.toContain('storage_path');
    expect(JSON.stringify(failed)).not.toContain('ffmpeg unavailable');
  });

  it('skips reference ingest when no operator audio is configured', async () => {
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(row(source.id, 'stored')),
    );

    const result = await service.seed();

    expect(result.referenceTrack).toBe('not-configured');
    expect(referenceAudio.ingest).not.toHaveBeenCalled();
    expect(referenceTracks.upsert).not.toHaveBeenCalled();
  });

  it('stores the reference track once and skips it on a later seed', async () => {
    config.referenceAudioPath = '/tmp/casino.wav';
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(row(source.id, 'stored')),
    );

    const first = await service.seed();

    expect(first.referenceTrack).toBe('stored');
    expect(referenceAudio.ingest).toHaveBeenCalledWith(
      CASINO_REFERENCE_DURATION_MS,
    );
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'demo-media',
        path: 'baby-keem-casino-live/reference.m4a',
        contentType: 'audio/mp4',
      }),
    );
    expect(referenceTracks.markStored).toHaveBeenCalledWith({
      demoId: 'baby-keem-casino-live',
      bucket: 'demo-media',
      path: 'baby-keem-casino-live/reference.m4a',
      mimeType: 'audio/mp4',
      byteSize: 12,
      peaks: Array.from({ length: 118 }, (_, index) => index * 8),
    });

    referenceTracks.upsert.mockResolvedValue(referenceRow('stored'));
    const second = await service.seed();

    expect(second.referenceTrack).toBe('skipped');
    expect(referenceAudio.ingest).toHaveBeenCalledTimes(1);
  });

  it('records a reference audio failure without failing the clip seed', async () => {
    config.referenceAudioPath = '/tmp/casino.wav';
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(row(source.id, 'stored')),
    );
    referenceAudio.ingest.mockRejectedValue(
      new Error(
        'Reference audio is 190000ms but the timeline expects 260899ms',
      ),
    );

    const result = await service.seed();

    expect(result.referenceTrack).toBe('failed');
    expect(result.failed).toEqual([]);
    expect(result.skipped).toHaveLength(CASINO_DEMO_SOURCES.length);
    expect(referenceTracks.markFailed).toHaveBeenCalledWith(
      'baby-keem-casino-live',
      'Reference audio is 190000ms but the timeline expects 260899ms',
    );
  });
  it('hands back the same signed URL so the browser cache survives a reload', async () => {
    repository.list.mockResolvedValue([
      row(CASINO_DEMO_SOURCES[0].id, 'stored'),
    ]);
    referenceTracks.get.mockResolvedValue(null);
    storage.createSignedUrl.mockResolvedValue(
      'https://storage.example/signed?token=a',
    );

    const first = await service.getDemo();
    const second = await service.getDemo();

    // A freshly signed URL is a different string, and a different string is a
    // different cache key — reuse is the whole point.
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(second.clips[0].playbackUrl).toBe(first.clips[0].playbackUrl);
  });

  it('signs recorded reference artwork alongside the audio', async () => {
    repository.list.mockResolvedValue([]);
    referenceTracks.get.mockResolvedValue(referenceRow('stored', true));
    storage.createSignedUrl.mockResolvedValue(
      'https://storage.example/signed?token=short-lived',
    );

    const result = await service.getDemo();

    expect(storage.createSignedUrl).toHaveBeenCalledWith({
      bucket: 'demo-media',
      path: 'baby-keem-casino-live/reference-artwork',
      expiresInSeconds: 900,
    });
    expect(result.referenceTrack.artworkUrl).toContain('signed?token=');
  });

  it('returns a null artwork URL until artwork has been recorded', async () => {
    repository.list.mockResolvedValue([]);
    referenceTracks.get.mockResolvedValue(referenceRow('stored'));
    storage.createSignedUrl.mockResolvedValue(
      'https://storage.example/signed?token=short-lived',
    );

    const result = await service.getDemo();

    expect(result.referenceTrack.artworkUrl).toBeNull();
    expect(storage.createSignedUrl).not.toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'baby-keem-casino-live/reference-artwork',
      }),
    );
  });

  it('stores configured artwork during seed and skips it once recorded', async () => {
    config.referenceArtworkPath = '/tmp/casino.jpg';
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(row(source.id, 'stored')),
    );

    const first = await service.seed();

    expect(first.referenceArtwork).toBe('stored');
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'demo-media',
        path: 'baby-keem-casino-live/reference-artwork',
        contentType: 'image/jpeg',
      }),
    );
    expect(referenceTracks.markArtworkStored).toHaveBeenCalledWith({
      demoId: 'baby-keem-casino-live',
      bucket: 'demo-media',
      path: 'baby-keem-casino-live/reference-artwork',
      mimeType: 'image/jpeg',
    });

    referenceTracks.upsert.mockResolvedValue(referenceRow('pending', true));
    const second = await service.seed();

    expect(second.referenceArtwork).toBe('skipped');
    expect(referenceArtwork.ingest).toHaveBeenCalledTimes(1);
  });

  it('reports artwork seeding as not configured by default', async () => {
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(row(source.id, 'stored')),
    );

    const result = await service.seed();

    expect(result.referenceArtwork).toBe('not-configured');
    expect(referenceArtwork.ingest).not.toHaveBeenCalled();
  });

  it('records an artwork failure without failing the rest of the seed', async () => {
    config.referenceArtworkPath = '/tmp/casino.jpg';
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(row(source.id, 'stored')),
    );
    referenceArtwork.ingest.mockRejectedValue(
      new Error('Reference artwork is not a JPEG, PNG or WebP image'),
    );

    const result = await service.seed();

    expect(result.referenceArtwork).toBe('failed');
    expect(result.skipped).toHaveLength(CASINO_DEMO_SOURCES.length);
    expect(referenceTracks.markArtworkStored).not.toHaveBeenCalled();
  });

  it('asks the storage layer to declare how long media stays fresh', async () => {
    repository.upsert.mockImplementation(
      (_demoId: string, source: { id: string }) =>
        Promise.resolve(row(source.id)),
    );
    downloader.download.mockResolvedValue({
      data: Buffer.from('0000ftyp'),
      mimeType: 'video/mp4',
      byteSize: 8,
    });

    await service.seed();

    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ cacheControlSeconds: 900 }),
    );
  });
});
