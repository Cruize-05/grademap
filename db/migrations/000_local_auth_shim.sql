-- Migration 000: local Postgres auth shim
--
-- On Supabase, the `auth` schema, `auth.users` table, and auth.uid() are
-- provisioned by GoTrue and owned by supabase_auth_admin — the postgres role
-- may not even reference the auth schema's internals. On vanilla Postgres
-- (local dev, CI), we create just enough of that shape so foreign keys and
-- auth.uid() references work.
--
-- The whole shim short-circuits on Supabase (detected via the
-- supabase_auth_admin role) so it never touches the platform-owned schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    RETURN; -- Supabase: the real auth stack exists; nothing to shim.
  END IF;

  EXECUTE 'CREATE SCHEMA IF NOT EXISTS auth';

  EXECUTE $tbl$
    CREATE TABLE IF NOT EXISTS auth.users (
      id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE,
      raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  $tbl$;

  -- auth.uid() reads the JWT subject from the per-request setting
  -- `request.jwt.claims`. Supabase sets this automatically; locally we
  -- set it via SET LOCAL "request.jwt.claims" = '{"sub": "<uuid>"}'.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $body$
        SELECT NULLIF(
          current_setting('request.jwt.claims', true)::jsonb->>'sub',
          ''
        )::uuid
      $body$
    $fn$;
  END IF;
END
$do$;

-- Create the 'authenticated' role used by Supabase, if it doesn't exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
