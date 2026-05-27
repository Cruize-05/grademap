-- Migration 006: admin_audit_log
-- Every approve/reject action is immutably recorded here.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES profiles(id),
  action      text NOT NULL,           -- 'approve_submission' | 'reject_submission'
  target_id   uuid NOT NULL,           -- the grade_submissions.id acted upon
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor  ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_log(target_id);
