-- Synthetic grade data — DEV / CI ONLY. NEVER run in production.
-- Generates ~500 plausible grade records spread across the sample UB courses.
-- Uses a PL/pgSQL block to loop and insert varied data.

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
  g                int;
BEGIN
  SELECT id INTO v_institution_id FROM institutions WHERE code = 'UB';
  IF v_institution_id IS NULL THEN
    RAISE NOTICE 'UB institution not found — run courses.sql first.';
    RETURN;
  END IF;

  SELECT ARRAY_AGG(id) INTO v_course_ids FROM courses WHERE institution_id = v_institution_id;

  -- Create 30 synthetic profiles (no auth.users rows — only for testing the mining pipeline)
  FOR i IN 1..30 LOOP
    v_profile_id := gen_random_uuid();

    -- Each synthetic student takes 4-6 courses per semester for 2 semesters
    FOR j IN 1..2 LOOP
      FOR k IN 1..5 LOOP
        -- Pick a random course
        v_course_id := v_course_ids[1 + (floor(random() * array_length(v_course_ids, 1)))::int];
        -- Weighted random grade (slightly skewed toward passing)
        g := CASE
          WHEN random() < 0.15 THEN 7  -- F
          WHEN random() < 0.25 THEN 6  -- D
          WHEN random() < 0.45 THEN 5  -- C
          WHEN random() < 0.65 THEN 4  -- C+
          WHEN random() < 0.80 THEN 3  -- B
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
