-- Migration 010: harden auth.uid() to never raise on missing/empty claims.
--
-- In production (Supabase), auth.uid() is always populated. Locally and in
-- tests, the per-request setting may be absent or empty. The previous
-- implementation cast '' to jsonb which raises 'invalid input syntax for json'.
-- This version returns NULL gracefully when the claim is missing or empty.

-- Guarded: only replace the LOCAL shim. On Supabase, auth.uid() is owned by
-- supabase_auth_admin and already hardened — replacing it would fail (not
-- owner), so it must be skipped there.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
      AND r.rolname = 'supabase_auth_admin'
  ) THEN
    RETURN; -- Supabase-managed function; leave it alone
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE plpgsql STABLE AS $body$
    DECLARE
      raw_claims text;
    BEGIN
      raw_claims := current_setting('request.jwt.claims', true);
      IF raw_claims IS NULL OR raw_claims = '' THEN
        RETURN NULL;
      END IF;
      RETURN NULLIF(raw_claims::jsonb->>'sub', '')::uuid;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    $body$
  $fn$;
END
$do$;
