BEGIN;

CREATE INDEX webhook_events_processing_started_at_idx
ON public.webhook_events(processing_started_at)
WHERE status = 'processing';

COMMIT;
