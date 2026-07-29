BEGIN;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'clip-media',
    'clip-media',
    FALSE,
    52428800,
    ARRAY['image/*', 'video/*']
)
ON CONFLICT (id)
DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.media_assets
ADD COLUMN next_attempt_at TIMESTAMPTZ;

DROP INDEX public.media_assets_status_created_at_idx;

CREATE INDEX media_assets_pending_next_attempt_idx
ON public.media_assets(next_attempt_at, created_at)
WHERE status = 'pending';

CREATE INDEX media_assets_download_started_at_idx
ON public.media_assets(download_started_at)
WHERE status = 'downloading';

COMMIT;
