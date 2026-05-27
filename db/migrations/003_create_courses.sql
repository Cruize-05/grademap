-- Migration 003: courses table

CREATE TABLE IF NOT EXISTS courses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  code            text NOT NULL,
  title           text NOT NULL,
  credits         int  NOT NULL CHECK (credits > 0),
  level           int  NOT NULL CHECK (level BETWEEN 1 AND 7),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS idx_courses_institution ON courses(institution_id);
CREATE INDEX IF NOT EXISTS idx_courses_code ON courses USING gin(to_tsvector('english', code || ' ' || title));
