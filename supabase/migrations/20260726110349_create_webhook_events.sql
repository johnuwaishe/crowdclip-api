CREATE TABLE IF NOT EXISTS public.webhook_events(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    occurred_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_started_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT webhook_events_status_check CHECK (
        status IN (
                    'pending',
                    'processing',
                    'processed',
                    'failed'
        )
    ),

    CONSTRAINT webhook_events_attempt_count_check CHECK (
        attempt_count >= 0
    )
);


CREATE INDEX IF NOT EXISTS webhook_events_status_idx
ON public.webhook_events(status, received_at);