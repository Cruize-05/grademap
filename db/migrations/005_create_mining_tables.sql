-- Migration 005: mining_runs, course_difficulty_cache, dangerous_combinations_cache

CREATE TABLE IF NOT EXISTS mining_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  row_count_input int,
  status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed')),
  notes           text,   -- JSON metrics blob written by evaluation.py
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_difficulty_cache (
  course_id       uuid PRIMARY KEY REFERENCES courses(id),
  n_students      int  NOT NULL CHECK (n_students >= 0),
  pass_rate       numeric(5,4) NOT NULL CHECK (pass_rate BETWEEN 0 AND 1),
  avg_grade_point numeric(4,2) NOT NULL,
  last_run_id     uuid REFERENCES mining_runs(id),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dangerous_combinations_cache (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_a    uuid NOT NULL REFERENCES courses(id),
  course_b    uuid NOT NULL REFERENCES courses(id),
  support     numeric(6,5) NOT NULL,
  confidence  numeric(6,5) NOT NULL,
  lift        numeric(8,4) NOT NULL,
  n_students  int  NOT NULL CHECK (n_students >= 0),
  last_run_id uuid REFERENCES mining_runs(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (course_a <> course_b)
);

CREATE INDEX IF NOT EXISTS idx_dcc_course_a ON dangerous_combinations_cache(course_a);
CREATE INDEX IF NOT EXISTS idx_dcc_course_b ON dangerous_combinations_cache(course_b);
