BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- Seeded demo data may exist locally; clear it inside this rolled-back
-- transaction so the lifecycle assertions start from a fresh pending row.
DELETE FROM public.demo_reference_tracks WHERE demo_id = 'baby-keem-casino-live';

SELECT plan(22);

SELECT has_table('public', 'demo_reference_tracks', 'demo reference track table exists');
SELECT has_pk('public', 'demo_reference_tracks', 'one reference track per demo');
SELECT has_trigger(
    'public',
    'demo_reference_tracks',
    'set_demo_reference_tracks_updated_at',
    'reference track updates maintain updated_at'
);

SELECT ok(
    (
        SELECT NOT public
            AND allowed_mime_types = ARRAY['video/mp4', 'audio/mp4', 'image/jpeg', 'image/png', 'image/webp']
        FROM storage.buckets
        WHERE id = 'demo-media'
    ),
    'demo bucket stays private and allows only demo video, audio, and artwork'
);

SELECT ok(
    (
        SELECT relrowsecurity
        FROM pg_class
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_class.relname = 'demo_reference_tracks'
    ),
    'RLS is enabled on reference track metadata'
);

SELECT ok(
    NOT has_table_privilege('anon', 'public.demo_reference_tracks', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.demo_reference_tracks', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.demo_reference_tracks', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.demo_reference_tracks', 'INSERT'),
    'browser roles have no direct reference track privileges'
);

SELECT ok(
    has_table_privilege('service_role', 'public.demo_reference_tracks', 'SELECT')
    AND has_table_privilege('service_role', 'public.demo_reference_tracks', 'INSERT')
    AND has_table_privilege('service_role', 'public.demo_reference_tracks', 'UPDATE')
    AND has_table_privilege('service_role', 'public.demo_reference_tracks', 'DELETE'),
    'only the server service role receives reference track privileges'
);

SELECT lives_ok(
    $$ INSERT INTO public.demo_reference_tracks (demo_id, artist, title, duration_ms)
       VALUES ('baby-keem-casino-live', 'Baby Keem', 'CA$INO', 260899) $$,
    'a reference track starts pending with no object metadata'
);

SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET duration_ms = 999
       WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'implausibly short reference recordings are rejected'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'published'
       WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'unknown lifecycle states are rejected'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'failed'
       WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'failed rows require a diagnostic'
);
SELECT lives_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'failed', last_error = 'ffmpeg unavailable'
       WHERE demo_id = 'baby-keem-casino-live' $$,
    'failed rows accept a bounded diagnostic'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET last_error = repeat('x', 1001)
       WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'failure diagnostics are bounded'
);
SELECT lives_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'ingesting', last_error = NULL
       WHERE demo_id = 'baby-keem-casino-live' $$,
    'a failed ingest can be safely retried'
);

SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'stored'
       WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'stored rows require complete object metadata'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'stored', storage_bucket = 'public',
        storage_path = 'baby-keem-casino-live/reference.m4a', mime_type = 'audio/mp4',
        byte_size = 4096, peaks = array_fill(500::SMALLINT, ARRAY[118]), stored_at = NOW() WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'stored rows cannot point at another bucket'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = '../escape.m4a', mime_type = 'audio/mp4', byte_size = 4096,
        peaks = array_fill(500::SMALLINT, ARRAY[118]), stored_at = NOW() WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'stored rows cannot escape their demo object prefix'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = 'baby-keem-casino-live/reference.m4a', mime_type = 'text/html',
        byte_size = 4096, peaks = array_fill(500::SMALLINT, ARRAY[118]), stored_at = NOW() WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'stored rows reject active-content MIME types'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = 'baby-keem-casino-live/reference.m4a', mime_type = 'audio/mp4',
        byte_size = 26214401, peaks = array_fill(500::SMALLINT, ARRAY[118]), stored_at = NOW() WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'stored rows cannot exceed the private bucket limit'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = 'baby-keem-casino-live/reference.m4a', mime_type = 'audio/mp4',
        byte_size = 4096, peaks = array_fill(500::SMALLINT, ARRAY[16]), stored_at = NOW()
       WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'waveform arrays below the minimum resolution are rejected'
);
SELECT throws_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = 'baby-keem-casino-live/reference.m4a', mime_type = 'audio/mp4',
        byte_size = 4096, peaks = array_fill(1001::SMALLINT, ARRAY[118]), stored_at = NOW()
       WHERE demo_id = 'baby-keem-casino-live' $$,
    '23514', NULL, 'waveform levels outside 0-1000 are rejected'
);
SELECT lives_ok(
    $$ UPDATE public.demo_reference_tracks SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = 'baby-keem-casino-live/reference.m4a', mime_type = 'audio/mp4',
        byte_size = 4096, peaks = array_fill(500::SMALLINT, ARRAY[118]), stored_at = NOW() WHERE demo_id = 'baby-keem-casino-live' $$,
    'a complete, in-prefix, bounded AAC object is accepted'
);

SELECT * FROM finish();

ROLLBACK;
