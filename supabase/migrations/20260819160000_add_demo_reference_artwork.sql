BEGIN;

-- The demo bucket now also holds one cover-art image for the reference track.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'video/mp4',
    'audio/mp4',
    'image/jpeg',
    'image/png',
    'image/webp'
]
WHERE id = 'demo-media';

ALTER TABLE public.demo_reference_tracks
    ADD COLUMN artwork_bucket TEXT,
    ADD COLUMN artwork_path TEXT,
    ADD COLUMN artwork_mime_type TEXT,
    ADD CONSTRAINT demo_reference_tracks_artwork_check CHECK (
        (
            artwork_bucket = 'demo-media'
            AND artwork_path = demo_id || '/reference-artwork'
            AND artwork_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
        )
        OR (
            artwork_bucket IS NULL
            AND artwork_path IS NULL
            AND artwork_mime_type IS NULL
        )
    );

COMMENT ON COLUMN public.demo_reference_tracks.artwork_path IS
'Privately stored cover art for the empty-state turntable, served only as a short-lived signed URL.';

COMMIT;
