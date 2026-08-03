BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SET LOCAL search_path = public, extensions;

SELECT plan(19);

SELECT has_table(
    'public',
    'user_profiles',
    'user profiles table exists'
);

SELECT has_table(
    'public',
    'workspace_memberships',
    'workspace memberships table exists'
);

SELECT has_trigger(
    'public',
    'user_profiles',
    'set_user_profiles_updated_at',
    'user profiles maintain updated_at'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'user_profiles_username_lower_key'
    ),
    'CrowdClip usernames have a case-insensitive unique index'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'workspace_memberships_single_owner_key'
    ),
    'each workspace has at most one verified owner'
);

SELECT ok(
    (
        SELECT COUNT(*) = 2 AND BOOL_AND(relrowsecurity)
        FROM pg_class
        JOIN pg_namespace
            ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_class.relname IN (
              'user_profiles',
              'workspace_memberships'
          )
    ),
    'RLS is enabled on both progressive-auth tables'
);

SELECT ok(
    NOT has_table_privilege('anon', 'public.user_profiles', 'SELECT')
    AND NOT has_table_privilege(
        'authenticated',
        'public.user_profiles',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'anon',
        'public.workspace_memberships',
        'SELECT'
    )
    AND NOT has_table_privilege(
        'authenticated',
        'public.workspace_memberships',
        'SELECT'
    ),
    'browser database roles cannot read ownership tables directly'
);

SELECT ok(
    has_table_privilege('service_role', 'public.user_profiles', 'SELECT')
    AND has_table_privilege(
        'service_role',
        'public.workspace_memberships',
        'SELECT'
    ),
    'the server service role can access ownership tables'
);

SELECT lives_ok(
    $$
        INSERT INTO auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            created_at,
            updated_at
        )
        VALUES (
            '10000000-0000-4000-8000-000000000001',
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'owner@example.com',
            '',
            NOW(),
            NOW()
        )
    $$,
    'a Supabase Auth user can be created for the ownership test'
);

SELECT lives_ok(
    $$
        INSERT INTO public.user_profiles (
            user_id,
            username,
            updated_at
        )
        VALUES (
            '10000000-0000-4000-8000-000000000001',
            'badmanjwav',
            '2000-01-01T00:00:00Z'
        )
    $$,
    'a verified auth user can receive a minimal CrowdClip profile'
);

SELECT lives_ok(
    $$
        INSERT INTO auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            created_at,
            updated_at
        )
        VALUES (
            '10000000-0000-4000-8000-000000000002',
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'second-owner@example.com',
            '',
            NOW(),
            NOW()
        )
    $$,
    'a second verified auth user can be created for ownership conflicts'
);

SELECT throws_ok(
    $$
        INSERT INTO public.user_profiles (
            user_id,
            username
        )
        VALUES (
            '10000000-0000-4000-8000-000000000002',
            'BADMANJWAV'
        )
    $$,
    '23505',
    NULL,
    'CrowdClip usernames are unique regardless of letter case'
);

INSERT INTO public.workspaces (id, name)
VALUES (
    '20000000-0000-4000-8000-000000000002',
    'Progressive Auth Test Workspace'
);

SELECT lives_ok(
    $$
        INSERT INTO public.workspace_memberships (
            workspace_id,
            user_id,
            role
        )
        VALUES (
            '20000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            'owner'
        )
    $$,
    'a verified user can own the provisional workspace'
);

SELECT throws_ok(
    $$
        INSERT INTO public.workspace_memberships (
            workspace_id,
            user_id,
            role
        )
        VALUES (
            '20000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000002',
            'owner'
        )
    $$,
    '23505',
    NULL,
    'a different verified user cannot also own the workspace'
);

SELECT throws_ok(
    $$
        UPDATE public.workspace_memberships
        SET role = 'super-admin'
        WHERE workspace_id = '20000000-0000-4000-8000-000000000002'
          AND user_id = '10000000-0000-4000-8000-000000000001'
    $$,
    '23514',
    NULL,
    'workspace roles are constrained to the supported values'
);

SELECT throws_ok(
    $$
        INSERT INTO public.workspace_memberships (
            workspace_id,
            user_id,
            role
        )
        VALUES (
            '20000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            'owner'
        )
    $$,
    '23505',
    NULL,
    'the same user cannot receive duplicate workspace memberships'
);

UPDATE public.user_profiles
SET username = 'badmanjwav_updated'
WHERE user_id = '10000000-0000-4000-8000-000000000001';

SELECT ok(
    (
        SELECT updated_at > '2000-01-01T00:00:00Z'::TIMESTAMPTZ
        FROM public.user_profiles
        WHERE user_id = '10000000-0000-4000-8000-000000000001'
    ),
    'profile updates maintain updated_at automatically'
);

DELETE FROM auth.users
WHERE id = '10000000-0000-4000-8000-000000000001';

SELECT is(
    (
        SELECT COUNT(*)::INTEGER
        FROM public.user_profiles
        WHERE user_id = '10000000-0000-4000-8000-000000000001'
    ),
    0,
    'deleting an auth user removes its CrowdClip profile'
);

SELECT is(
    (
        SELECT COUNT(*)::INTEGER
        FROM public.workspace_memberships
        WHERE user_id = '10000000-0000-4000-8000-000000000001'
    ),
    0,
    'deleting an auth user removes its workspace memberships'
);

SELECT * FROM finish();

ROLLBACK;
