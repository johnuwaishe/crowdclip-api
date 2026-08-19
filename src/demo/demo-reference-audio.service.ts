import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DemoConfig } from './demo.config';

const execFileAsync = promisify(execFile);

export const REFERENCE_AUDIO_MIME_TYPE = 'audio/mp4';
export const REFERENCE_AUDIO_DURATION_TOLERANCE_MS = 1_500;
// Matches the bar count the timeline renders; the column accepts 32-512.
export const REFERENCE_AUDIO_PEAK_COUNT = 118;
const PEAK_SAMPLE_RATE = 8_000;

export function buildPeakArgs(input: string, output: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(PEAK_SAMPLE_RATE),
    '-f',
    's16le',
    '-y',
    output,
  ];
}

export function bucketPeaks(samples: Int16Array, buckets: number): number[] {
  const size = Math.floor(samples.length / buckets);
  if (size < 1)
    throw new Error('Reference audio is too short to measure peaks');
  const levels: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    let sum = 0;
    const start = bucket * size;
    for (let index = start; index < start + size; index += 1) {
      const sample = samples[index] / 32_768;
      sum += sample * sample;
    }
    levels.push(Math.sqrt(sum / size));
  }
  // Normalised against the loudest bucket so the drawn waveform fills its box
  // regardless of how quietly the recording was mastered.
  const loudest = Math.max(...levels);
  if (!(loudest > 0)) throw new Error('Reference audio is silent');
  return levels.map((level) => Math.round((level / loudest) * 1_000));
}

export function buildTranscodeArgs(input: string, output: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    // Audio only, whatever container the operator hands us.
    '-vn',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    // The browser must be able to seek the moment playback starts.
    '-movflags',
    '+faststart',
    '-y',
    output,
  ];
}

@Injectable()
export class DemoReferenceAudioIngestor {
  constructor(private readonly config: DemoConfig) {}

  async ingest(expectedDurationMs: number): Promise<{
    data: Buffer;
    mimeType: typeof REFERENCE_AUDIO_MIME_TYPE;
    byteSize: number;
    peaks: number[];
  }> {
    const source = this.config.referenceAudioPath;
    if (!source) throw new Error('DEMO_REFERENCE_AUDIO_PATH is not configured');
    await stat(source);

    const directory = await mkdtemp(join(tmpdir(), 'crowdclip-demo-audio-'));
    const output = join(directory, 'reference.m4a');
    try {
      await execFileAsync(
        this.config.ffmpegPath,
        buildTranscodeArgs(source, output),
        { timeout: this.config.downloadTimeoutMs, maxBuffer: 1024 * 1024 },
      );

      // Every clip is positioned against CASINO_REFERENCE_DURATION_MS, so a
      // recording of a different length would silently desync all of them.
      const durationMs = await this.probeDurationMs(output);
      if (
        Math.abs(durationMs - expectedDurationMs) >
        REFERENCE_AUDIO_DURATION_TOLERANCE_MS
      ) {
        throw new Error(
          `Reference audio is ${durationMs}ms but the timeline expects ${expectedDurationMs}ms`,
        );
      }

      const data = await readFile(output);
      if (
        data.length === 0 ||
        data.length > this.config.maximumReferenceAudioBytes
      ) {
        throw new Error('Reference audio has an invalid byte size');
      }
      if (data.subarray(4, 8).toString('ascii') !== 'ftyp') {
        throw new Error('Reference audio is not an MP4 container');
      }
      // Measured from the transcoded output, so the waveform describes exactly
      // the audio the browser will play.
      const peaks = await this.extractPeaks(output, directory);
      return {
        data,
        mimeType: REFERENCE_AUDIO_MIME_TYPE,
        byteSize: data.length,
        peaks,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async extractPeaks(
    source: string,
    directory: string,
  ): Promise<number[]> {
    const raw = join(directory, 'peaks.pcm');
    await execFileAsync(this.config.ffmpegPath, buildPeakArgs(source, raw), {
      timeout: this.config.downloadTimeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const buffer = await readFile(raw);
    const samples = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      Math.floor(buffer.byteLength / Int16Array.BYTES_PER_ELEMENT),
    );
    return bucketPeaks(samples, REFERENCE_AUDIO_PEAK_COUNT);
  }

  private async probeDurationMs(path: string): Promise<number> {
    const { stdout } = await execFileAsync(
      this.config.ffprobePath,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        path,
      ],
      { timeout: 30_000, maxBuffer: 64 * 1024 },
    );
    const seconds = Number(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error('Reference audio duration could not be measured');
    }
    return Math.round(seconds * 1_000);
  }
}
