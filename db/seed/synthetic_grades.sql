-- Synthetic grade data — DEV / CI ONLY. NEVER run in production.
-- Generates 30 synthetic students × 2 semesters × 5 courses = ~300 approved
-- grade records spread across the sample UB courses.
--
-- Each synthetic student gets a row in auth.users and profiles, marked as
-- verified, so RLS and aggregate logic work correctly.

-- Remove any previous synthetic run so re-seeding is idempotent.
-- grade_submissions cascade-deletes when profiles are deleted.
DELETE FROM profiles
  WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'synth-%@ub.cm');
DELETE FROM auth.users WHERE email LIKE 'synth-%@ub.cm';

DO $$
DECLARE
  v_institution_id uuid;
  v_course_ids     uuid[];
  v_course_id      uuid;
  v_gp             numeric(3,2);
  v_grades         text[] := ARRAY['A','B+','B','C+','C','D','F'];
  v_gps            numeric[] := ARRAY[4.00, 3.50, 3.00, 2.50, 2.00, 1.00, 0.00];
  v_profile_id     uuid;
  i                int;
  j                int;
  k                int;
  g                int;
BEGIN
  SELECT id INTO v_institution_id FROM institutions WHERE code = 'UB';
  IF v_institution_id IS NULL THEN
    RAISE NOTICE 'UB institution not found — run courses.sql first.';
    RETURN;
  END IF;

  SELECT ARRAY_AGG(id) INTO v_course_ids FROM courses WHERE institution_id = v_institution_id;

  -- Create 30 synthetic profiles (with matching auth.users rows for FK integrity).
  -- UUIDs are deterministic (based on loop index) so re-running the seed is idempotent.
  FOR i IN 1..30 LOOP
    v_profile_id := ('10000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;

    INSERT INTO auth.users (id, email)
    VALUES (v_profile_id, 'synth-' || i::text || '@ub.cm')
    ON CONFLICT DO NOTHING;

    INSERT INTO profiles (id, institution_id, programme, level, verified_at)
    VALUES (v_profile_id, v_institution_id, 'CS', 2, now())
    ON CONFLICT DO NOTHING;

    -- Each synthetic student takes 5 courses per semester for 2 semesters
    FOR j IN 1..2 LOOP
      FOR k IN 1..5 LOOP
        v_course_id := v_course_ids[1 + (floor(random() * array_length(v_course_ids, 1)))::int];
        -- Weighted random grade (slightly skewed toward passing)
        g := CASE
          WHEN random() < 0.10 THEN 7  -- F
          WHEN random() < 0.22 THEN 6  -- D
          WHEN random() < 0.40 THEN 5  -- C
          WHEN random() < 0.60 THEN 4  -- C+
          WHEN random() < 0.78 THEN 3  -- B
          WHEN random() < 0.92 THEN 2  -- B+
          ELSE 1                        -- A
        END;
        v_gp := v_gps[g];

        INSERT INTO grade_submissions
          (profile_id, course_id, semester, academic_year, grade, grade_point, status)
        VALUES
          (v_profile_id, v_course_id, j, 2024, v_grades[g], v_gp, 'approved')
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Synthetic grades inserted for dev/CI.';
END;
$$;

-- Co-failure cohort — DEV / CI ONLY.
-- Injects a *known* dangerous combination so the association-rule miner has a
-- real pattern to surface (the base cohort above is i.i.d. random, so Apriori
-- finds nothing). 15 students who fail BOTH CSC201 and CSC301 together. With
-- 15 >= k=10, the rule {CSC201} -> {CSC301} clears the k-anonymity gate and
-- appears in dangerous_combinations_cache after a pipeline run.
DO $$
DECLARE
  v_institution_id uuid;
  v_csc201         uuid;
  v_csc301         uuid;
  v_math101        uuid;
  v_profile_id     uuid;
  i                int;
BEGIN
  SELECT id INTO v_institution_id FROM institutions WHERE code = 'UB';
  IF v_institution_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_csc201  FROM courses WHERE institution_id = v_institution_id AND code = 'CSC201';
  SELECT id INTO v_csc301  FROM courses WHERE institution_id = v_institution_id AND code = 'CSC301';
  SELECT id INTO v_math101 FROM courses WHERE institution_id = v_institution_id AND code = 'MATH101';
  IF v_csc201 IS NULL OR v_csc301 IS NULL THEN
    RAISE NOTICE 'CSC201/CSC301 not found — skipping co-failure cohort.';
    RETURN;
  END IF;

  FOR i IN 1..15 LOOP
    v_profile_id := ('20000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;

    INSERT INTO auth.users (id, email)
    VALUES (v_profile_id, 'synth-cf-' || i::text || '@ub.cm')
    ON CONFLICT DO NOTHING;

    INSERT INTO profiles (id, institution_id, programme, level, verified_at)
    VALUES (v_profile_id, v_institution_id, 'CS', 2, now())
    ON CONFLICT DO NOTHING;

    -- The dangerous pair: both failed (grade F, 0.00).
    INSERT INTO grade_submissions
      (profile_id, course_id, semester, academic_year, grade, grade_point, status)
    VALUES
      (v_profile_id, v_csc201, 1, 2024, 'F', 0.00, 'approved'),
      (v_profile_id, v_csc301, 1, 2024, 'F', 0.00, 'approved')
    ON CONFLICT DO NOTHING;

    -- A passing course so the cohort isn't degenerate (and contributes to the
    -- per-course difficulty stats for MATH101).
    IF v_math101 IS NOT NULL THEN
      INSERT INTO grade_submissions
        (profile_id, course_id, semester, academic_year, grade, grade_point, status)
      VALUES
        (v_profile_id, v_math101, 1, 2024, 'B', 3.00, 'approved')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Co-failure cohort (CSC201+CSC301) inserted for dev/CI.';
END;
$$;
