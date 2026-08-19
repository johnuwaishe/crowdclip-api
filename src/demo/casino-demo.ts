export const CASINO_DEMO_ID = 'baby-keem-casino-live';
export const CASINO_REFERENCE_DURATION_MS = 260_899;
export const CASINO_EXCERPT_DURATION_MS = 12_000;
export const CASINO_REFERENCE_START_MS = 12_000;

export const CASINO_REFERENCE_TRACK = {
  artist: 'Baby Keem',
  title: 'CA$INO',
  durationMs: CASINO_REFERENCE_DURATION_MS,
} as const;

export const CASINO_REFERENCE_AUDIO_PATH = `${CASINO_DEMO_ID}/reference.m4a`;
export const CASINO_REFERENCE_ARTWORK_PATH = `${CASINO_DEMO_ID}/reference-artwork`;

export type DemoClipSource = {
  id: string;
  creator: string;
  venue: string;
  city: string;
  platform: 'youtube';
  videoId: string;
  sourceUrl: string;
  sourceStartMs: number;
  sourceDurationMs: number;
  referenceStartMs: number;
  excerptDurationMs: number;
};

function youtubeSource(input: {
  id: string;
  creator: string;
  venue: string;
  city: string;
  videoId: string;
  songStartMs: number;
  excerptOffsetMs?: number;
  referenceStartMs?: number;
  kind?: 'watch' | 'shorts';
  sourceDurationMs: number;
}): DemoClipSource {
  const excerptOffsetMs = input.excerptOffsetMs ?? CASINO_REFERENCE_START_MS;
  const sourceStartMs = input.songStartMs + excerptOffsetMs;
  const sourceStartSeconds = Math.floor(sourceStartMs / 1_000);

  return {
    id: input.id,
    creator: input.creator,
    venue: input.venue,
    city: input.city,
    platform: 'youtube',
    videoId: input.videoId,
    sourceUrl:
      input.kind === 'shorts'
        ? `https://www.youtube.com/shorts/${input.videoId}`
        : `https://www.youtube.com/watch?v=${input.videoId}&t=${sourceStartSeconds}s`,
    sourceStartMs,
    sourceDurationMs: input.sourceDurationMs,
    referenceStartMs: input.referenceStartMs ?? excerptOffsetMs,
    excerptDurationMs: CASINO_EXCERPT_DURATION_MS,
  };
}

export const CASINO_DEMO_SOURCES: DemoClipSource[] = [
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-37s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 12000,
    referenceStartMs: 41082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-49s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 24000,
    referenceStartMs: 53082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-61s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 36000,
    referenceStartMs: 65082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-las-vegas-nv-woopdattrick-69s',
    creator: 'WOOPDATTRICK',
    venue: 'CA$INO Tour',
    city: 'Las Vegas, NV',
    videoId: 'WauHPYXufQs',
    songStartMs: 68813,
    excerptOffsetMs: 0,
    referenceStartMs: 73011,
    sourceDurationMs: 283423,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-73s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 48000,
    referenceStartMs: 77082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-las-vegas-nv-woopdattrick-81s',
    creator: 'WOOPDATTRICK',
    venue: 'CA$INO Tour',
    city: 'Las Vegas, NV',
    videoId: 'WauHPYXufQs',
    songStartMs: 68813,
    excerptOffsetMs: 12000,
    referenceStartMs: 84999,
    sourceDurationMs: 283423,
  }),
  youtubeSource({
    id: 'casino-miami-beach-fl-yungwilliewill-140s',
    creator: 'YungWillieWill',
    venue: 'The Fillmore Jackie Gleason Theater',
    city: 'Miami Beach, FL',
    videoId: 'ak2BkFN80QA',
    songStartMs: 127795,
    excerptOffsetMs: 12000,
    referenceStartMs: 86330,
    sourceDurationMs: 313980,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-85s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 60000,
    referenceStartMs: 89082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-97s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 72000,
    referenceStartMs: 101082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-109s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 84000,
    referenceStartMs: 113082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-121s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 96000,
    referenceStartMs: 125082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-133s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 108000,
    referenceStartMs: 137082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-145s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 120000,
    referenceStartMs: 149082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-157s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 132000,
    referenceStartMs: 161082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-new-york-ny-cakesscam-169s',
    creator: 'CakessCam',
    venue: 'Webster Hall',
    city: 'New York, NY',
    videoId: 'yabXopwkIVs',
    songStartMs: 24576,
    excerptOffsetMs: 144000,
    referenceStartMs: 173082,
    sourceDurationMs: 198949,
  }),
  youtubeSource({
    id: 'casino-las-vegas-nv-woopdattrick-189s',
    creator: 'WOOPDATTRICK',
    venue: 'CA$INO Tour',
    city: 'Las Vegas, NV',
    videoId: 'WauHPYXufQs',
    songStartMs: 176947,
    excerptOffsetMs: 12000,
    referenceStartMs: 193134,
    sourceDurationMs: 283423,
  }),
  youtubeSource({
    id: 'casino-miami-beach-fl-yungwilliewill-248s',
    creator: 'YungWillieWill',
    venue: 'The Fillmore Jackie Gleason Theater',
    city: 'Miami Beach, FL',
    videoId: 'ak2BkFN80QA',
    songStartMs: 235930,
    excerptOffsetMs: 12000,
    referenceStartMs: 194477,
    sourceDurationMs: 313980,
  }),
  youtubeSource({
    id: 'casino-miami-beach-fl-yungwilliewill-260s',
    creator: 'YungWillieWill',
    venue: 'The Fillmore Jackie Gleason Theater',
    city: 'Miami Beach, FL',
    videoId: 'ak2BkFN80QA',
    songStartMs: 235930,
    excerptOffsetMs: 24000,
    referenceStartMs: 206477,
    sourceDurationMs: 313980,
  }),
  youtubeSource({
    id: 'casino-miami-beach-fl-yungwilliewill-272s',
    creator: 'YungWillieWill',
    venue: 'The Fillmore Jackie Gleason Theater',
    city: 'Miami Beach, FL',
    videoId: 'ak2BkFN80QA',
    songStartMs: 235930,
    excerptOffsetMs: 36000,
    referenceStartMs: 218477,
    sourceDurationMs: 313980,
  }),
];

export const CASINO_DEMO_DISCOVERY_SOURCES = [
  {
    platform: 'reddit',
    url: 'https://www.reddit.com/r/KendrickLamar/comments/1sms6sy/some_clips_of_baby_keems_1st_show_of_the_caino/',
    attribution:
      'u/Easy-Worker-8819; original clips credited to PgLang Updates',
    note: 'Discovery and attribution only; no Reddit-hosted media is imported.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/shorts/f7_t_nfAmcE',
    attribution: 'Shi-Fi — user-selected CA$INO Tour clip',
    note: 'Preserved as a show reference, but excluded from the CA$INO song timeline after fingerprinting returned no match.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=ak2BkFN80QA',
    attribution: 'YungWillieWill — The Fillmore Jackie Gleason Theater',
    note: 'Excluded from the CA$INO song timeline after fingerprinting returned no match.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=WauHPYXufQs',
    attribution: 'WOOPDATTRICK — Las Vegas',
    note: 'Longer-window fingerprint match retained as a playable angle; source link preserved for attribution.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=8voL-JpfobA',
    attribution: 'angelslucki — Bayou Music Center, Houston',
    note: 'Excluded from the CA$INO song timeline after fingerprinting returned no match.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=VU8V24kuBuU',
    attribution: 'MaxShoots — CA$INO Tour, Raleigh',
    note: 'Full-show discovery source; intentionally not downloaded by the demo seed.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=GysJEiN5OnE',
    attribution: 'CULTCERT — Webster Hall, New York',
    note: 'Full-show discovery source; intentionally not downloaded by the demo seed.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=V0xT9CYtidQ',
    attribution: 'DallasVisuals — CA$INO Tour, Dallas',
    note: 'Full-show discovery source; intentionally not downloaded by the demo seed.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=Vizc3XdykBY',
    attribution: 'MaxShoots — CA$INO Tour, Detroit',
    note: 'Full-show discovery source; intentionally not downloaded by the demo seed.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=RIJkczwbcQE',
    attribution: 'Saul — CA$INO Tour, Los Angeles night two',
    note: 'Full-show discovery source; intentionally not downloaded by the demo seed.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=dU12OOS6gcI',
    attribution: 'jaden — CA$INO Tour, Atlanta',
    note: 'Full-show discovery source; intentionally not downloaded by the demo seed.',
  },
  {
    platform: 'youtube',
    url: 'https://www.youtube.com/watch?v=ajgr__6p_Oc',
    attribution: 'gloss — CA$INO Tour, Washington, DC',
    note: 'Additional discovery source; intentionally not downloaded by the demo seed.',
  },
] as const;

export type DemoClipView = DemoClipSource & {
  status: 'pending' | 'downloading' | 'stored' | 'failed';
  playbackUrl: string | null;
  thumbnailUrl: string;
  byteSize: number | null;
  error: string | null;
};

export type CasinoDemoView = {
  id: string;
  kind: 'stored-excerpt-demo';
  show: {
    artist: string;
    name: string;
    tour: string;
  };
  referenceTrack: {
    artist: string;
    title: string;
    durationMs: number;
    bundled: false;
    playbackUrl: string | null;
    artworkUrl: string | null;
    peaks: number[] | null;
  };
  clips: DemoClipView[];
  discoverySources: typeof CASINO_DEMO_DISCOVERY_SOURCES;
};
