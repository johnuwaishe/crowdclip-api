BEGIN;

CREATE UNIQUE INDEX workspace_memberships_single_owner_key
ON public.workspace_memberships(workspace_id)
WHERE role = 'owner';

COMMENT ON INDEX public.workspace_memberships_single_owner_key IS
'A workspace may have one verified owner; admin and member roles remain available for future collaboration.';

COMMIT;
