BEGIN;

ALTER TABLE public.clip_audio_analyses
ADD COLUMN pitch_shift_cents DOUBLE PRECISION,
ADD COLUMN pitch_similarity DOUBLE PRECISION,
ADD COLUMN pitch_margin DOUBLE PRECISION;

ALTER TABLE public.clip_audio_analyses
ADD CONSTRAINT clip_audio_analyses_pitch_similarity_check CHECK (
    pitch_similarity IS NULL OR pitch_similarity BETWEEN -1 AND 1
),
ADD CONSTRAINT clip_audio_analyses_pitch_margin_check CHECK (
    pitch_margin IS NULL OR pitch_margin BETWEEN -2 AND 2
),
ADD CONSTRAINT clip_audio_analyses_matched_pitch_fields_check CHECK (
    status <> 'matched'
    OR (
        pitch_shift_cents IS NOT NULL
        AND pitch_similarity IS NOT NULL
        AND pitch_margin IS NOT NULL
    )
) NOT VALID;

CREATE TABLE public.clip_audio_derivatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES public.clip_audio_analyses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'reference_normalized_stem',
    algorithm_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    storage_bucket TEXT,
    storage_path TEXT,
    mime_type TEXT,
    byte_size BIGINT,
    rendered_duration_ms BIGINT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    processing_started_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT clip_audio_derivatives_identity_key
        UNIQUE (analysis_id, kind, algorithm_version),
    CONSTRAINT clip_audio_derivatives_kind_check CHECK (
        kind = 'reference_normalized_stem'
    ),
    CONSTRAINT clip_audio_derivatives_status_check CHECK (
        status IN ('pending', 'processing', 'ready', 'failed')
    ),
    CONSTRAINT clip_audio_derivatives_attempt_count_check CHECK (attempt_count >= 0),
    CONSTRAINT clip_audio_derivatives_duration_check CHECK (
        rendered_duration_ms IS NULL OR rendered_duration_ms > 0
    ),
    CONSTRAINT clip_audio_derivatives_processing_check CHECK (
        status <> 'processing' OR processing_started_at IS NOT NULL
    ),
    CONSTRAINT clip_audio_derivatives_ready_check CHECK (
        status <> 'ready'
        OR (
            storage_bucket IS NOT NULL
            AND storage_path IS NOT NULL
            AND mime_type IS NOT NULL
            AND byte_size > 0
            AND rendered_duration_ms > 0
            AND completed_at IS NOT NULL
            AND error_message IS NULL
        )
    ),
    CONSTRAINT clip_audio_derivatives_failed_check CHECK (
        status <> 'failed' OR (error_message IS NOT NULL AND completed_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.clip_audio_derivatives IS
'Versioned audio stems independently corrected to the matched reference clock and tuning.';

CREATE INDEX clip_audio_derivatives_queue_idx
ON public.clip_audio_derivatives(status, next_attempt_at, created_at)
WHERE status = 'pending';

CREATE INDEX clip_audio_derivatives_processing_idx
ON public.clip_audio_derivatives(processing_started_at)
WHERE status = 'processing';

CREATE TRIGGER set_clip_audio_derivatives_updated_at
BEFORE UPDATE ON public.clip_audio_derivatives
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clip_audio_derivatives ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enqueue_reference_normalized_stem()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'matched' AND (
        OLD.status IS DISTINCT FROM 'matched'
        OR OLD.pitch_shift_cents IS DISTINCT FROM NEW.pitch_shift_cents
        OR OLD.time_scale IS DISTINCT FROM NEW.time_scale
    ) THEN
        INSERT INTO public.clip_audio_derivatives (
            analysis_id,
            kind,
            algorithm_version,
            status
        ) VALUES (
            NEW.id,
            'reference_normalized_stem',
            'reference-normalized-v1',
            'pending'
        )
        ON CONFLICT (analysis_id, kind, algorithm_version)
        DO UPDATE SET status = 'pending',
                      storage_bucket = NULL,
                      storage_path = NULL,
                      mime_type = NULL,
                      byte_size = NULL,
                      rendered_duration_ms = NULL,
                      attempt_count = 0,
                      error_message = NULL,
                      processing_started_at = NULL,
                      next_attempt_at = NULL,
                      completed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_reference_normalized_stem_after_match
AFTER UPDATE ON public.clip_audio_analyses
FOR EACH ROW EXECUTE FUNCTION public.enqueue_reference_normalized_stem();

COMMIT;
