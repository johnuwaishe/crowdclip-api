BEGIN;

ALTER TABLE public.original_file_requests
ADD COLUMN upload_started_at TIMESTAMPTZ;

ALTER TABLE public.original_file_requests
DROP CONSTRAINT original_file_requests_status_check;

ALTER TABLE public.original_file_requests
ADD CONSTRAINT original_file_requests_status_check CHECK (
    status IN (
        'pending',
        'sending',
        'sent',
        'uploading',
        'fulfilled',
        'failed',
        'expired',
        'cancelled'
    )
);

ALTER TABLE public.original_file_requests
DROP CONSTRAINT original_file_requests_sent_fields_check;

ALTER TABLE public.original_file_requests
ADD CONSTRAINT original_file_requests_message_fields_pair_check CHECK (
    (
        instagram_message_id IS NULL
        AND sent_at IS NULL
    )
    OR (
        instagram_message_id IS NOT NULL
        AND sent_at IS NOT NULL
    )
);

ALTER TABLE public.original_file_requests
ADD CONSTRAINT original_file_requests_sent_fields_check CHECK (
    status <> 'sent'
    OR (
        instagram_message_id IS NOT NULL
        AND sent_at IS NOT NULL
    )
);

ALTER TABLE public.original_file_requests
ADD CONSTRAINT original_file_requests_uploading_fields_check CHECK (
    status <> 'uploading'
    OR upload_started_at IS NOT NULL
);

CREATE INDEX original_file_requests_upload_started_at_idx
ON public.original_file_requests(upload_started_at)
WHERE status = 'uploading';

COMMIT;
