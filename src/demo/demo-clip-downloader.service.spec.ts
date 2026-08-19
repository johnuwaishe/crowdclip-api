import {
  CASINO_DEMO_SOURCES,
  CASINO_EXCERPT_DURATION_MS,
  CASINO_REFERENCE_DURATION_MS,
} from './casino-demo';
import {
  buildSourceFlags,
  buildTrimArgs,
  SOURCE_PLAYER_CLIENTS,
} from './demo-clip-downloader.service';

describe('demo clip downloader', () => {
  it('fetches a bounded, timeline-sized copy of the whole source', () => {
    const flags = buildSourceFlags('/tmp/source.mp4', 400 * 1024 * 1024);

    expect(flags).toEqual(
      expect.objectContaining({
        format: 'bv[height<=360]+ba/18/best[height<=360]/best',
        mergeOutputFormat: 'mp4',
        maxFilesize: String(400 * 1024 * 1024),
        noPlaylist: true,
        output: '/tmp/source.mp4',
      }),
    );
    // No ranged flags: handing the media URL to ffmpeg is what YouTube refuses.
    expect(flags).not.toHaveProperty('downloadSections');
  });

  it('falls back through the player clients that still serve media', () => {
    expect(SOURCE_PLAYER_CLIENTS[0]).toBeNull();
    expect(SOURCE_PLAYER_CLIENTS).toContain('web_embedded');
    expect(buildSourceFlags('/tmp/source.mp4', 1_000, 'web_embedded')).toEqual(
      expect.objectContaining({
        extractorArgs: 'youtube:player_client=web_embedded',
      }),
    );
  });

  it('cuts exactly one excerpt duration from each source moment', () => {
    for (const source of CASINO_DEMO_SOURCES) {
      const args = buildTrimArgs(source, '/tmp/source.mp4', '/tmp/short.mp4');
      expect(Number(args[args.indexOf('-ss') + 1])).toBeCloseTo(
        source.sourceStartMs / 1_000,
        6,
      );
      expect(Number(args[args.indexOf('-t') + 1])).toBeCloseTo(
        CASINO_EXCERPT_DURATION_MS / 1_000,
        6,
      );
      // -ss must precede -i so ffmpeg seeks rather than decoding from zero.
      expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    }
  });

  it('places every excerpt inside the reference track', () => {
    for (const source of CASINO_DEMO_SOURCES) {
      expect(source.referenceStartMs).toBeGreaterThanOrEqual(0);
      expect(
        source.referenceStartMs + source.excerptDurationMs,
      ).toBeLessThanOrEqual(CASINO_REFERENCE_DURATION_MS);
    }
  });

  it('covers the reference track continuously with overlapping angles', () => {
    const slots = new Set(
      CASINO_DEMO_SOURCES.map(({ referenceStartMs }) =>
        Math.floor(referenceStartMs / CASINO_EXCERPT_DURATION_MS),
      ),
    );
    const ordered = [...slots].sort((a, b) => a - b);

    // Fingerprinting found no angle for the intro or the outro. Inside the
    // covered stretch a single missing slot is tolerable, but two in a row
    // would leave the timeline with 24s of song and nothing to cut to.
    expect(ordered.length).toBeGreaterThanOrEqual(15);
    const gaps = ordered
      .slice(1)
      .map((slot, index) => slot - ordered[index] - 1)
      .filter((gap) => gap > 0);
    expect(Math.max(0, ...gaps)).toBeLessThanOrEqual(1);

    // Several slots carry more than one angle, which is what makes the
    // timeline worth cutting between.
    expect(CASINO_DEMO_SOURCES.length).toBeGreaterThan(slots.size);
    // Three cities today; long-form uploads cannot be fetched from YouTube, so
    // the roster is whatever short sources exist until more are added.
    expect(
      new Set(CASINO_DEMO_SOURCES.map(({ city }) => city)).size,
    ).toBeGreaterThanOrEqual(3);
  });

  it('draws many excerpts from few uploads, so downloads are reused', () => {
    const uploads = new Set(CASINO_DEMO_SOURCES.map(({ videoId }) => videoId));

    // This ratio is the whole point of fetching sources once: 27 excerpts from
    // a handful of uploads means a handful of downloads, not 27.
    expect(uploads.size).toBeLessThan(CASINO_DEMO_SOURCES.length / 2);
    expect(
      CASINO_DEMO_SOURCES.every(
        ({ sourceStartMs, excerptDurationMs, sourceDurationMs }) =>
          sourceStartMs + excerptDurationMs <= sourceDurationMs,
      ),
    ).toBe(true);
  });
});
