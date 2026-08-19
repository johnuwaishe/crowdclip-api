import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { ShowTimelineRepository } from './show-timeline.repository';
import { ShowTimelineService } from './show-timeline.service';
import { ShowTimelineRow } from './types/show-timeline-row.type';

describe('ShowTimelineService', () => {
  const now = new Date('2026-08-03T10:00:00.000Z');
  const baseRow: ShowTimelineRow = {
    show_id: 'show-id',
    show_name: 'London night one',
    show_starts_at: now,
    show_status: 'active',
    reference_track_id: 'track-id',
    reference_track_title: 'First Song',
    reference_track_artist_name: 'Artist',
    reference_storage_bucket: 'audio-references',
    reference_storage_path: 'show/track.wav',
    reference_created_at: now,
    clip_id: 'clip-one',
    media_asset_id: 'asset-one',
    media_storage_bucket: 'clip-media',
    media_storage_path: 'clip-one/video.mp4',
    media_mime_type: 'video/mp4',
    fan_instagram_scoped_user_id: 'fan-one',
    reference_offset_ms: '30000',
    matched_duration_ms: '15000',
    fingerprint_similarity: 0.93,
    peak_margin: 0.2,
    time_scale: 1.02,
    pitch_shift_cents: 137,
    pitch_similarity: 0.82,
    pitch_margin: 0.14,
    normalized_audio_status: 'pending',
    normalized_audio_storage_bucket: null,
    normalized_audio_storage_path: null,
    normalized_audio_mime_type: null,
    normalized_audio_duration_ms: null,
  };
  const list = jest.fn();
  const repository = { list } as unknown as ShowTimelineRepository;
  const createSignedUrl = jest.fn(({ path }: { path: string }) =>
    Promise.resolve(`signed:${path}`),
  );
  const storage = { createSignedUrl } as unknown as SupabaseObjectStorage;
  const config = {
    signedUrlTtlSeconds: 900,
    referenceMixGainDb: 0,
    crowdMixGainDb: -4,
    stemCrossfadeMs: 250,
  } as AudioAnalysisConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
  });
  afterEach(() => jest.restoreAllMocks());

  it('places matched videos on each song timeline and groups nearby angles', async () => {
    list.mockResolvedValueOnce([
      baseRow,
      {
        ...baseRow,
        clip_id: 'clip-two',
        media_asset_id: 'asset-two',
        media_storage_path: 'clip-two/video.mp4',
        reference_offset_ms: '34000',
      },
      {
        ...baseRow,
        clip_id: 'clip-three',
        media_asset_id: 'asset-three',
        media_storage_path: 'clip-three/video.mp4',
        reference_offset_ms: '50000',
      },
    ]);
    const service = new ShowTimelineService(repository, storage, config);

    const timeline = await service.get('show-id', 'workspace-id');

    expect(list).toHaveBeenCalledWith('show-id', 'workspace-id');
    expect(timeline.songs[0].referenceUrl).toBe('signed:show/track.wav');
    expect(timeline.songs[0].clips).toEqual([
      expect.objectContaining({
        clipId: 'clip-one',
        referenceOffsetMs: 30000,
        sameMomentGroup: 0,
        referenceEndMs: 45000,
      }),
      expect.objectContaining({
        clipId: 'clip-two',
        referenceOffsetMs: 34000,
        sameMomentGroup: 0,
      }),
      expect.objectContaining({
        clipId: 'clip-three',
        referenceOffsetMs: 50000,
        sameMomentGroup: 1,
      }),
    ]);
    expect(createSignedUrl).toHaveBeenCalledTimes(4);
    expect(timeline.songs[0].clips[0].normalizedAudio).toMatchObject({
      status: 'pending',
      url: null,
    });
    expect(timeline.songs[0].clips[0].correction).toMatchObject({
      tempoScale: 1.02,
      pitchShiftCents: 137,
    });
    expect(timeline.mix).toEqual({
      referenceGainDb: 0,
      crowdGainDb: -4,
      crossfadeMs: 250,
    });
  });

  it('signs only a ready normalized stem', async () => {
    list.mockResolvedValueOnce([
      {
        ...baseRow,
        normalized_audio_status: 'ready',
        normalized_audio_storage_bucket: 'clip-media',
        normalized_audio_storage_path: 'normalized/clip-one.m4a',
        normalized_audio_mime_type: 'audio/mp4',
        normalized_audio_duration_ms: '15000',
      },
    ]);
    const service = new ShowTimelineService(repository, storage, config);

    const timeline = await service.get('show-id', 'workspace-id');

    expect(timeline.songs[0].clips[0].normalizedAudio).toEqual({
      status: 'ready',
      url: 'signed:normalized/clip-one.m4a',
      mimeType: 'audio/mp4',
      durationMs: 15000,
    });
    expect(createSignedUrl).toHaveBeenCalledTimes(3);
  });

  it('keeps a ready reference song visible before any fan clip matches it', async () => {
    list.mockResolvedValueOnce([
      {
        ...baseRow,
        clip_id: null,
        media_asset_id: null,
        media_storage_bucket: null,
        media_storage_path: null,
        media_mime_type: null,
        fan_instagram_scoped_user_id: null,
        reference_offset_ms: null,
        matched_duration_ms: null,
        fingerprint_similarity: null,
        peak_margin: null,
      },
    ]);
    const service = new ShowTimelineService(repository, storage, config);

    const timeline = await service.get('show-id', 'workspace-id');

    expect(timeline.songs[0].clips).toEqual([]);
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });
});
