BEGIN;

CREATE TABLE public.user_profiles (
    user_id UUID PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_profiles_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    CONSTRAINT user_profiles_username_check CHECK (
        length(btrim(username)) BETWEEN 1 AND 30
        AND username ~ '^[A-Za-z0-9][A-Za-z0-9._]{0,29}$'
    )
);

COMMENT ON TABLE public.user_profiles IS
'Minimal CrowdClip identities created after a provisional Instagram owner verifies an email through Supabase Auth.';

COMMENT ON COLUMN public.user_profiles.user_id IS
'The stable Supabase Auth user ID; email remains owned by auth.users and is not duplicated here.';

CREATE UNIQUE INDEX user_profiles_username_lower_key
ON public.user_profiles(lower(username));

CREATE TRIGGER set_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.workspace_memberships (
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workspace_memberships_pkey
        PRIMARY KEY (workspace_id, user_id),

    CONSTRAINT workspace_memberships_workspace_id_fkey
        FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    CONSTRAINT workspace_memberships_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    CONSTRAINT workspace_memberships_role_check CHECK (
        role IN ('owner', 'admin', 'member')
    )
);

COMMENT ON TABLE public.workspace_memberships IS
'Verified CrowdClip users who may access a workspace; only owner is used during the MVP.';

CREATE INDEX workspace_memberships_user_created_idx
ON public.workspace_memberships(user_id, created_at, workspace_id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.workspace_memberships FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.user_profiles
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.workspace_memberships
TO service_role;

COMMIT;
