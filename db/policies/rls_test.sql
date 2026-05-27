-- RLS isolation test
-- Run this as a non-service-role user to confirm cross-user leakage is impossible.
-- Replace :user_a_id and :user_b_id with real profile UUIDs from your test data.
--
-- Expected results: every query that tries to read user B's data returns 0 rows.

-- 1. Simulate being user A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": ":user_a_id"}';

-- 2. Attempt to read user B's own grades — should return 0 rows
SELECT count(*) AS should_be_zero
FROM grade_submissions
WHERE profile_id = ':user_b_id';

-- 3. Attempt to read user B's profile — should return 0 rows
SELECT count(*) AS should_be_zero
FROM profiles
WHERE id = ':user_b_id';

-- 4. Verify user A can only see their own profile
SELECT count(*) AS should_be_one
FROM profiles
WHERE id = ':user_a_id';

-- 5. Verify approved grades of OTHERS are visible to a verified user
-- (This tests the approved+verified read path — expected >=0)
SELECT count(*) AS visible_approved_grades
FROM grade_submissions
WHERE status = 'approved';
