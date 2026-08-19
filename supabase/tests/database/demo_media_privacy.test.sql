BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(34);

SELECT has_table('public', 'demo_media_assets', 'demo media table exists');
SELECT has_pk('public', 'demo_media_assets', 'demo media IDs are unique');
SELECT has_trigger(
    'public',
    'demo_media_assets',
    'set_demo_media_assets_updated_at',
    'demo media updates maintain updated_at'
);
SELECT has_index(
    'public',
    'demo_media_assets',
    'demo_media_assets_demo_status_idx',
    'demo media lookup index exists'
);

SELECT ok(
    (
        SELECT NOT public
            AND file_size_limit = 26214400
            AND allowed_mime_types = ARRAY['video/mp4', 'audio/mp4', 'image/jpeg', 'image/png', 'image/webp']
        FROM storage.buckets
        WHERE id = 'demo-media'
    ),
    'demo bucket is private, size-bounded, and limited to demo video, audio, and artwork'
);

SELECT ok(
    (
        SELECT relrowsecurity AND NOT relforcerowsecurity
        FROM pg_class
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_class.relname = 'demo_media_assets'
    ),
    'RLS is enabled on demo metadata'
);

SELECT ok(
    NOT has_table_privilege('anon', 'public.demo_media_assets', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.demo_media_assets', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.demo_media_assets', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.demo_media_assets', 'INSERT'),
    'browser roles have no direct demo metadata privileges'
);

SELECT ok(
    has_table_privilege('service_role', 'public.demo_media_assets', 'SELECT')
    AND has_table_privilege('service_role', 'public.demo_media_assets', 'INSERT')
    AND has_table_privilege('service_role', 'public.demo_media_assets', 'UPDATE')
    AND has_table_privilege('service_role', 'public.demo_media_assets', 'DELETE'),
    'only the server service role receives demo metadata privileges'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'demo_media_objects_are_server_only'
          AND permissive = 'RESTRICTIVE'
          AND cmd = 'ALL'
          AND roles @> ARRAY['anon'::name, 'authenticated'::name]
    ),
    'a restrictive Storage policy blocks browser roles'
);

SELECT lives_ok(
    $$
        INSERT INTO public.demo_media_assets (
            id, demo_id, creator, venue, city, source_provider, source_url,
            video_id, source_start_ms, reference_start_ms, excerpt_duration_ms
        ) VALUES (
            'valid-pending', 'baby-keem-casino-live', 'Creator', 'Venue', 'City',
            'youtube', 'https://www.youtube.com/watch?v=f7_t_nfAmcE',
            'f7_t_nfAmcE', 0, 12000, 12000
        )
    $$,
    'a valid pending excerpt can be registered server-side'
);

SELECT throws_ok(
    $$ INSERT INTO public.demo_media_assets (
        id, demo_id, creator, venue, city, source_provider, source_url, video_id,
        source_start_ms, reference_start_ms, excerpt_duration_ms
    ) VALUES ('', 'demo', 'c', 'v', 'c', 'youtube',
        'https://www.youtube.com/watch?v=f7_t_nfAmcE', 'f7_t_nfAmcE', 0, 0, 12000) $$,
    '23514', NULL, 'blank IDs are rejected'
);

SELECT throws_ok(
    $$ INSERT INTO public.demo_media_assets (
        id, demo_id, creator, venue, city, source_provider, source_url, video_id,
        source_start_ms, reference_start_ms, excerpt_duration_ms
    ) VALUES ('bad-provider', 'demo', 'c', 'v', 'c', 'reddit',
        'https://www.youtube.com/watch?v=f7_t_nfAmcE', 'f7_t_nfAmcE', 0, 0, 12000) $$,
    '23514', NULL, 'non-YouTube download providers are rejected'
);

SELECT throws_ok(
    $$ INSERT INTO public.demo_media_assets (
        id, demo_id, creator, venue, city, source_provider, source_url, video_id,
        source_start_ms, reference_start_ms, excerpt_duration_ms
    ) VALUES ('bad-host', 'demo', 'c', 'v', 'c', 'youtube',
        'https://evil.example/video/f7_t_nfAmcE', 'f7_t_nfAmcE', 0, 0, 12000) $$,
    '23514', NULL, 'untrusted source hosts are rejected'
);

SELECT throws_ok(
    $$ INSERT INTO public.demo_media_assets (
        id, demo_id, creator, venue, city, source_provider, source_url, video_id,
        source_start_ms, reference_start_ms, excerpt_duration_ms
    ) VALUES ('bad-video-id', 'demo', 'c', 'v', 'c', 'youtube',
        'https://www.youtube.com/watch?v=short', 'short', 0, 0, 12000) $$,
    '23514', NULL, 'invalid YouTube IDs are rejected'
);

SELECT throws_ok(
    $$ INSERT INTO public.demo_media_assets (
        id, demo_id, creator, venue, city, source_provider, source_url, video_id,
        source_start_ms, reference_start_ms, excerpt_duration_ms
    ) VALUES ('mismatched-id', 'demo', 'c', 'v', 'c', 'youtube',
        'https://www.youtube.com/watch?v=VU8V24kuBuU', 'f7_t_nfAmcE', 0, 0, 12000) $$,
    '23514', NULL, 'source URLs must contain their recorded video ID'
);

SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET source_start_ms = -1 WHERE id = 'valid-pending' $$,
    '23514', NULL, 'negative source offsets are rejected'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET reference_start_ms = -1 WHERE id = 'valid-pending' $$,
    '23514', NULL, 'negative reference offsets are rejected'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET excerpt_duration_ms = 2999 WHERE id = 'valid-pending' $$,
    '23514', NULL, 'excerpts shorter than three seconds are rejected'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET excerpt_duration_ms = 30001 WHERE id = 'valid-pending' $$,
    '23514', NULL, 'excerpts longer than thirty seconds are rejected'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET status = 'published' WHERE id = 'valid-pending' $$,
    '23514', NULL, 'unknown lifecycle states are rejected'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET status = 'failed' WHERE id = 'valid-pending' $$,
    '23514', NULL, 'failed rows require a diagnostic'
);
SELECT lives_ok(
    $$ UPDATE public.demo_media_assets SET status = 'failed', last_error = 'network unavailable' WHERE id = 'valid-pending' $$,
    'failed rows accept a bounded diagnostic'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET last_error = repeat('x', 1001) WHERE id = 'valid-pending' $$,
    '23514', NULL, 'failure diagnostics are bounded to prevent oversized public metadata'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET status = 'pending' WHERE id = 'valid-pending' $$,
    '23514', NULL, 'pending rows cannot retain failure details'
);
SELECT lives_ok(
    $$ UPDATE public.demo_media_assets SET status = 'pending', last_error = NULL WHERE id = 'valid-pending' $$,
    'failed excerpts can be safely reset for retry'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET status = 'stored' WHERE id = 'valid-pending' $$,
    '23514', NULL, 'stored rows require complete object metadata'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET status = 'stored', storage_bucket = 'public',
        storage_path = 'baby-keem-casino-live/valid-pending.mp4', mime_type = 'video/mp4',
        byte_size = 1000, stored_at = NOW() WHERE id = 'valid-pending' $$,
    '23514', NULL, 'stored rows cannot point at another bucket'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = '../escape.mp4', mime_type = 'video/mp4', byte_size = 1000,
        stored_at = NOW() WHERE id = 'valid-pending' $$,
    '23514', NULL, 'stored rows cannot escape the demo object prefix'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = 'baby-keem-casino-live/valid-pending.mp4', mime_type = 'text/html',
        byte_size = 1000, stored_at = NOW() WHERE id = 'valid-pending' $$,
    '23514', NULL, 'stored rows reject active-content MIME types'
);
SELECT throws_ok(
    $$ UPDATE public.demo_media_assets SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = 'baby-keem-casino-live/valid-pending.mp4', mime_type = 'video/mp4',
        byte_size = 26214401, stored_at = NOW() WHERE id = 'valid-pending' $$,
    '23514', NULL, 'stored rows cannot exceed the private bucket limit'
);
SELECT lives_ok(
    $$ UPDATE public.demo_media_assets SET status = 'stored', storage_bucket = 'demo-media',
        storage_path = 'baby-keem-casino-live/valid-pending.mp4', mime_type = 'video/mp4',
        byte_size = 1000, stored_at = NOW() WHERE id = 'valid-pending' $$,
    'complete private MP4 metadata is accepted'
);
SELECT is(
    (SELECT status FROM public.demo_media_assets WHERE id = 'valid-pending'),
    'stored',
    'the valid asset reaches stored state'
);

UPDATE public.demo_media_assets
SET creator = 'Updated creator', updated_at = '2000-01-01T00:00:00Z'
WHERE id = 'valid-pending';
SELECT ok(
    (SELECT updated_at > '2000-01-01T00:00:00Z'::TIMESTAMPTZ
     FROM public.demo_media_assets WHERE id = 'valid-pending'),
    'updated_at cannot be left stale'
);

SELECT throws_ok(
    $$ INSERT INTO public.demo_media_assets (
        id, demo_id, creator, venue, city, source_provider, source_url, video_id,
        source_start_ms, reference_start_ms, excerpt_duration_ms
    ) VALUES ('valid-pending', 'demo', 'c', 'v', 'c', 'youtube',
        'https://www.youtube.com/watch?v=f7_t_nfAmcE', 'f7_t_nfAmcE', 0, 0, 12000) $$,
    '23505', NULL, 'duplicate asset IDs are rejected'
);

SELECT * FROM finish();
ROLLBACK;
