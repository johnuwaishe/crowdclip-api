BEGIN;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'audio-references',
    'audio-references',
    FALSE,
    104857600,
    ARRAY['audio/*']
)
ON CONFLICT (id)
DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.audio_reference_catalogues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instagram_recipient_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT audio_reference_catalogues_recipient_check CHECK (
        length(btrim(instagram_recipient_id)) > 0
    ),

    CONSTRAINT audio_reference_catalogues_name_check CHECK (
        length(btrim(name)) BETWEEN 1 AND 200
    ),

    CONSTRAINT audio_reference_catalogues_status_check CHECK (
        status IN ('active', 'archived')
    )
);

COMMENT ON TABLE public.audio_reference_catalogues IS
'Workspace-like collections of artist-uploaded reference tracks used to analyse incoming fan clips.';

COMMENT ON COLUMN public.audio_reference_catalogues.instagram_recipient_id IS
'Instagram account ID receiving webhook events. At most one catalogue is active for an account.';

CREATE UNIQUE INDEX audio_reference_catalogues_active_recipient_key
ON public.audio_reference_catalogues(instagram_recipient_id)
WHERE status = 'active';

CREATE TABLE public.audio_reference_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalogue_id UUID NOT NULL,
    title TEXT NOT NULL,
    artist_name TEXT,
    status TEXT NOT NULL DEFAULT 'uploading',
    storage_bucket TEXT,
    storage_path TEXT,
    mime_type TEXT,
    byte_size BIGINT,
    last_error TEXT,
    uploaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT audio_reference_tracks_catalogue_id_fkey
        FOREIGN KEY (catalogue_id)
        REFERENCES public.audio_reference_catalogues(id)
        ON DELETE CASCADE,

    CONSTRAINT audio_reference_tracks_title_check CHECK (
        length(btrim(title)) BETWEEN 1 AND 300
    ),

    CONSTRAINT audio_reference_tracks_artist_name_check CHECK (
        artist_name IS NULL
        OR length(btrim(artist_name)) BETWEEN 1 AND 300
    ),

    CONSTRAINT audio_reference_tracks_status_check CHECK (
        status IN ('uploading', 'ready', 'failed')
    ),

    CONSTRAINT audio_reference_tracks_byte_size_check CHECK (
        byte_size IS NULL OR byte_size > 0
    ),

    CONSTRAINT audio_reference_tracks_ready_fields_check CHECK (
        status <> 'ready'
        OR (
            storage_bucket IS NOT NULL
            AND storage_path IS NOT NULL
            AND mime_type IS NOT NULL
            AND byte_size IS NOT NULL
            AND uploaded_at IS NOT NULL
            AND last_error IS NULL
        )
    ),

    CONSTRAINT audio_reference_tracks_failed_fields_check CHECK (
        status <> 'failed' OR last_error IS NOT NULL
    ),

    CONSTRAINT audio_reference_tracks_id_catalogue_key
        UNIQUE (id, catalogue_id),

    CONSTRAINT audio_reference_tracks_storage_location_key
        UNIQUE (storage_bucket, storage_path)
);

COMMENT ON TABLE public.audio_reference_tracks IS
'Audio uploaded by an artist as the known reference side of concert clip matching.';

CREATE INDEX audio_reference_tracks_catalogue_status_idx
ON public.audio_reference_tracks(catalogue_id, status, created_at);

COMMIT;
