import { Injectable } from '@nestjs/common';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import {
  CASINO_DEMO_DISCOVERY_SOURCES,
  CASINO_DEMO_ID,
  CASINO_DEMO_SOURCES,
  CASINO_REFERENCE_ARTWORK_PATH,
  CASINO_REFERENCE_AUDIO_PATH,
  CASINO_REFERENCE_DURATION_MS,
  CASINO_REFERENCE_TRACK,
  CasinoDemoView,
  DemoClipView,
} from './casino-demo';
import { DemoArtworkIngestor } from './demo-artwork.service';
import { DemoClipDownloader } from './demo-clip-downloader.service';
import { DemoConfig } from './demo.config';
import { DemoMediaAssetsRepository } from './demo-media-assets.repository';
import { DemoReferenceAudioIngestor } from './demo-reference-audio.service';
import { DemoReferenceTracksRepository } from './demo-reference-tracks.repository';

export type ReferenceTrackSeedOutcome =
  'stored' | 'skipped' | 'failed' | 'not-configured';

export type ReferenceArtworkSeedOutcome = ReferenceTrackSeedOutcome;

@Injectable()
export class DemoService {
  constructor(
    private readonly repository: DemoMediaAssetsRepository,
    private readonly downloader: DemoClipDownloader,
    private readonly storage: SupabaseObjectStorage,
    private readonly config: DemoConfig,
    private readonly referenceTracks: DemoReferenceTracksRepository,
    private readonly referenceAudio: DemoReferenceAudioIngestor,
    private readonly referenceArtwork: DemoArtworkIngestor,
  ) {}

  /**
   * Signing the same object twice yields two different URLs, and a different
   * URL is a different cache key — so every reload refetched media the browser
   * already had. Handing back the same URL until it approaches expiry is what
   * makes the cache useful across page loads.
   */
  private readonly signedUrls = new Map<
    string,
    { url: string; reuseUntil: number }
  >();

  private async signedUrl(bucket: string, path: string): Promise<string> {
    const key = `${bucket}/${path}`;
    const cached = this.signedUrls.get(key);
    const now = Date.now();
    if (cached && cached.reuseUntil > now) return cached.url;
    const url = await this.storage.createSignedUrl({
      bucket,
      path,
      expiresInSeconds: this.config.signedUrlTtlSeconds,
    });
    // Stop reusing at the halfway mark so anything handed out still has most of
    // its life left when the page starts playing it.
    this.signedUrls.set(key, {
      url,
      reuseUntil: now + (this.config.signedUrlTtlSeconds * 1_000) / 2,
    });
    return url;
  }

  async getDemo(): Promise<CasinoDemoView> {
    const [rows, referenceRow] = await Promise.all([
      this.repository.list(CASINO_DEMO_ID),
      this.referenceTracks.get(CASINO_DEMO_ID),
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const clips: DemoClipView[] = await Promise.all(
      CASINO_DEMO_SOURCES.map(async (source) => {
        const row = byId.get(source.id);
        let playbackUrl: string | null = null;
        if (
          row?.status === 'stored' &&
          row.storage_bucket &&
          row.storage_path
        ) {
          playbackUrl = await this.signedUrl(
            row.storage_bucket,
            row.storage_path,
          );
        }
        return {
          ...source,
          status: row?.status ?? 'pending',
          playbackUrl,
          thumbnailUrl: `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`,
          byteSize: row?.byte_size ?? null,
          error: row?.status === 'failed' ? 'Excerpt unavailable' : null,
        };
      }),
    );
    let referencePlaybackUrl: string | null = null;
    if (
      referenceRow?.status === 'stored' &&
      referenceRow.storage_bucket &&
      referenceRow.storage_path
    ) {
      referencePlaybackUrl = await this.signedUrl(
        referenceRow.storage_bucket,
        referenceRow.storage_path,
      );
    }
    let referenceArtworkUrl: string | null = null;
    if (referenceRow?.artwork_bucket && referenceRow.artwork_path) {
      referenceArtworkUrl = await this.signedUrl(
        referenceRow.artwork_bucket,
        referenceRow.artwork_path,
      );
    }
    return {
      id: CASINO_DEMO_ID,
      kind: 'stored-excerpt-demo',
      show: { artist: 'Baby Keem', name: 'CA$INO live', tour: 'CA$INO Tour' },
      referenceTrack: {
        ...CASINO_REFERENCE_TRACK,
        bundled: false,
        playbackUrl: referencePlaybackUrl,
        artworkUrl: referenceArtworkUrl,
        peaks: referenceRow?.peaks ?? null,
      },
      clips,
      discoverySources: CASINO_DEMO_DISCOVERY_SOURCES,
    };
  }

  async seed(): Promise<{
    stored: string[];
    skipped: string[];
    failed: string[];
    referenceTrack: ReferenceTrackSeedOutcome;
    referenceArtwork: ReferenceArtworkSeedOutcome;
  }> {
    const result = {
      stored: [] as string[],
      skipped: [] as string[],
      failed: [] as string[],
      referenceTrack: 'not-configured' as ReferenceTrackSeedOutcome,
      referenceArtwork: 'not-configured' as ReferenceArtworkSeedOutcome,
    };
    // Excerpts are grouped by upload so each source file is fetched once and
    // dropped before the next one is pulled.
    const ordered = [...CASINO_DEMO_SOURCES].sort(
      (left, right) =>
        left.videoId.localeCompare(right.videoId) ||
        left.sourceStartMs - right.sourceStartMs,
    );
    for (const source of ordered) {
      const row = await this.repository.upsert(CASINO_DEMO_ID, source);
      if (row.status === 'stored') {
        result.skipped.push(source.id);
        continue;
      }
      await this.repository.markDownloading(source.id);
      try {
        const excerpt = await this.downloader.download(source);
        const path = `${CASINO_DEMO_ID}/${source.id}.mp4`;
        await this.storage.upload({
          bucket: this.config.storageBucket,
          path,
          data: excerpt.data,
          contentType: excerpt.mimeType,
          cacheControlSeconds: this.config.signedUrlTtlSeconds,
        });
        await this.repository.markStored({
          id: source.id,
          bucket: this.config.storageBucket,
          path,
          mimeType: excerpt.mimeType,
          byteSize: excerpt.byteSize,
        });
        result.stored.push(source.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown seed failure';
        await this.repository.markFailed(source.id, message);
        result.failed.push(source.id);
      }
    }
    await this.downloader.release();
    result.referenceTrack = await this.seedReferenceTrack();
    result.referenceArtwork = await this.seedReferenceArtwork();
    return result;
  }

  private async seedReferenceArtwork(): Promise<ReferenceArtworkSeedOutcome> {
    if (!this.config.referenceArtworkPath) return 'not-configured';
    const row = await this.referenceTracks.upsert(
      CASINO_DEMO_ID,
      CASINO_REFERENCE_TRACK,
    );
    if (row.artwork_path) return 'skipped';
    try {
      const artwork = await this.referenceArtwork.ingest();
      await this.storage.upload({
        bucket: this.config.storageBucket,
        path: CASINO_REFERENCE_ARTWORK_PATH,
        data: artwork.data,
        contentType: artwork.mimeType,
        cacheControlSeconds: this.config.signedUrlTtlSeconds,
      });
      await this.referenceTracks.markArtworkStored({
        demoId: CASINO_DEMO_ID,
        bucket: this.config.storageBucket,
        path: CASINO_REFERENCE_ARTWORK_PATH,
        mimeType: artwork.mimeType,
      });
      return 'stored';
    } catch {
      // Artwork is decoration: a bad file must never abort the media seed.
      return 'failed';
    }
  }

  private async seedReferenceTrack(): Promise<ReferenceTrackSeedOutcome> {
    if (!this.config.referenceAudioPath) return 'not-configured';
    const row = await this.referenceTracks.upsert(
      CASINO_DEMO_ID,
      CASINO_REFERENCE_TRACK,
    );
    if (row.status === 'stored') return 'skipped';
    await this.referenceTracks.markIngesting(CASINO_DEMO_ID);
    try {
      const audio = await this.referenceAudio.ingest(
        CASINO_REFERENCE_DURATION_MS,
      );
      await this.storage.upload({
        bucket: this.config.storageBucket,
        path: CASINO_REFERENCE_AUDIO_PATH,
        data: audio.data,
        contentType: audio.mimeType,
        cacheControlSeconds: this.config.signedUrlTtlSeconds,
      });
      await this.referenceTracks.markStored({
        demoId: CASINO_DEMO_ID,
        bucket: this.config.storageBucket,
        path: CASINO_REFERENCE_AUDIO_PATH,
        mimeType: audio.mimeType,
        byteSize: audio.byteSize,
        peaks: audio.peaks,
      });
      return 'stored';
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown reference audio failure';
      await this.referenceTracks.markFailed(CASINO_DEMO_ID, message);
      return 'failed';
    }
  }
}
