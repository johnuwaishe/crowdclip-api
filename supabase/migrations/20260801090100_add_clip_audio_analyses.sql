BEGIN;

ALTER TABLE public.media_assets
ADD CONSTRAINT media_assets_id_clip_id_key UNIQUE (id, clip_id);

CREATE TABLE public.clip_audio_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id UUID NOT NULL,
    media_asset_id UUID NOT NULL,
    catalogue_id UUID NOT NULL,
    matched_reference_track_id UUID,
    provider TEXT NOT NULL DEFAULT 'concert_sequence',
    status TEXT NOT NULL DEFAULT 'pending',
    fingerprint_similarity DOUBLE PRECISION,
    second_best_similarity DOUBLE PRECISION,
    peak_margin DOUBLE PRECISION,
    time_scale DOUBLE PRECISION,
    reference_offset_ms BIGINT,
    matched_duration_ms BIGINT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    processing_started_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT clip_audio_analyses_clip_id_fkey
        FOREIGN KEY (clip_id)
        REFERENCES public.clips(id)
        ON DELETE CASCADE,

    CONSTRAINT clip_audio_analyses_media_asset_clip_fkey
        FOREIGN KEY (media_asset_id, clip_id)
        REFERENCES public.media_assets(id, clip_id)
        ON DELETE CASCADE,

    CONSTRAINT clip_audio_analyses_catalogue_id_fkey
        FOREIGN KEY (catalogue_id)
        REFERENCES public.audio_reference_catalogues(id)
        ON DELETE CASCADE,

    CONSTRAINT clip_audio_analyses_matched_track_catalogue_fkey
        FOREIGN KEY (matched_reference_track_id, catalogue_id)
        REFERENCES public.audio_reference_tracks(id, catalogue_id)
        ON DELETE RESTRICT,

    CONSTRAINT clip_audio_analyses_provider_check CHECK (
        length(btrim(provider)) BETWEEN 1 AND 100
    ),

    CONSTRAINT clip_audio_analyses_status_check CHECK (
        status IN ('pending', 'processing', 'matched', 'no_match', 'failed')
    ),

    CONSTRAINT clip_audio_analyses_similarity_check CHECK (
        fingerprint_similarity IS NULL
        OR fingerprint_similarity BETWEEN 0 AND 1
    ),

    CONSTRAINT clip_audio_analyses_second_best_check CHECK (
        second_best_similarity IS NULL
        OR second_best_similarity BETWEEN 0 AND 1
    ),

    CONSTRAINT clip_audio_analyses_peak_margin_check CHECK (
        peak_margin IS NULL
        OR peak_margin BETWEEN -1 AND 1
    ),

    CONSTRAINT clip_audio_analyses_time_scale_check CHECK (
        time_scale IS NULL OR time_scale > 0
    ),

    CONSTRAINT clip_audio_analyses_reference_offset_check CHECK (
        reference_offset_ms IS NULL OR reference_offset_ms >= 0
    ),

    CONSTRAINT clip_audio_analyses_matched_duration_check CHECK (
        matched_duration_ms IS NULL OR matched_duration_ms > 0
    ),

    CONSTRAINT clip_audio_analyses_attempt_count_check CHECK (
        attempt_count >= 0
    ),

    CONSTRAINT clip_audio_analyses_processing_fields_check CHECK (
        status <> 'processing' OR processing_started_at IS NOT NULL
    ),

    CONSTRAINT clip_audio_analyses_matched_fields_check CHECK (
        status <> 'matched'
        OR (
            matched_reference_track_id IS NOT NULL
            AND fingerprint_similarity IS NOT NULL
            AND peak_margin IS NOT NULL
            AND time_scale IS NOT NULL
            AND reference_offset_ms IS NOT NULL
            AND matched_duration_ms IS NOT NULL
            AND error_message IS NULL
            AND completed_at IS NOT NULL
        )
    ),

    CONSTRAINT clip_audio_analyses_no_match_fields_check CHECK (
        status <> 'no_match'
        OR (
            matched_reference_track_id IS NULL
            AND error_message IS NULL
            AND completed_at IS NOT NULL
        )
    ),

    CONSTRAINT clip_audio_analyses_failed_fields_check CHECK (
        status <> 'failed'
        OR (
            error_message IS NOT NULL
            AND completed_at IS NOT NULL
        )
    ),

    CONSTRAINT clip_audio_analyses_clip_catalogue_provider_key
        UNIQUE (clip_id, catalogue_id, provider)
);

COMMENT ON TABLE public.clip_audio_analyses IS
'Idempotent audio-analysis work and results for matching one fan clip against one active reference catalogue.';

COMMENT ON COLUMN public.clip_audio_analyses.fingerprint_similarity IS
'Fraction of agreeing fingerprint bits at the winning alignment. This is not a calibrated probability.';

CREATE INDEX clip_audio_analyses_queue_idx
ON public.clip_audio_analyses(status, next_attempt_at, created_at)
WHERE status = 'pending';

CREATE INDEX clip_audio_analyses_clip_idx
ON public.clip_audio_analyses(clip_id, created_at DESC);

CREATE INDEX clip_audio_analyses_processing_started_at_idx
ON public.clip_audio_analyses(processing_started_at)
WHERE status = 'processing';

CREATE INDEX clip_audio_analyses_match_grouping_idx
ON public.clip_audio_analyses(
    catalogue_id,
    matched_reference_track_id,
    reference_offset_ms
)
WHERE status = 'matched';

COMMIT;
