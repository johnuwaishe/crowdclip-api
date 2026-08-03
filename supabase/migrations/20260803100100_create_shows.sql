BEGIN;

CREATE TABLE public.shows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    instagram_account_id UUID NOT NULL,
    name TEXT NOT NULL,
    starts_at TIMESTAMPTZ,
    venue_name TEXT,
    city TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT shows_instagram_account_workspace_fkey
        FOREIGN KEY (instagram_account_id, workspace_id)
        REFERENCES public.instagram_accounts(id, workspace_id)
        ON DELETE CASCADE,

    CONSTRAINT shows_name_check CHECK (
        length(btrim(name)) BETWEEN 1 AND 200
    ),

    CONSTRAINT shows_venue_name_check CHECK (
        venue_name IS NULL OR length(btrim(venue_name)) BETWEEN 1 AND 200
    ),

    CONSTRAINT shows_city_check CHECK (
        city IS NULL OR length(btrim(city)) BETWEEN 1 AND 200
    ),

    CONSTRAINT shows_status_check CHECK (
        status IN ('draft', 'active', 'ended')
    ),

    CONSTRAINT shows_ended_fields_check CHECK (
        (status = 'ended' AND ended_at IS NOT NULL)
        OR (status <> 'ended' AND ended_at IS NULL)
    ),

    CONSTRAINT shows_id_instagram_account_key
        UNIQUE (id, instagram_account_id)
);

COMMENT ON TABLE public.shows IS
'Concerts belonging to a workspace; incoming clips route to the active show for their Instagram account.';

CREATE UNIQUE INDEX shows_active_instagram_account_key
ON public.shows(instagram_account_id)
WHERE status = 'active';

CREATE INDEX shows_workspace_starts_at_idx
ON public.shows(workspace_id, starts_at DESC NULLS LAST);

CREATE INDEX shows_instagram_account_status_idx
ON public.shows(instagram_account_id, status, starts_at DESC NULLS LAST);

COMMIT;
