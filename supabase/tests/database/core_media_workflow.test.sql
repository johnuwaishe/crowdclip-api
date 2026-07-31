BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

SELECT plan(32);

SELECT has_table('public', 'fans', 'fans table exists');
SELECT has_table('public', 'clips', 'clips table exists');
SELECT has_table('public', 'media_assets', 'media_assets table exists');
SELECT has_table(
    'public',
    'original_file_requests',
    'original_file_requests table exists'
);
SELECT has_column(
    'public',
    'webhook_events',
    'next_attempt_at',
    'webhook events can delay retry attempts'
);
SELECT has_column(
    'public',
    'original_file_requests',
    'upload_started_at',
    'original-file requests track upload leases'
);
SELECT has_column(
    'public',
    'original_file_requests',
    'upload_lease_id',
    'original-file upload attempts have unique lease owners'
);

SELECT has_trigger(
    'public',
    'webhook_events',
    'set_webhook_events_updated_at',
    'webhook_events maintains updated_at'
);
SELECT has_trigger(
    'public',
    'fans',
    'set_fans_updated_at',
    'fans maintains updated_at'
);
SELECT has_trigger(
    'public',
    'clips',
    'set_clips_updated_at',
    'clips maintains updated_at'
);
SELECT has_trigger(
    'public',
    'media_assets',
    'set_media_assets_updated_at',
    'media_assets maintains updated_at'
);
SELECT has_trigger(
    'public',
    'original_file_requests',
    'set_original_file_requests_updated_at',
    'original_file_requests maintains updated_at'
);

SELECT col_is_unique(
    'public',
    'fans',
    'instagram_scoped_user_id',
    'a fan Instagram ID is unique'
);
SELECT col_is_unique(
    'public',
    'clips',
    'source_webhook_event_id',
    'one webhook event creates at most one clip'
);
SELECT col_is_unique(
    'public',
    'media_assets',
    ARRAY['clip_id', 'asset_type'],
    'one clip has at most one asset of each type'
);
SELECT col_is_unique(
    'public',
    'original_file_requests',
    'clip_id',
    'one clip has at most one original-file request'
);
SELECT col_is_unique(
    'public',
    'original_file_requests',
    'upload_token_hash',
    'upload token hashes are unique'
);

INSERT INTO public.webhook_events (
    external_event_id,
    event_type,
    sender_id,
    recipient_id,
    payload,
    occurred_at
)
VALUES (
    'pgtap-story-mention',
    'story_mention',
    'pgtap-fan',
    'pgtap-artist',
    '{"message":{"mid":"pgtap-story-mention"}}'::jsonb,
    NOW()
);

INSERT INTO public.fans (
    instagram_scoped_user_id,
    updated_at
)
VALUES (
    'pgtap-fan',
    '2000-01-01T00:00:00Z'
);

INSERT INTO public.clips (
    fan_id,
    source_webhook_event_id,
    mentioned_at
)
SELECT
    fans.id,
    webhook_events.id,
    webhook_events.occurred_at
FROM public.fans
JOIN public.webhook_events
    ON webhook_events.sender_id = fans.instagram_scoped_user_id
WHERE webhook_events.external_event_id = 'pgtap-story-mention';

SELECT throws_ok(
    $$
        UPDATE public.clips
        SET media_choice = 'invalid-choice'
        WHERE source_webhook_event_id = (
            SELECT id
            FROM public.webhook_events
            WHERE external_event_id = 'pgtap-story-mention'
        )
    $$,
    '23514'
);

SELECT throws_ok(
    $$
        INSERT INTO public.clips (fan_id, source_webhook_event_id)
        SELECT clips.fan_id, clips.source_webhook_event_id
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention'
    $$,
    '23505'
);

SELECT throws_ok(
    $$
        INSERT INTO public.media_assets (
            clip_id,
            asset_type,
            status
        )
        SELECT clips.id, 'instagram_story', 'downloading'
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention'
    $$,
    '23514'
);

SELECT throws_ok(
    $$
        INSERT INTO public.media_assets (
            clip_id,
            asset_type,
            status
        )
        SELECT clips.id, 'instagram_story', 'stored'
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention'
    $$,
    '23514'
);

SELECT throws_ok(
    $$
        INSERT INTO public.original_file_requests (
            clip_id,
            upload_token_hash,
            expires_at
        )
        SELECT clips.id, 'plaintext-token', NOW() + INTERVAL '7 days'
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention'
    $$,
    '23514'
);

SELECT throws_ok(
    $$
        INSERT INTO public.original_file_requests (
            clip_id,
            upload_token_hash,
            expires_at
        )
        SELECT clips.id, repeat('b', 64), NOW() - INTERVAL '1 day'
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention'
    $$,
    '23514'
);

SELECT throws_ok(
    $$
        INSERT INTO public.original_file_requests (
            clip_id,
            upload_token_hash,
            expires_at,
            status
        )
        SELECT
            clips.id,
            repeat('c', 64),
            NOW() + INTERVAL '7 days',
            'uploading'
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention'
    $$,
    '23514'
);

SELECT lives_ok(
    $$
        INSERT INTO public.media_assets (
            clip_id,
            asset_type,
            source_url
        )
        SELECT
            clips.id,
            'instagram_story',
            'https://example.test/story'
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention';

        UPDATE public.media_assets
        SET status = 'downloading',
            attempt_count = attempt_count + 1,
            download_started_at = NOW()
        WHERE asset_type = 'instagram_story'
          AND clip_id = (
              SELECT clips.id
              FROM public.clips
              JOIN public.webhook_events
                  ON webhook_events.id = clips.source_webhook_event_id
              WHERE webhook_events.external_event_id = 'pgtap-story-mention'
          );

        UPDATE public.media_assets
        SET status = 'stored',
            storage_bucket = 'clips',
            storage_path = clip_id::text || '/instagram-story.mp4',
            mime_type = 'video/mp4',
            byte_size = 1024,
            stored_at = NOW()
        WHERE asset_type = 'instagram_story'
          AND clip_id = (
              SELECT clips.id
              FROM public.clips
              JOIN public.webhook_events
                  ON webhook_events.id = clips.source_webhook_event_id
              WHERE webhook_events.external_event_id = 'pgtap-story-mention'
          );

        UPDATE public.clips
        SET media_choice = 'request_fan_original'
        WHERE source_webhook_event_id = (
            SELECT id
            FROM public.webhook_events
            WHERE external_event_id = 'pgtap-story-mention'
        );

        INSERT INTO public.original_file_requests (
            clip_id,
            upload_token_hash,
            expires_at
        )
        SELECT clips.id, repeat('a', 64), NOW() + INTERVAL '7 days'
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention';

        UPDATE public.original_file_requests
        SET status = 'sending',
            attempt_count = attempt_count + 1,
            sending_started_at = NOW()
        WHERE clip_id = (
            SELECT clips.id
            FROM public.clips
            JOIN public.webhook_events
                ON webhook_events.id = clips.source_webhook_event_id
            WHERE webhook_events.external_event_id = 'pgtap-story-mention'
        );

        UPDATE public.original_file_requests
        SET status = 'sent',
            instagram_message_id = 'pgtap-outgoing-message',
            sent_at = NOW()
        WHERE clip_id = (
            SELECT clips.id
            FROM public.clips
            JOIN public.webhook_events
                ON webhook_events.id = clips.source_webhook_event_id
            WHERE webhook_events.external_event_id = 'pgtap-story-mention'
          );

        UPDATE public.original_file_requests
        SET status = 'uploading',
            upload_started_at = NOW(),
            upload_lease_id = '7ad85e44-af72-430c-a8ca-14db25b3e37e'
        WHERE clip_id = (
            SELECT clips.id
            FROM public.clips
            JOIN public.webhook_events
                ON webhook_events.id = clips.source_webhook_event_id
            WHERE webhook_events.external_event_id = 'pgtap-story-mention'
        );

        INSERT INTO public.media_assets (
            clip_id,
            asset_type,
            status,
            storage_bucket,
            storage_path,
            mime_type,
            byte_size,
            stored_at
        )
        SELECT
            clips.id,
            'fan_original',
            'stored',
            'clips',
            clips.id::text || '/fan-original.mov',
            'video/quicktime',
            4096,
            NOW()
        FROM public.clips
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention';

        UPDATE public.original_file_requests
        SET status = 'fulfilled',
            upload_started_at = NULL,
            upload_lease_id = NULL,
            fulfilled_at = NOW()
        WHERE clip_id = (
            SELECT clips.id
            FROM public.clips
            JOIN public.webhook_events
                ON webhook_events.id = clips.source_webhook_event_id
            WHERE webhook_events.external_event_id = 'pgtap-story-mention'
        );

        UPDATE public.webhook_events
        SET status = 'processed',
            processed_at = NOW()
        WHERE external_event_id = 'pgtap-story-mention';
    $$,
    'the complete story-to-original workflow succeeds'
);

SELECT is(
    (
        SELECT COUNT(*)
        FROM public.media_assets
        JOIN public.clips
            ON clips.id = media_assets.clip_id
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention'
    ),
    2::BIGINT,
    'the Instagram and fan-original versions share one clip'
);

SELECT is(
    (
        SELECT original_file_requests.status
        FROM public.original_file_requests
        JOIN public.clips
            ON clips.id = original_file_requests.clip_id
        JOIN public.webhook_events
            ON webhook_events.id = clips.source_webhook_event_id
        WHERE webhook_events.external_event_id = 'pgtap-story-mention'
    ),
    'fulfilled',
    'the original-file request is fulfilled'
);

SELECT is(
    (
        SELECT status
        FROM public.webhook_events
        WHERE external_event_id = 'pgtap-story-mention'
    ),
    'processed',
    'the source webhook event is processed'
);

UPDATE public.fans
SET instagram_scoped_user_id = instagram_scoped_user_id
WHERE instagram_scoped_user_id = 'pgtap-fan';

SELECT ok(
    (
        SELECT updated_at > '2000-01-01T00:00:00Z'::TIMESTAMPTZ
        FROM public.fans
        WHERE instagram_scoped_user_id = 'pgtap-fan'
    ),
    'updated_at changes automatically'
);

SELECT ok(
    (
        SELECT COUNT(*) = 5
            AND BOOL_AND(relrowsecurity)
        FROM pg_class
        JOIN pg_namespace
            ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_class.relname IN (
              'webhook_events',
              'fans',
              'clips',
              'media_assets',
              'original_file_requests'
          )
    ),
    'RLS is enabled on every application table'
);

SELECT ok(
    (
        SELECT COUNT(*) = 6
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
              'webhook_events_status_idx',
              'webhook_events_processing_started_at_idx',
              'media_assets_pending_next_attempt_idx',
              'media_assets_download_started_at_idx',
              'original_file_requests_status_expires_at_idx',
              'original_file_requests_upload_started_at_idx'
          )
    ),
    'worker and monitoring indexes exist'
);

SELECT ok(
    (
        SELECT NOT public
            AND file_size_limit = 52428800
            AND allowed_mime_types @> ARRAY['image/*', 'video/*']
        FROM storage.buckets
        WHERE id = 'clip-media'
    ),
    'clip media bucket is private and restricted'
);

SELECT * FROM finish();

ROLLBACK;
