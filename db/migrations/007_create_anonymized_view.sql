-- Migration 007: anonymized grades view for the mining service
-- Exposes only approved records with NO profile_id.

CREATE OR REPLACE VIEW v_anonymized_grades AS
SELECT
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
  'Anonymised grade records for the mining service. No profile_id exposed.';
