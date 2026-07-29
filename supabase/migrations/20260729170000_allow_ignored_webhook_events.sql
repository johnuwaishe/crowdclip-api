BEGIN;

ALTER TABLE public.webhook_events
DROP CONSTRAINT webhook_events_status_check;

ALTER TABLE public.webhook_events
ADD CONSTRAINT webhook_events_status_check CHECK (
    status IN (
        'pending',
        'processing',
        'processed',
        'failed',
        'ignored'
    )
);

COMMIT;
