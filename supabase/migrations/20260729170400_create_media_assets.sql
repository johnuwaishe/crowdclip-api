BEGIN;

CREATE TABLE public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id UUID NOT NULL,
    asset_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    source_url TEXT,
    storage_bucket TEXT,
    storage_path TEXT,
    mime_type TEXT,
    byte_size BIGINT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    download_started_at TIMESTAMPTZ,
    stored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT media_assets_clip_id_fkey
        FOREIGN KEY (clip_id)
        REFERENCES public.clips(id)
        ON DELETE CASCADE,

    CONSTRAINT media_assets_asset_type_check CHECK (
        asset_type IN (
            'instagram_story',
            'fan_original'
        )
    ),

    CONSTRAINT media_assets_status_check CHECK (
        status IN (
            'pending',
            'downloading',
            'stored',
            'failed'
        )
    ),

    CONSTRAINT media_assets_attempt_count_check CHECK (
        attempt_count >= 0
    ),

    CONSTRAINT media_assets_byte_size_check CHECK (
        byte_size IS NULL OR byte_size > 0
    ),

    CONSTRAINT media_assets_clip_asset_type_key
        UNIQUE (clip_id, asset_type),

    CONSTRAINT media_assets_storage_location_key
        UNIQUE (storage_bucket, storage_path),

    CONSTRAINT media_assets_downloading_fields_check CHECK (
        status <> 'downloading'
        OR download_started_at IS NOT NULL
    ),

    CONSTRAINT media_assets_stored_fields_check CHECK (
        status <> 'stored'
        OR (
            storage_bucket IS NOT NULL
            AND storage_path IS NOT NULL
            AND stored_at IS NOT NULL
        )
    )
);

COMMENT ON TABLE public.media_assets IS
'Different media versions belonging to the same clip, including the Instagram story and fan original.';

COMMENT ON COLUMN public.media_assets.source_url IS
'Temporary source URL used while ingesting a media asset.';

CREATE INDEX media_assets_status_created_at_idx
ON public.media_assets(status, created_at);

CREATE TRIGGER set_media_assets_updated_at
BEFORE UPDATE ON public.media_assets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

COMMIT;
