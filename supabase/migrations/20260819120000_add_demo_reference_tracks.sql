BEGIN;

-- The demo bucket now holds one AAC reference track alongside the MP4 excerpts.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['video/mp4', 'audio/mp4']
WHERE id = 'demo-media';

CREATE TABLE public.demo_reference_tracks (
    demo_id TEXT PRIMARY KEY,
    artist TEXT NOT NULL,
    title TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    storage_bucket TEXT,
    storage_path TEXT,
    mime_type TEXT,
    byte_size BIGINT,
    peaks SMALLINT[],
    last_error TEXT,
    stored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT demo_reference_tracks_text_check CHECK (
        length(btrim(demo_id)) BETWEEN 1 AND 200
        AND length(btrim(artist)) BETWEEN 1 AND 300
        AND length(btrim(title)) BETWEEN 1 AND 300
    ),
    CONSTRAINT demo_reference_tracks_duration_check CHECK (
        duration_ms BETWEEN 1000 AND 900000
    ),
    CONSTRAINT demo_reference_tracks_status_check CHECK (
        status IN ('pending', 'ingesting', 'stored', 'failed')
    ),
    CONSTRAINT demo_reference_tracks_byte_size_check CHECK (
        byte_size IS NULL OR byte_size BETWEEN 1 AND 26214400
    ),
    -- Normalised RMS buckets for the waveform, 0-1000. Bounded so a bad ingest
    -- cannot push an unbounded array into every /demo response.
    CONSTRAINT demo_reference_tracks_peaks_check CHECK (
        peaks IS NULL
        OR (
            array_length(peaks, 1) BETWEEN 32 AND 512
            AND 0 <= ALL(peaks)
            AND 1000 >= ALL(peaks)
        )
    ),
    CONSTRAINT demo_reference_tracks_error_length_check CHECK (
        last_error IS NULL OR length(last_error) BETWEEN 1 AND 1000
    ),
    CONSTRAINT demo_reference_tracks_state_fields_check CHECK (
        (
            status = 'stored'
            AND storage_bucket = 'demo-media'
            AND storage_path = demo_id || '/reference.m4a'
            AND mime_type = 'audio/mp4'
            AND byte_size IS NOT NULL
            AND peaks IS NOT NULL
            AND stored_at IS NOT NULL
            AND last_error IS NULL
        )
        OR (
            status <> 'stored'
            AND storage_bucket IS NULL
            AND storage_path IS NULL
            AND mime_type IS NULL
            AND byte_size IS NULL
            AND peaks IS NULL
            AND stored_at IS NULL
            AND (
                (status = 'failed' AND COALESCE(length(btrim(last_error)), 0) > 0)
                OR (status IN ('pending', 'ingesting') AND last_error IS NULL)
            )
        )
    )
);

CREATE TRIGGER set_demo_reference_tracks_updated_at
BEFORE UPDATE ON public.demo_reference_tracks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.demo_reference_tracks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_reference_tracks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo_reference_tracks TO service_role;

COMMENT ON TABLE public.demo_reference_tracks IS
'One privately stored reference recording per read-only product demo, served only as a short-lived signed URL.';

COMMIT;
