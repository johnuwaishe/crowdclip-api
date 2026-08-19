import { Injectable } from '@nestjs/common';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioAnalyzerProcessRunner } from './audio-analyzer-process.runner';

export interface AudioAnalyzerReferenceInput {
  trackId: string;
  source: string;
}

export interface ConcertAudioAnalysisInput {
  mediaAssetId: string;
  source: string;
  references: AudioAnalyzerReferenceInput[];
}

export type ConcertAudioAnalysisResult =
  | {
      status: 'matched';
      provider: 'concert_sequence';
      referenceTrackId: string;
      fingerprintSimilarity: number;
      secondBestSimilarity: number;
      peakMargin: number;
      timeScale: number;
      pitchShiftCents: number;
      pitchSimilarity: number;
      pitchMargin: number;
      referenceOffsetMs: number;
      matchedDurationMs: number;
      error: null;
    }
  | {
      status: 'no_match';
      provider: 'concert_sequence';
      referenceTrackId: null;
      fingerprintSimilarity: number;
      secondBestSimilarity: number;
      peakMargin: number;
      timeScale: number;
      pitchShiftCents: null;
      pitchSimilarity: null;
      pitchMargin: null;
      referenceOffsetMs: null;
      matchedDurationMs: null;
      error: null;
    };

@Injectable()
export class ConcertAudioAnalyzerClient {
  constructor(
    private readonly config: AudioAnalysisConfig,
    private readonly processRunner: AudioAnalyzerProcessRunner,
  ) {}

  async analyse(
    input: ConcertAudioAnalysisInput,
  ): Promise<ConcertAudioAnalysisResult> {
    if (input.references.length === 0) {
      throw new Error('Audio analysis requires at least one reference track');
    }

    const request = JSON.stringify({
      query: { id: input.mediaAssetId, source: input.source },
      references: input.references,
      settings: {
        ffmpegTimeoutSeconds: Math.max(
          1,
          Math.floor(this.config.processTimeoutMs / 1_000),
        ),
      },
    });
    const processResult = await this.processRunner.run({
      command: this.config.pythonExecutable,
      args: ['-m', 'audio_analysis.cli'],
      cwd: this.config.analyserWorkingDirectory,
      stdin: request,
      timeoutMs: this.config.processTimeoutMs,
    });
    const result = this.parseResult(processResult.stdout);

    if (result.status === 'failed') {
      throw new Error(result.error);
    }
    if (processResult.exitCode !== 0) {
      const details = processResult.stderr.trim().slice(0, 1_000);
      throw new Error(
        `Audio analyser exited with code ${processResult.exitCode}${details ? `: ${details}` : ''}`,
      );
    }
    if (
      result.status === 'matched' &&
      !input.references.some(
        (reference) => reference.trackId === result.referenceTrackId,
      )
    ) {
      throw new Error('Audio analyser returned an unknown reference track ID');
    }

    return result;
  }

  private parseResult(
    value: string,
  ): ConcertAudioAnalysisResult | { status: 'failed'; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error('Audio analyser returned invalid JSON', { cause: error });
    }
    if (!this.isObject(parsed) || typeof parsed.status !== 'string') {
      throw new Error('Audio analyser returned an invalid result');
    }
    if (parsed.status === 'failed') {
      if (typeof parsed.error !== 'string' || !parsed.error) {
        throw new Error('Audio analyser failed without an error message');
      }
      return { status: 'failed', error: parsed.error };
    }
    if (parsed.status !== 'matched' && parsed.status !== 'no_match') {
      throw new Error('Audio analyser returned an unknown status');
    }
    if (
      parsed.provider !== 'concert_sequence' ||
      !this.isUnitNumber(parsed.fingerprintSimilarity) ||
      !this.isUnitNumber(parsed.secondBestSimilarity) ||
      typeof parsed.peakMargin !== 'number' ||
      parsed.peakMargin < -1 ||
      parsed.peakMargin > 1 ||
      typeof parsed.timeScale !== 'number' ||
      parsed.timeScale <= 0 ||
      parsed.error !== null
    ) {
      throw new Error('Audio analyser returned invalid match evidence');
    }
    if (parsed.status === 'matched') {
      if (
        typeof parsed.referenceTrackId !== 'string' ||
        !parsed.referenceTrackId ||
        typeof parsed.referenceOffsetMs !== 'number' ||
        !Number.isSafeInteger(parsed.referenceOffsetMs) ||
        parsed.referenceOffsetMs < 0 ||
        typeof parsed.matchedDurationMs !== 'number' ||
        !Number.isSafeInteger(parsed.matchedDurationMs) ||
        parsed.matchedDurationMs <= 0 ||
        typeof parsed.pitchShiftCents !== 'number' ||
        !Number.isFinite(parsed.pitchShiftCents) ||
        !this.isSignedUnitNumber(parsed.pitchSimilarity) ||
        typeof parsed.pitchMargin !== 'number' ||
        parsed.pitchMargin < -2 ||
        parsed.pitchMargin > 2
      ) {
        throw new Error('Audio analyser returned an invalid match');
      }
      return parsed as ConcertAudioAnalysisResult;
    }
    if (
      parsed.referenceTrackId !== null ||
      parsed.referenceOffsetMs !== null ||
      parsed.matchedDurationMs !== null ||
      parsed.pitchShiftCents !== null ||
      parsed.pitchSimilarity !== null ||
      parsed.pitchMargin !== null
    ) {
      throw new Error('Audio analyser returned an invalid no-match result');
    }
    return parsed as ConcertAudioAnalysisResult;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isUnitNumber(value: unknown): value is number {
    return typeof value === 'number' && value >= 0 && value <= 1;
  }

  private isSignedUnitNumber(value: unknown): value is number {
    return typeof value === 'number' && value >= -1 && value <= 1;
  }
}
