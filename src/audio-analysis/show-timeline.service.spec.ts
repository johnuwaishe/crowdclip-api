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
  };
  const list = jest.fn();
  const repository = { list } as unknown as ShowTimelineRepository;
  const createSignedUrl = jest.fn(({ path }: { path: string }) =>
    Promise.resolve(`signed:${path}`),
  );
  const storage = { createSignedUrl } as unknown as SupabaseObjectStorage;
  const config = { signedUrlTtlSeconds: 900 } as AudioAnalysisConfig;

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
