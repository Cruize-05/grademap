-- Row-Level Security policies for GradeMap UB
-- Run AFTER all CREATE TABLE migrations.

-- ─── Enable RLS on every user-facing table ────────────────────────────────────

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mining_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log   ENABLE ROW LEVEL SECURITY;

-- courses and institutions are public-read; no RLS needed for reads.
-- The service role bypasses RLS for mining reads/writes.

-- ─── profiles ────────────────────────────────────────────────────────────────

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

-- INSERT: only own rows
CREATE POLICY gs_insert
  ON grade_submissions FOR INSERT
  WITH CHECK (profile_id = auth.uid());

-- UPDATE: own quarantine rows only (allow self-correction before approval)
CREATE POLICY gs_update_own_quarantine
  ON grade_submissions FOR UPDATE
  USING (profile_id = auth.uid() AND status = 'quarantine')
  WITH CHECK (profile_id = auth.uid());

-- DELETE: own quarantine rows only
CREATE POLICY gs_delete_own_quarantine
  ON grade_submissions FOR DELETE
  USING (profile_id = auth.uid() AND status = 'quarantine');

-- ─── mining_runs (admin read-only via gateway; service role writes) ───────────

-- No public SELECT policy — only service role (bypasses RLS) and admin role
-- (enforced at gateway layer) may read mining_runs.

-- ─── admin_audit_log (service role writes; admin reads at gateway) ────────────

-- No public SELECT — gateway enforces admin role check before querying.

-- ─── Verification: test file to confirm RLS is enforced ──────────────────────
-- See db/policies/rls_test.sql for the test queries.
