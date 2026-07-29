BEGIN;

CREATE TABLE public.original_file_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    upload_token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    instagram_message_id TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    sending_started_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    fulfilled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT original_file_requests_clip_id_fkey
        FOREIGN KEY (clip_id)
        REFERENCES public.clips(id)
        ON DELETE CASCADE,

    CONSTRAINT original_file_requests_clip_id_key
        UNIQUE (clip_id),

    CONSTRAINT original_file_requests_upload_token_hash_key
        UNIQUE (upload_token_hash),

    CONSTRAINT original_file_requests_instagram_message_id_key
        UNIQUE (instagram_message_id),

    CONSTRAINT original_file_requests_status_check CHECK (
        status IN (
            'pending',
            'sending',
            'sent',
            'fulfilled',
            'failed',
            'expired',
            'cancelled'
        )
    ),

    CONSTRAINT original_file_requests_attempt_count_check CHECK (
        attempt_count >= 0
    ),

    CONSTRAINT original_file_requests_upload_token_hash_check CHECK (
        upload_token_hash ~ '^[0-9a-f]{64}$'
    ),

    CONSTRAINT original_file_requests_expiry_check CHECK (
        expires_at > created_at
    ),

    CONSTRAINT original_file_requests_sending_fields_check CHECK (
        status <> 'sending'
        OR sending_started_at IS NOT NULL
    ),

    CONSTRAINT original_file_requests_sent_fields_check CHECK (
        status NOT IN ('sent', 'fulfilled')
        OR (
            instagram_message_id IS NOT NULL
            AND sent_at IS NOT NULL
        )
    ),

    CONSTRAINT original_file_requests_fulfilled_fields_check CHECK (
        status <> 'fulfilled'
        OR fulfilled_at IS NOT NULL
    )
);

COMMENT ON TABLE public.original_file_requests IS
'Tracks automatic Instagram messages and secure upload links used to collect fan-original media.';

COMMENT ON COLUMN public.original_file_requests.upload_token_hash IS
'SHA-256 hash of the secret upload-link token. The raw token is never persisted.';

CREATE INDEX original_file_requests_status_created_at_idx
ON public.original_file_requests(status, created_at);

CREATE INDEX original_file_requests_status_expires_at_idx
ON public.original_file_requests(status, expires_at);

CREATE TRIGGER set_original_file_requests_updated_at
BEFORE UPDATE ON public.original_file_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.original_file_requests ENABLE ROW LEVEL SECURITY;

COMMIT;
