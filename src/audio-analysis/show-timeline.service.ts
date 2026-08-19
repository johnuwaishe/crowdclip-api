import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { ShowTimelineRepository } from './show-timeline.repository';

export interface TimelineClip {
  clipId: string;
  mediaAssetId: string;
  videoUrl: string;
  mimeType: string;
  fanInstagramId: string | null;
  referenceOffsetMs: number;
  matchedDurationMs: number;
  fingerprintSimilarity: number;
  peakMargin: number;
  sameMomentGroup: number;
  referenceEndMs: number;
  correction: {
    tempoScale: number;
    pitchShiftCents: number;
    pitchSimilarity: number;
    pitchMargin: number;
  };
  normalizedAudio: {
    status: 'pending' | 'processing' | 'ready' | 'failed';
    url: string | null;
    mimeType: string | null;
    durationMs: number | null;
  };
}

@Injectable()
export class ShowTimelineService {
  constructor(
    private readonly repository: ShowTimelineRepository,
    private readonly storage: SupabaseObjectStorage,
    private readonly config: AudioAnalysisConfig,
  ) {}

  async get(showId: string, workspaceId: string) {
    const rows = await this.repository.list(showId, workspaceId);
    if (rows.length === 0) {
      throw new NotFoundException(
        'Show was not found or has no ready reference songs',
      );
    }
    const first = rows[0];
    const tracks = new Map<
      string,
      {
        id: string;
        title: string;
        artistName: string | null;
        referenceUrl: string;
        clips: TimelineClip[];
      }
    >();
    for (const row of rows) {
      let track = tracks.get(row.reference_track_id);
      if (!track) {
        track = {
          id: row.reference_track_id,
          title: row.reference_track_title,
          artistName: row.reference_track_artist_name,
          referenceUrl: await this.storage.createSignedUrl({
            bucket: row.reference_storage_bucket,
            path: row.reference_storage_path,
            expiresInSeconds: this.config.signedUrlTtlSeconds,
          }),
          clips: [],
        };
        tracks.set(row.reference_track_id, track);
      }
      if (
        !row.clip_id ||
        !row.media_asset_id ||
        !row.media_storage_bucket ||
        !row.media_storage_path ||
        !row.media_mime_type ||
        row.reference_offset_ms === null ||
        row.matched_duration_ms === null ||
        row.fingerprint_similarity === null ||
        row.peak_margin === null ||
        row.time_scale === null ||
        row.pitch_shift_cents === null ||
        row.pitch_similarity === null ||
        row.pitch_margin === null
      ) {
        continue;
      }
      const previous = track.clips.at(-1);
      const offset = Number(row.reference_offset_ms);
      const sameMomentGroup =
        previous && offset - previous.referenceOffsetMs <= 5_000
          ? previous.sameMomentGroup
          : (previous?.sameMomentGroup ?? -1) + 1;
      const normalizedStatus = row.normalized_audio_status ?? 'pending';
      const normalizedUrl =
        normalizedStatus === 'ready' &&
        row.normalized_audio_storage_bucket &&
        row.normalized_audio_storage_path
          ? await this.storage.createSignedUrl({
              bucket: row.normalized_audio_storage_bucket,
              path: row.normalized_audio_storage_path,
              expiresInSeconds: this.config.signedUrlTtlSeconds,
            })
          : null;
      const matchedDurationMs = Number(row.matched_duration_ms);
      track.clips.push({
        clipId: row.clip_id,
        mediaAssetId: row.media_asset_id,
        videoUrl: await this.storage.createSignedUrl({
          bucket: row.media_storage_bucket,
          path: row.media_storage_path,
          expiresInSeconds: this.config.signedUrlTtlSeconds,
        }),
        mimeType: row.media_mime_type,
        fanInstagramId: row.fan_instagram_scoped_user_id,
        referenceOffsetMs: offset,
        matchedDurationMs,
        referenceEndMs: offset + matchedDurationMs,
        fingerprintSimilarity: row.fingerprint_similarity,
        peakMargin: row.peak_margin,
        sameMomentGroup,
        correction: {
          tempoScale: row.time_scale,
          pitchShiftCents: row.pitch_shift_cents,
          pitchSimilarity: row.pitch_similarity,
          pitchMargin: row.pitch_margin,
        },
        normalizedAudio: {
          status: normalizedStatus,
          url: normalizedUrl,
          mimeType:
            normalizedStatus === 'ready'
              ? row.normalized_audio_mime_type
              : null,
          durationMs:
            normalizedStatus === 'ready' &&
            row.normalized_audio_duration_ms !== null
              ? Number(row.normalized_audio_duration_ms)
              : null,
        },
      });
    }
    return {
      show: {
        id: first.show_id,
        name: first.show_name,
        startsAt: first.show_starts_at,
        status: first.show_status,
      },
      songs: [...tracks.values()],
      mix: {
        referenceGainDb: this.config.referenceMixGainDb,
        crowdGainDb: this.config.crowdMixGainDb,
        crossfadeMs: this.config.stemCrossfadeMs,
      },
      signedUrlsExpireAt: new Date(
        Date.now() + this.config.signedUrlTtlSeconds * 1_000,
      ),
    };
  }
}
