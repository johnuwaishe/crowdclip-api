BEGIN;

CREATE TABLE public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workspaces_name_check CHECK (
        length(btrim(name)) BETWEEN 1 AND 200
    )
);

COMMENT ON TABLE public.workspaces IS
'The default ownership boundary created when an artist first connects Instagram.';

CREATE TABLE public.instagram_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    instagram_recipient_id TEXT NOT NULL,
    username TEXT,
    account_type TEXT,
    connection_status TEXT NOT NULL DEFAULT 'unverified',
    access_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT instagram_accounts_workspace_id_fkey
        FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    CONSTRAINT instagram_accounts_recipient_check CHECK (
        length(btrim(instagram_recipient_id)) > 0
    ),

    CONSTRAINT instagram_accounts_username_check CHECK (
        username IS NULL OR length(btrim(username)) BETWEEN 1 AND 100
    ),

    CONSTRAINT instagram_accounts_account_type_check CHECK (
        account_type IS NULL OR account_type IN ('BUSINESS', 'CREATOR')
    ),

    CONSTRAINT instagram_accounts_connection_status_check CHECK (
        connection_status IN ('unverified', 'connected', 'disconnected')
    ),

    CONSTRAINT instagram_accounts_connection_fields_check CHECK (
        (
            connection_status = 'connected'
            AND access_token_encrypted IS NOT NULL
            AND connected_at IS NOT NULL
            AND disconnected_at IS NULL
        )
        OR (
            connection_status = 'unverified'
            AND access_token_encrypted IS NULL
            AND token_expires_at IS NULL
            AND disconnected_at IS NULL
        )
        OR (
            connection_status = 'disconnected'
            AND access_token_encrypted IS NULL
            AND token_expires_at IS NULL
            AND disconnected_at IS NOT NULL
        )
    ),

    CONSTRAINT instagram_accounts_recipient_key
        UNIQUE (instagram_recipient_id),

    CONSTRAINT instagram_accounts_id_workspace_key
        UNIQUE (id, workspace_id)
);

COMMENT ON TABLE public.instagram_accounts IS
'Instagram professional accounts connected to a CrowdClip workspace.';

COMMENT ON COLUMN public.instagram_accounts.instagram_recipient_id IS
'The professional account ID used as recipient_id in Instagram webhook events.';

CREATE INDEX instagram_accounts_workspace_status_idx
ON public.instagram_accounts(workspace_id, connection_status, created_at);

DO $$
DECLARE
    recipient RECORD;
    created_workspace_id UUID;
BEGIN
    FOR recipient IN
        SELECT recipient_id
        FROM (
            SELECT webhook_events.recipient_id
            FROM public.webhook_events

            UNION

            SELECT audio_reference_catalogues.instagram_recipient_id
            FROM public.audio_reference_catalogues
        ) existing_recipients
        WHERE length(btrim(recipient_id)) > 0
        ORDER BY recipient_id
    LOOP
        INSERT INTO public.workspaces (name)
        VALUES ('Instagram ' || recipient.recipient_id)
        RETURNING id INTO created_workspace_id;

        INSERT INTO public.instagram_accounts (
            workspace_id,
            instagram_recipient_id
        )
        VALUES (
            created_workspace_id,
            recipient.recipient_id
        );
    END LOOP;
END;
$$;

COMMIT;
