-- Migration 008: Enable RLS and create policies.
-- Runs after all tables are created (001-007).
-- The policy definitions mirror db/policies/rls_policies.sql — keep them in sync.

-- ─── Enable RLS on every user-facing table ────────────────────────────────────
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mining_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log   ENABLE ROW LEVEL SECURITY;

-- courses and institutions are public-read; no RLS needed for reads.
-- Service role bypasses RLS for mining reads/writes.

-- ─── profiles ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS profiles_own_row_select  ON profiles;
DROP POLICY IF EXISTS profiles_own_row_update  ON profiles;
DROP POLICY IF EXISTS profiles_insert_own      ON profiles;

CREATE POLICY profiles_own_row_select
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY profiles_own_row_update
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_insert_own
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ─── grade_submissions ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS gs_select                  ON grade_submissions;
DROP POLICY IF EXISTS gs_insert                  ON grade_submissions;
DROP POLICY IF EXISTS gs_update_own_quarantine   ON grade_submissions;
DROP POLICY IF EXISTS gs_delete_own_quarantine   ON grade_submissions;

-- SELECT: own rows OR (approved AND caller is verified)
CREATE POLICY gs_select
  ON grade_submissions FOR SELECT
  USING (
    profile_id = auth.uid()
    OR (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.verified_at IS NOT NULL
      )
    )
  );

CREATE POLICY gs_insert
  ON grade_submissions FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY gs_update_own_quarantine
  ON grade_submissions FOR UPDATE
  USING (profile_id = auth.uid() AND status = 'quarantine')
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY gs_delete_own_quarantine
  ON grade_submissions FOR DELETE
  USING (profile_id = auth.uid() AND status = 'quarantine');

-- ─── Grant minimal table access to the 'authenticated' role ───────────────────
-- Without these grants, even a row that RLS allows is unreadable.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON grade_submissions TO authenticated;
GRANT SELECT                          ON courses           TO authenticated;
GRANT SELECT                          ON institutions      TO authenticated;
GRANT SELECT                          ON course_difficulty_cache TO authenticated;
GRANT SELECT                          ON dangerous_combinations_cache TO authenticated;
