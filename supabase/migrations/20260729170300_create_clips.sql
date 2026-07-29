BEGIN;

CREATE TABLE public.clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fan_id UUID NOT NULL,
    source_webhook_event_id UUID NOT NULL,
    media_choice TEXT NOT NULL DEFAULT 'undecided',
    mentioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT clips_fan_id_fkey
        FOREIGN KEY (fan_id)
        REFERENCES public.fans(id)
        ON DELETE RESTRICT,

    CONSTRAINT clips_source_webhook_event_id_fkey
        FOREIGN KEY (source_webhook_event_id)
        REFERENCES public.webhook_events(id)
        ON DELETE RESTRICT,

    CONSTRAINT clips_source_webhook_event_id_key
        UNIQUE (source_webhook_event_id),

    CONSTRAINT clips_media_choice_check CHECK (
        media_choice IN (
            'undecided',
            'use_instagram_story',
            'request_fan_original'
        )
    )
);

COMMENT ON TABLE public.clips IS
'Concert clips created from fan interactions. Each clip can have multiple media versions.';

COMMENT ON COLUMN public.clips.media_choice IS
'The artist decision after reviewing the available Instagram story version.';

CREATE INDEX clips_fan_id_idx
ON public.clips(fan_id);

CREATE INDEX clips_media_choice_created_at_idx
ON public.clips(media_choice, created_at);

CREATE TRIGGER set_clips_updated_at
BEFORE UPDATE ON public.clips
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

COMMIT;
