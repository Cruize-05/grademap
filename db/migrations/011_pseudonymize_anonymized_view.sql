-- Migration 011: privacy-preserving student pseudonym for association mining.
--
-- The mining service needs to group grades by student to find co-failure
-- patterns (Apriori). But v_anonymized_grades must never expose profile_id.
-- The resolution is a *salted HMAC pseudonym*: a stable, irreversible token
-- that lets the miner link one student's rows together without learning who
-- they are. The salt lives in a locked-down table (never in source control),
-- so the hash cannot be reversed even by someone who can enumerate profile
-- UUIDs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Secret material store. One row today (the pseudonym salt); kept generic so
-- future server-side secrets have a home. Never granted to the 'authenticated'
-- role — only the migration owner and the service role may read it.
CREATE TABLE IF NOT EXISTS app_secrets (
  key   text  PRIMARY KEY,
  value bytea NOT NULL
);

REVOKE ALL ON app_secrets FROM PUBLIC;

-- Generate the salt exactly once. gen_random_bytes is from pgcrypto.
INSERT INTO app_secrets (key, value)
VALUES ('pseudonym_salt', gen_random_bytes(32))
ON CONFLICT (key) DO NOTHING;

-- Recreate the anonymized view with the pseudonym. student_hash is a hex
-- HMAC-SHA256 of the profile UUID under the secret salt: stable per student
-- (so baskets group correctly), irreversible without the salt, and carries no
-- PII. profile_id itself is still NOT exposed.
--
-- Drop first: prepending the student_hash column changes the column order, and
-- CREATE OR REPLACE VIEW only allows appending columns. Nothing in the DB
-- depends on this view (the mining pipeline reads it via pandas), so dropping
-- is safe.
DROP VIEW IF EXISTS v_anonymized_grades;

CREATE VIEW v_anonymized_grades AS
SELECT
  encode(
    hmac(
      gs.profile_id::text::bytea,
      (SELECT value FROM app_secrets WHERE key = 'pseudonym_salt'),
      'sha256'
    ),
    'hex'
  ) AS student_hash,
  c.institution_id,
  gs.course_id,
  gs.semester,
  gs.academic_year,
  gs.grade_point
FROM grade_submissions gs
JOIN courses c ON c.id = gs.course_id
WHERE gs.status = 'approved'
  AND gs.grade_point IS NOT NULL;

COMMENT ON VIEW v_anonymized_grades IS
  'Anonymised grade records for the mining service. profile_id is replaced by '
  'student_hash, a salted HMAC pseudonym — stable per student, irreversible '
  'without the salt in app_secrets. No PII exposed.';
