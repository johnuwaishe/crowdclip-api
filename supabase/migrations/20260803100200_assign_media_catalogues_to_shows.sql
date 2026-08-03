BEGIN;

ALTER TABLE public.audio_reference_catalogues
ADD COLUMN show_id UUID;

DO $$
DECLARE
    catalogue RECORD;
    account RECORD;
    created_show_id UUID;
BEGIN
    FOR catalogue IN
        SELECT *
        FROM public.audio_reference_catalogues
        ORDER BY created_at, id
    LOOP
        SELECT id, workspace_id
        INTO STRICT account
        FROM public.instagram_accounts
        WHERE instagram_recipient_id = catalogue.instagram_recipient_id;

        INSERT INTO public.shows (
            workspace_id,
            instagram_account_id,
            name,
            starts_at,
            status,
            ended_at,
            created_at,
            updated_at
        )
        VALUES (
            account.workspace_id,
            account.id,
            catalogue.name,
            catalogue.created_at,
            CASE catalogue.status
                WHEN 'active' THEN 'active'
                ELSE 'ended'
            END,
            CASE catalogue.status
                WHEN 'active' THEN NULL
                ELSE catalogue.updated_at
            END,
            catalogue.created_at,
            catalogue.updated_at
        )
        RETURNING id INTO created_show_id;

        UPDATE public.audio_reference_catalogues
        SET show_id = created_show_id
        WHERE id = catalogue.id;
    END LOOP;
END;
$$;

ALTER TABLE public.audio_reference_catalogues
ALTER COLUMN show_id SET NOT NULL,
ADD CONSTRAINT audio_reference_catalogues_show_id_fkey
    FOREIGN KEY (show_id)
    REFERENCES public.shows(id)
    ON DELETE CASCADE,
ADD CONSTRAINT audio_reference_catalogues_show_id_key
    UNIQUE (show_id),
ADD CONSTRAINT audio_reference_catalogues_id_show_key
    UNIQUE (id, show_id);

DROP INDEX public.audio_reference_catalogues_active_recipient_key;

ALTER TABLE public.audio_reference_catalogues
DROP CONSTRAINT audio_reference_catalogues_recipient_check,
DROP CONSTRAINT audio_reference_catalogues_status_check,
DROP COLUMN instagram_recipient_id,
DROP COLUMN status;

COMMENT ON TABLE public.audio_reference_catalogues IS
'The song-by-song reference catalogue automatically owned by one CrowdClip show.';

COMMENT ON COLUMN public.audio_reference_catalogues.show_id IS
'The show whose song references are used to analyse its incoming fan clips.';

ALTER TABLE public.clips
ADD COLUMN instagram_account_id UUID,
ADD COLUMN show_id UUID;

UPDATE public.clips
SET instagram_account_id = instagram_accounts.id
FROM public.webhook_events
JOIN public.instagram_accounts
    ON instagram_accounts.instagram_recipient_id = webhook_events.recipient_id
WHERE webhook_events.id = clips.source_webhook_event_id;

UPDATE public.clips
SET show_id = matched_show.show_id
FROM (
    SELECT DISTINCT ON (clip_audio_analyses.clip_id)
        clip_audio_analyses.clip_id,
        audio_reference_catalogues.show_id
    FROM public.clip_audio_analyses
    JOIN public.audio_reference_catalogues
        ON audio_reference_catalogues.id = clip_audio_analyses.catalogue_id
    ORDER BY
        clip_audio_analyses.clip_id,
        clip_audio_analyses.created_at DESC
) matched_show
WHERE matched_show.clip_id = clips.id;

UPDATE public.clips
SET show_id = active_show.id
FROM public.shows AS active_show
WHERE active_show.instagram_account_id = clips.instagram_account_id
  AND active_show.status = 'active'
  AND clips.show_id IS NULL;

ALTER TABLE public.clips
ALTER COLUMN instagram_account_id SET NOT NULL,
ADD CONSTRAINT clips_instagram_account_id_fkey
    FOREIGN KEY (instagram_account_id)
    REFERENCES public.instagram_accounts(id)
    ON DELETE RESTRICT,
ADD CONSTRAINT clips_show_instagram_account_fkey
    FOREIGN KEY (show_id, instagram_account_id)
    REFERENCES public.shows(id, instagram_account_id)
    ON DELETE RESTRICT,
ADD CONSTRAINT clips_id_show_key
    UNIQUE (id, show_id);

COMMENT ON COLUMN public.clips.show_id IS
'The active show selected when the webhook was processed, or null while the clip remains in the workspace inbox.';

CREATE INDEX clips_instagram_account_show_created_at_idx
ON public.clips(instagram_account_id, show_id, created_at DESC);

ALTER TABLE public.clip_audio_analyses
ADD COLUMN show_id UUID;

UPDATE public.clip_audio_analyses
SET show_id = audio_reference_catalogues.show_id
FROM public.audio_reference_catalogues
WHERE audio_reference_catalogues.id = clip_audio_analyses.catalogue_id;

ALTER TABLE public.clip_audio_analyses
ALTER COLUMN show_id SET NOT NULL,
ADD CONSTRAINT clip_audio_analyses_clip_show_fkey
    FOREIGN KEY (clip_id, show_id)
    REFERENCES public.clips(id, show_id)
    ON DELETE CASCADE,
ADD CONSTRAINT clip_audio_analyses_catalogue_show_fkey
    FOREIGN KEY (catalogue_id, show_id)
    REFERENCES public.audio_reference_catalogues(id, show_id)
    ON DELETE CASCADE;

CREATE INDEX clip_audio_analyses_show_match_idx
ON public.clip_audio_analyses(
    show_id,
    matched_reference_track_id,
    reference_offset_ms
)
WHERE status = 'matched';

COMMIT;
