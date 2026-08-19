import {
  CASINO_REFERENCE_AUDIO_PATH,
  CASINO_REFERENCE_DURATION_MS,
  CASINO_REFERENCE_TRACK,
} from './casino-demo';
import {
  bucketPeaks,
  buildPeakArgs,
  buildTranscodeArgs,
  REFERENCE_AUDIO_DURATION_TOLERANCE_MS,
  REFERENCE_AUDIO_MIME_TYPE,
  REFERENCE_AUDIO_PEAK_COUNT,
} from './demo-reference-audio.service';

describe('buildTranscodeArgs', () => {
  const args = buildTranscodeArgs('/tmp/casino.wav', '/tmp/reference.m4a');

  it('reads the operator file and writes only the transcoded output', () => {
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/casino.wav');
    expect(args[args.length - 1]).toBe('/tmp/reference.m4a');
  });

  it('drops video and produces seekable AAC audio', () => {
    expect(args).toContain('-vn');
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
  });
});

describe('reference track constants', () => {
  it('stores AAC audio at the demo-scoped object path the database enforces', () => {
    expect(REFERENCE_AUDIO_MIME_TYPE).toBe('audio/mp4');
    expect(CASINO_REFERENCE_AUDIO_PATH).toBe(
      'baby-keem-casino-live/reference.m4a',
    );
  });

  it('binds the reference audio to the duration every clip is placed against', () => {
    expect(CASINO_REFERENCE_TRACK.durationMs).toBe(
      CASINO_REFERENCE_DURATION_MS,
    );
    expect(REFERENCE_AUDIO_DURATION_TOLERANCE_MS).toBe(1_500);
  });
});

describe('bucketPeaks', () => {
  it('summarises the signal as normalised buckets the column accepts', () => {
    // A ramp: each bucket is louder than the last, so the shape is checkable.
    const samples = Int16Array.from({ length: 11_800 }, (_, index) =>
      Math.round((index / 11_800) * 32_000),
    );

    const peaks = bucketPeaks(samples, REFERENCE_AUDIO_PEAK_COUNT);

    expect(peaks).toHaveLength(118);
    expect(Math.max(...peaks)).toBe(1_000);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0);
    expect(peaks.every((value) => Number.isInteger(value))).toBe(true);
    expect([...peaks].sort((a, b) => a - b)).toEqual(peaks);
  });

  it('refuses silence rather than emitting a flat waveform', () => {
    const silence = new Int16Array(11_800);
    expect(() => bucketPeaks(silence, REFERENCE_AUDIO_PEAK_COUNT)).toThrow(
      'Reference audio is silent',
    );
  });

  it('refuses audio too short to fill the buckets', () => {
    expect(() =>
      bucketPeaks(new Int16Array(64), REFERENCE_AUDIO_PEAK_COUNT),
    ).toThrow('too short');
  });

  it('decodes peaks from the transcoded output as raw mono PCM', () => {
    const args = buildPeakArgs('/tmp/reference.m4a', '/tmp/peaks.pcm');
    expect(args[args.indexOf('-f') + 1]).toBe('s16le');
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
    expect(args).toContain('-vn');
  });
});
