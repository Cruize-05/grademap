-- Migration 004: grade_submissions table + quarantine default

CREATE TABLE IF NOT EXISTS grade_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL REFERENCES courses(id),
  semester      int  NOT NULL CHECK (semester IN (1, 2)),
  academic_year int  NOT NULL CHECK (academic_year BETWEEN 2000 AND 2100),
  grade         text NOT NULL CHECK (length(grade) BETWEEN 1 AND 5),
  grade_point   numeric(3,2) CHECK (grade_point >= 0 AND grade_point <= 5.00),
  status        text NOT NULL DEFAULT 'quarantine'
                  CHECK (status IN ('quarantine', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gs_profile   ON grade_submissions(profile_id);
CREATE INDEX IF NOT EXISTS idx_gs_course    ON grade_submissions(course_id);
CREATE INDEX IF NOT EXISTS idx_gs_status    ON grade_submissions(status);
