BEGIN;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'demo-media',
    'demo-media',
    FALSE,
    26214400,
    ARRAY['video/mp4']
)
ON CONFLICT (id)
DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.demo_media_assets (
    id TEXT PRIMARY KEY,
    demo_id TEXT NOT NULL,
    creator TEXT NOT NULL,
    venue TEXT NOT NULL,
    city TEXT NOT NULL,
    source_provider TEXT NOT NULL,
    source_url TEXT NOT NULL,
    video_id TEXT NOT NULL,
    source_start_ms INTEGER NOT NULL,
    reference_start_ms INTEGER NOT NULL,
    excerpt_duration_ms INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    storage_bucket TEXT,
    storage_path TEXT,
    mime_type TEXT,
    byte_size BIGINT,
    last_error TEXT,
    stored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT demo_media_assets_text_check CHECK (
        length(btrim(id)) BETWEEN 1 AND 200
        AND length(btrim(demo_id)) BETWEEN 1 AND 200
        AND length(btrim(creator)) BETWEEN 1 AND 200
        AND length(btrim(venue)) BETWEEN 1 AND 300
        AND length(btrim(city)) BETWEEN 1 AND 200
        AND length(btrim(source_url)) BETWEEN 1 AND 2000
        AND length(btrim(video_id)) BETWEEN 1 AND 100
    ),
    CONSTRAINT demo_media_assets_provider_check CHECK (
        source_provider = 'youtube'
    ),
    CONSTRAINT demo_media_assets_source_check CHECK (
        video_id ~ '^[A-Za-z0-9_-]{11}$'
        AND source_url ~ '^https://(www\.)?youtube\.com/(watch\?v=|shorts/)'
        AND (
            source_url LIKE '%v=' || video_id || '%'
            OR source_url LIKE '%/shorts/' || video_id || '%'
        )
    ),
    CONSTRAINT demo_media_assets_timing_check CHECK (
        source_start_ms >= 0
        AND reference_start_ms >= 0
        AND excerpt_duration_ms BETWEEN 3000 AND 30000
    ),
    CONSTRAINT demo_media_assets_status_check CHECK (
        status IN ('pending', 'downloading', 'stored', 'failed')
    ),
    CONSTRAINT demo_media_assets_byte_size_check CHECK (
        byte_size IS NULL OR byte_size BETWEEN 1 AND 26214400
    ),
    CONSTRAINT demo_media_assets_error_length_check CHECK (
        last_error IS NULL OR length(last_error) BETWEEN 1 AND 1000
    ),
    CONSTRAINT demo_media_assets_state_fields_check CHECK (
        (
            status = 'stored'
            AND storage_bucket IS NOT NULL
            AND storage_bucket = 'demo-media'
            AND storage_path ~ '^baby-keem-casino-live/[a-z0-9-]+\.mp4$'
            AND mime_type = 'video/mp4'
            AND byte_size IS NOT NULL
            AND stored_at IS NOT NULL
            AND last_error IS NULL
        )
        OR (
            status <> 'stored'
            AND storage_bucket IS NULL
            AND storage_path IS NULL
            AND mime_type IS NULL
            AND byte_size IS NULL
            AND stored_at IS NULL
            AND (
                (
                    status = 'failed'
                    AND COALESCE(length(btrim(last_error)), 0) > 0
                )
                OR (status IN ('pending', 'downloading') AND last_error IS NULL)
            )
        )
    )
);

CREATE INDEX demo_media_assets_demo_status_idx
ON public.demo_media_assets(demo_id, status, created_at);

CREATE TRIGGER set_demo_media_assets_updated_at
BEFORE UPDATE ON public.demo_media_assets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.demo_media_assets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_media_assets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo_media_assets TO service_role;

CREATE POLICY demo_media_objects_are_server_only
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'demo-media')
WITH CHECK (bucket_id <> 'demo-media');

COMMENT ON TABLE public.demo_media_assets IS
'Short, attributed, privately stored excerpts used by read-only product demos.';

COMMIT;
