import { Injectable } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioStemCommandRunner } from './audio-stem-command.runner';

export interface RenderNormalizedStemInput {
  source: string;
  timeScale: number;
  pitchShiftCents: number;
  targetDurationMs: number;
}

export interface RenderedNormalizedStem {
  data: Buffer;
  contentType: 'audio/mp4';
  durationMs: number;
}

@Injectable()
export class ReferenceNormalizedStemRenderer {
  constructor(
    private readonly config: AudioAnalysisConfig,
    private readonly runner: AudioStemCommandRunner,
  ) {}

  async render(
    input: RenderNormalizedStemInput,
  ): Promise<RenderedNormalizedStem> {
    if (!Number.isFinite(input.timeScale) || input.timeScale <= 0) {
      throw new Error('Stem time scale must be positive');
    }
    if (
      !Number.isSafeInteger(input.targetDurationMs) ||
      input.targetDurationMs <= 0
    ) {
      throw new Error('Stem target duration must be a positive integer');
    }
    const directory = await mkdtemp(join(tmpdir(), 'crowdclip-stem-'));
    const extracted = join(directory, 'source.wav');
    const corrected = join(directory, 'corrected.wav');
    const output = join(directory, 'normalized.m4a');
    const command = (commandName: string, args: string[]) =>
      this.runner.run({
        command: commandName,
        args,
        cwd: directory,
        timeoutMs: this.config.processTimeoutMs,
      });

    try {
      await command(this.config.ffmpegExecutable, [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        input.source,
        '-vn',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-c:a',
        'pcm_s24le',
        extracted,
      ]);
      await command(this.config.rubberbandExecutable, [
        '-t',
        input.timeScale.toFixed(8),
        '-p',
        (-input.pitchShiftCents / 100).toFixed(6),
        '-c',
        '5',
        extracted,
        corrected,
      ]);

      const durationSeconds = input.targetDurationMs / 1_000;
      const fadeSeconds = Math.min(0.05, durationSeconds / 2);
      const fadeOutStart = Math.max(0, durationSeconds - fadeSeconds);
      await command(this.config.ffmpegExecutable, [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        corrected,
        '-af',
        `loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=${fadeSeconds},afade=t=out:st=${fadeOutStart}:d=${fadeSeconds},apad,atrim=duration=${durationSeconds}`,
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        output,
      ]);
      return {
        data: await readFile(output),
        contentType: 'audio/mp4',
        durationMs: input.targetDurationMs,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
