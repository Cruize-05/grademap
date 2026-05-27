-- Migration 002: profiles table
-- Links Supabase Auth users to institution/programme metadata.

CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  programme       text NOT NULL,
  level           int  NOT NULL CHECK (level BETWEEN 1 AND 7),
  verified_at     timestamptz,              -- null until institutional email confirmed
  created_at      timestamptz NOT NULL DEFAULT now()
);
