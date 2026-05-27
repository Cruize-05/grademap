-- Migration 001: institutions table
-- Stores per-institution configuration including email domain and grade scale.
-- Grade scale is configurable (not hardcoded) — each institution can define its own.

CREATE TABLE IF NOT EXISTS institutions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,            -- e.g. 'UB'
  name          text NOT NULL,
  email_domain  text UNIQUE NOT NULL,            -- e.g. 'ub.cm'
  max_grade_point numeric(3,2) NOT NULL DEFAULT 4.00,  -- configurable: 4.00 or 5.00
  grade_mapping jsonb NOT NULL DEFAULT '{}',    -- letter → grade_point, filled by admin
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN institutions.grade_mapping IS
  'JSON map of letter grade to grade_point, e.g. {"A": 4.0, "B+": 3.5}. Set per institution.';
