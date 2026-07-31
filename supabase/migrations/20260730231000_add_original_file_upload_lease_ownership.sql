BEGIN;

ALTER TABLE public.original_file_requests
ADD COLUMN upload_lease_id UUID;

UPDATE public.original_file_requests
SET status = CASE
      WHEN sent_at IS NOT NULL THEN 'sent'
      ELSE 'pending'
    END,
    upload_started_at = NULL,
    last_error = 'Upload lease invalidated while adding lease ownership'
WHERE status = 'uploading';

ALTER TABLE public.original_file_requests
DROP CONSTRAINT original_file_requests_uploading_fields_check;

ALTER TABLE public.original_file_requests
ADD CONSTRAINT original_file_requests_uploading_fields_check CHECK (
    status <> 'uploading'
    OR (
        upload_started_at IS NOT NULL
        AND upload_lease_id IS NOT NULL
    )
);

COMMIT;
