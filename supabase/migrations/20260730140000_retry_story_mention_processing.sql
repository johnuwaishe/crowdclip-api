BEGIN;

ALTER TABLE public.webhook_events
ADD COLUMN next_attempt_at TIMESTAMPTZ;

CREATE INDEX webhook_events_pending_next_attempt_idx
ON public.webhook_events(next_attempt_at, received_at)
WHERE status = 'pending';

COMMIT;
