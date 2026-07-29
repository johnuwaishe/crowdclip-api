BEGIN;

CREATE TABLE public.fans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instagram_scoped_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fans_instagram_scoped_user_id_key
        UNIQUE (instagram_scoped_user_id)
);

COMMENT ON TABLE public.fans IS
'Instagram fans who have interacted with the connected artist account.';

COMMENT ON COLUMN public.fans.instagram_scoped_user_id IS
'The fan sender ID scoped by Meta to the connected Instagram account.';

CREATE TRIGGER set_fans_updated_at
BEFORE UPDATE ON public.fans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fans ENABLE ROW LEVEL SECURITY;

COMMIT;
