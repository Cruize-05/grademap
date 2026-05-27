-- Migration 000: local Postgres auth shim
--
-- On Supabase, the `auth` schema and `auth.users` table are provisioned
-- automatically by GoTrue. On vanilla Postgres (local dev, CI, Render),
-- we need to create just enough of that shape so foreign keys and
-- auth.uid() references work.
--
-- This migration is a NO-OP on Supabase because the auth schema and
-- the auth.uid() function already exist (CREATE ... IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- auth.uid() reads the JWT subject from the per-request setting
-- `request.jwt.claims`. Supabase sets this automatically; locally we
-- set it via SET LOCAL "request.jwt.claims" = '{"sub": "<uuid>"}'.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb->>'sub',
    ''
  )::uuid
$$;

-- Create the 'authenticated' role used by Supabase, if it doesn't exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
