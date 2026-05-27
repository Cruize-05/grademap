-- Migration 010: harden auth.uid() to never raise on missing/empty claims.
--
-- In production (Supabase), auth.uid() is always populated. Locally and in
-- tests, the per-request setting may be absent or empty. The previous
-- implementation cast '' to jsonb which raises 'invalid input syntax for json'.
-- This version returns NULL gracefully when the claim is missing or empty.

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
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
$$;
