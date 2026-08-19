import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioAnalyzerProcessRunner } from './audio-analyzer-process.runner';
import { ConcertAudioAnalyzerClient } from './concert-audio-analyzer.client';

describe('ConcertAudioAnalyzerClient', () => {
  const config = {
    pythonExecutable: '/project/audio-analysis/.venv/bin/python',
    analyserWorkingDirectory: '/project/audio-analysis',
    processTimeoutMs: 300_000,
  } as AudioAnalysisConfig;
  const run = jest.fn<
    ReturnType<AudioAnalyzerProcessRunner['run']>,
    Parameters<AudioAnalyzerProcessRunner['run']>
  >();
  const runner = { run } as unknown as AudioAnalyzerProcessRunner;
  const input = {
    mediaAssetId: 'asset-id',
    source: 'https://storage.test/query.mp4',
    references: [
      {
        trackId: 'track-id',
        source: 'https://storage.test/reference.mp3',
      },
    ],
  };

  beforeEach(() => jest.clearAllMocks());

  it('parses a successful match from the Python process', async () => {
    const result = {
      status: 'matched',
      provider: 'concert_sequence',
      referenceTrackId: 'track-id',
      fingerprintSimilarity: 0.621232,
      secondBestSimilarity: 0.56383,
      peakMargin: 0.057402,
      timeScale: 0.995,
      pitchShiftCents: 137,
      pitchSimilarity: 0.81,
      pitchMargin: 0.12,
      referenceOffsetMs: 88_576,
      matchedDurationMs: 15_047,
      error: null,
    };
    run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify(result),
      stderr: '',
    });

    await expect(
      new ConcertAudioAnalyzerClient(config, runner).analyse(input),
    ).resolves.toEqual(result);

    const processInput = run.mock.calls[0][0];
    expect(processInput).toMatchObject({
      command: config.pythonExecutable,
      args: ['-m', 'audio_analysis.cli'],
      cwd: config.analyserWorkingDirectory,
      timeoutMs: config.processTimeoutMs,
    });
    expect(JSON.parse(processInput.stdin)).toMatchObject({
      query: { id: 'asset-id', source: input.source },
      references: input.references,
    });
  });

  it('parses a no-match result without inventing confidence', async () => {
    const result = {
      status: 'no_match',
      provider: 'concert_sequence',
      referenceTrackId: null,
      fingerprintSimilarity: 0.55,
      secondBestSimilarity: 0.54,
      peakMargin: 0.01,
      timeScale: 1,
      pitchShiftCents: null,
      pitchSimilarity: null,
      pitchMargin: null,
      referenceOffsetMs: null,
      matchedDurationMs: null,
      error: null,
    };
    run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify(result),
      stderr: '',
    });

    await expect(
      new ConcertAudioAnalyzerClient(config, runner).analyse(input),
    ).resolves.toEqual(result);
  });

  it('turns a structured Python failure into an application error', async () => {
    run.mockResolvedValueOnce({
      exitCode: 1,
      stdout: JSON.stringify({
        status: 'failed',
        provider: 'concert_sequence',
        error: 'FFmpeg extraction failed: corrupt input',
      }),
      stderr: '',
    });

    await expect(
      new ConcertAudioAnalyzerClient(config, runner).analyse(input),
    ).rejects.toThrow('FFmpeg extraction failed: corrupt input');
  });

  it('rejects a reference ID that was not in the request', async () => {
    run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        status: 'matched',
        provider: 'concert_sequence',
        referenceTrackId: 'unknown-track',
        fingerprintSimilarity: 0.7,
        secondBestSimilarity: 0.5,
        peakMargin: 0.2,
        timeScale: 1,
        pitchShiftCents: 0,
        pitchSimilarity: 0.8,
        pitchMargin: 0.1,
        referenceOffsetMs: 1_000,
        matchedDurationMs: 15_000,
        error: null,
      }),
      stderr: '',
    });

    await expect(
      new ConcertAudioAnalyzerClient(config, runner).analyse(input),
    ).rejects.toThrow('unknown reference track ID');
  });

  it('propagates a process timeout', async () => {
    run.mockRejectedValueOnce(new Error('Audio analyser timed out'));
    await expect(
      new ConcertAudioAnalyzerClient(config, runner).analyse(input),
    ).rejects.toThrow('timed out');
  });
});
