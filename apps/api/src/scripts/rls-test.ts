/**
 * RLS isolation test — proves a user A cannot read user B's rows.
 *
 * Strategy:
 *   1. As service role (bypasses RLS), create two synthetic auth.users + profiles,
 *      and insert one grade for each.
 *   2. Open a NEW connection, SET ROLE authenticated, SET LOCAL request.jwt.claims
 *      to user A's UUID. Confirm:
 *        - SELECT from profiles returns 1 row (own profile only)
 *        - SELECT from profiles WHERE id = userB returns 0 rows
 *        - SELECT from grade_submissions WHERE profile_id = userB returns 0 rows
 *   3. Tear down: delete the two synthetic users.
 *
 * Exits 0 on success, 1 on any assertion failure or error.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --filter @grademap/api rls:test
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";

async function main(): Promise<void> {
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  // Admin client — bypasses RLS (postgres superuser locally; service role on Supabase)
  const admin = new Client({ connectionString: dbUrl });
  await admin.connect();

  const userA = randomUUID();
  const userB = randomUUID();
  let institutionId: string | undefined;
  let courseId: string | undefined;

  try {
    // ─── Setup ────────────────────────────────────────────────────────────────
    const { rows: instRows } = await admin.query<{ id: string }>(
      "SELECT id FROM institutions WHERE code = 'UB' LIMIT 1"
    );
    if (!instRows[0]) throw new Error("UB institution not seeded; run pnpm seed first");
    institutionId = instRows[0].id;

    const { rows: courseRows } = await admin.query<{ id: string }>(
      "SELECT id FROM courses WHERE institution_id = $1 LIMIT 1",
      [institutionId]
    );
    if (!courseRows[0]) throw new Error("No courses seeded; run pnpm seed first");
    courseId = courseRows[0].id;

    await admin.query(
      "INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4) ON CONFLICT DO NOTHING",
      [userA, `a-${userA}@ub.cm`, userB, `b-${userB}@ub.cm`]
    );

    await admin.query(
      `INSERT INTO profiles (id, institution_id, programme, level, verified_at)
       VALUES ($1, $2, 'CS', 2, now()), ($3, $2, 'CS', 2, now())`,
      [userA, institutionId, userB]
    );

    await admin.query(
      `INSERT INTO grade_submissions
        (profile_id, course_id, semester, academic_year, grade, grade_point, status)
       VALUES
        ($1, $3, 1, 2024, 'A', 4.00, 'approved'),
        ($2, $3, 1, 2024, 'F', 0.00, 'approved')`,
      [userA, userB, courseId]
    );

    // ─── Assertion phase — act as user A ──────────────────────────────────────
    const asA = new Client({ connectionString: dbUrl });
    await asA.connect();
    try {
      // Set the JWT claim BEFORE switching role (only superuser can call set_config)
      await asA.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: userA }),
      ]);
      await asA.query("SET ROLE authenticated");

      // Test 1: profiles — A should see exactly their own row
      const ownProfile = await asA.query<{ count: string }>(
        "SELECT count(*) FROM profiles WHERE id = $1",
        [userA]
      );
      assertEq(ownProfile.rows[0]?.count, "1", "user A should see their own profile");

      // Test 2: profiles — A should NOT see B's row
      const otherProfile = await asA.query<{ count: string }>(
        "SELECT count(*) FROM profiles WHERE id = $1",
        [userB]
      );
      assertEq(otherProfile.rows[0]?.count, "0", "user A must NOT see user B's profile");

      // Test 3: grade_submissions — A must NOT see B's row via the own-row path.
      // The status='approved' policy lets verified users read approved grades, and
      // both rows are seeded 'approved'. To prove OWN-ROW isolation specifically,
      // downgrade B's row to 'quarantine' (only the owner can read quarantined rows).
      await admin.query("UPDATE grade_submissions SET status='quarantine' WHERE profile_id = $1", [
        userB,
      ]);

      const quarantinedOther = await asA.query<{ count: string }>(
        "SELECT count(*) FROM grade_submissions WHERE profile_id = $1",
        [userB]
      );
      assertEq(
        quarantinedOther.rows[0]?.count,
        "0",
        "user A must NOT see user B's quarantined grade"
      );

      // Test 4: user A CAN see their own grade
      const ownGrade = await asA.query<{ count: string }>(
        "SELECT count(*) FROM grade_submissions WHERE profile_id = $1",
        [userA]
      );
      assertEq(ownGrade.rows[0]?.count, "1", "user A should see their own grade row");

      console.log("✓ RLS isolation verified — user A cannot read user B's rows");
    } finally {
      await asA.end();
    }
  } finally {
    // ─── Teardown ─────────────────────────────────────────────────────────────
    await admin.query("DELETE FROM grade_submissions WHERE profile_id IN ($1, $2)", [userA, userB]);
    await admin.query("DELETE FROM profiles WHERE id IN ($1, $2)", [userA, userB]);
    await admin.query("DELETE FROM auth.users WHERE id IN ($1, $2)", [userA, userB]);
    await admin.end();
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`FAIL: ${msg} (expected ${String(expected)}, got ${String(actual)})`);
  }
  console.log(`  ✓ ${msg}`);
}

main().catch((err) => {
  console.error("✗", err.message);
  process.exit(1);
});
