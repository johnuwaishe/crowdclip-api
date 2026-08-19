import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import youtubeDl from 'youtube-dl-exec';
import { DemoClipSource } from './casino-demo';
import { DemoConfig } from './demo.config';

const execFileAsync = promisify(execFile);

// YouTube serves different clients different media URLs, and some of them 403
// on the media fetch even though the format list resolves fine.
export const SOURCE_PLAYER_CLIENTS = [
  null,
  'web_embedded',
  'android_vr',
  'tv_embedded',
] as const;

/**
 * Whole-source download flags.
 *
 * Ranged downloads (`--download-sections`) hand the media URL to ffmpeg, which
 * fetches it without yt-dlp's client context and is refused with HTTP 403 on
 * most of these uploads. Fetching the file through yt-dlp itself and cutting
 * locally avoids that entirely, and since the demo draws many excerpts from a
 * handful of long uploads it is also far less work: one download per video
 * rather than one per excerpt.
 */
export function buildSourceFlags(
  output: string,
  maximumBytes: number,
  playerClient: string | null = null,
) {
  return {
    // 360p is ample for timeline tiles and roughly a third the bytes of 480p.
    format: 'bv[height<=360]+ba/18/best[height<=360]/best',
    mergeOutputFormat: 'mp4',
    maxFilesize: String(maximumBytes),
    noPlaylist: true,
    noWarnings: true,
    output,
    ...(playerClient
      ? { extractorArgs: `youtube:player_client=${playerClient}` }
      : {}),
  } as const;
}

/**
 * Ranged download flags.
 *
 * Cheapest when it works: yt-dlp hands the media URL to ffmpeg and only the
 * needed seconds cross the wire. It is tried first, but ffmpeg fetches without
 * yt-dlp's client context and YouTube refuses that with HTTP 403 on some
 * uploads, so `buildSourceFlags` above backs it up.
 */
export function buildExcerptFlags(
  source: DemoClipSource,
  output: string,
  playerClient: string | null = null,
) {
  const start = source.sourceStartMs / 1_000;
  const end = (source.sourceStartMs + source.excerptDurationMs) / 1_000;
  return {
    downloadSections: `*${start}-${end}`,
    forceKeyframesAtCuts: true,
    format: 'best[height<=720]/best',
    mergeOutputFormat: 'mp4',
    recodeVideo: 'mp4',
    noPlaylist: true,
    noWarnings: true,
    output,
    ...(playerClient
      ? { extractorArgs: `youtube:player_client=${playerClient}` }
      : {}),
  } as const;
}

export function buildTrimArgs(
  source: DemoClipSource,
  input: string,
  output: string,
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(source.sourceStartMs / 1_000),
    '-i',
    input,
    '-t',
    String(source.excerptDurationMs / 1_000),
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    '-y',
    output,
  ];
}

type CachedSource = {
  videoId: string;
  directory: string;
  path?: string;
  failure?: Error;
};

@Injectable()
export class DemoClipDownloader {
  // Only one source file is held at a time, so the seed's peak disk cost is a
  // single upload rather than every upload it touches. Callers should group
  // their excerpts by video to avoid re-downloading.
  private cached: CachedSource | null = null;

  constructor(private readonly config: DemoConfig) {}

  async download(source: DemoClipSource): Promise<{
    data: Buffer;
    mimeType: 'video/mp4';
    byteSize: number;
  }> {
    const directory = await mkdtemp(join(tmpdir(), 'crowdclip-demo-'));
    const output = join(directory, 'excerpt.mp4');
    try {
      try {
        await this.downloadRange(source, output);
      } catch {
        // Ranged fetch refused; fall back to cutting from a whole copy.
        const input = await this.sourceFile(source);
        await execFileAsync(
          this.config.ffmpegPath,
          buildTrimArgs(source, input, output),
          { timeout: this.config.downloadTimeoutMs, maxBuffer: 1024 * 1024 },
        );
      }
      const data = await readFile(output);
      if (data.length === 0 || data.length > this.config.maximumExcerptBytes) {
        throw new Error('Downloaded excerpt has an invalid byte size');
      }
      if (data.subarray(4, 8).toString('ascii') !== 'ftyp') {
        throw new Error('Downloaded excerpt is not an MP4 container');
      }
      return { data, mimeType: 'video/mp4', byteSize: data.length };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async downloadRange(
    source: DemoClipSource,
    output: string,
  ): Promise<void> {
    let lastError: unknown = new Error('No ranged download was attempted');
    for (const playerClient of SOURCE_PLAYER_CLIENTS) {
      try {
        await youtubeDl(
          source.sourceUrl,
          buildExcerptFlags(source, output, playerClient),
          this.spawnOptions(),
        );
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private spawnOptions() {
    return {
      timeout: this.config.downloadTimeoutMs,
      env: this.config.pythonBinDirectory
        ? {
            ...process.env,
            PATH: `${this.config.pythonBinDirectory}:${process.env.PATH ?? ''}`,
          }
        : process.env,
    };
  }

  /** Drops the cached source file. Call once a seed run is finished. */
  async release(): Promise<void> {
    if (!this.cached) return;
    await rm(this.cached.directory, { recursive: true, force: true });
    this.cached = null;
  }

  private async sourceFile(source: DemoClipSource): Promise<string> {
    if (this.cached?.videoId === source.videoId) {
      // A source that could not be fetched fails its remaining excerpts
      // immediately rather than being retried once per excerpt.
      if (this.cached.failure) throw this.cached.failure;
      if (this.cached.path) return this.cached.path;
    }
    await this.release();

    const directory = await mkdtemp(join(tmpdir(), 'crowdclip-source-'));
    const cached: CachedSource = { videoId: source.videoId, directory };
    this.cached = cached;
    const output = join(directory, `${source.videoId}.mp4`);
    const spawnOptions = {
      ...this.spawnOptions(),
      // A whole upload is orders of magnitude larger than one excerpt, so it
      // cannot share the per-excerpt timeout.
      timeout: this.config.sourceDownloadTimeoutMs,
    };

    let lastError: unknown = new Error('No source download was attempted');
    for (const playerClient of SOURCE_PLAYER_CLIENTS) {
      try {
        await youtubeDl(
          source.sourceUrl,
          buildSourceFlags(
            output,
            this.config.maximumSourceBytes,
            playerClient,
          ),
          spawnOptions,
        );
        const stats = await stat(output);
        if (stats.size === 0) throw new Error('Source download is empty');
        cached.path = output;
        return output;
      } catch (error) {
        lastError = error;
      }
    }
    cached.failure =
      lastError instanceof Error ? lastError : new Error(String(lastError));
    throw cached.failure;
  }
}
