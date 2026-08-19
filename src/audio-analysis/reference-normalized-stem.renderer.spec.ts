import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioStemCommandRunner } from './audio-stem-command.runner';
import { ReferenceNormalizedStemRenderer } from './reference-normalized-stem.renderer';

jest.mock('node:fs/promises', () => ({
  mkdtemp: jest.fn().mockResolvedValue('/tmp/crowdclip-stem-test'),
  readFile: jest.fn().mockResolvedValue(Buffer.from('rendered')),
  rm: jest.fn().mockResolvedValue(undefined),
}));

describe('ReferenceNormalizedStemRenderer', () => {
  const run = jest.fn<
    ReturnType<AudioStemCommandRunner['run']>,
    Parameters<AudioStemCommandRunner['run']>
  >();
  const runner = { run } as unknown as AudioStemCommandRunner;
  const config = {
    ffmpegExecutable: 'ffmpeg',
    rubberbandExecutable: 'rubberband',
    processTimeoutMs: 300_000,
  } as AudioAnalysisConfig;

  beforeEach(() => jest.clearAllMocks());

  it('corrects tempo and pitch independently before exact-duration encoding', async () => {
    const renderer = new ReferenceNormalizedStemRenderer(config, runner);

    await expect(
      renderer.render({
        source: 'https://storage.test/clip.mp4',
        timeScale: 1.04,
        pitchShiftCents: 137,
        targetDurationMs: 15_600,
      }),
    ).resolves.toEqual({
      data: Buffer.from('rendered'),
      contentType: 'audio/mp4',
      durationMs: 15_600,
    });

    expect(run.mock.calls[1][0].command).toBe('rubberband');
    expect(run.mock.calls[1][0].args.slice(0, 4)).toEqual([
      '-t',
      '1.04000000',
      '-p',
      '-1.370000',
    ]);
    expect(run.mock.calls[2][0].args.join(' ')).toContain(
      'atrim=duration=15.6',
    );
  });
});
