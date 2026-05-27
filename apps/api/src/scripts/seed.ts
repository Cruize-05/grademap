/**
 * Seed script — applies courses.sql always, and synthetic_grades.sql only in
 * NODE_ENV=development. Refuses to run if the DATABASE_URL looks like a
 * Supabase production URL (heuristic) and APP_ENV is not 'development'.
 *
 * Usage:
 *   DATABASE_URL=postgres://... NODE_ENV=development pnpm --filter @grademap/api seed
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const REPO_ROOT = resolve(import.meta.dirname ?? __dirname, "../../../..");
const SEED_DIR = resolve(REPO_ROOT, "db/seed");

const NODE_ENV = process.env["NODE_ENV"] ?? "production";
const APP_ENV = process.env["APP_ENV"] ?? NODE_ENV;
const isDev = APP_ENV === "development";

async function main(): Promise<void> {
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  // Safety check: never load synthetic data into Supabase production
  if (dbUrl.includes("supabase.co") && !isDev) {
    console.error("Refusing to seed: DATABASE_URL looks like Supabase and APP_ENV != development");
    process.exit(2);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    console.log("Seeding canonical course catalogue (UB sample)…");
    const courses = readFileSync(resolve(SEED_DIR, "courses.sql"), "utf8");
    await client.query(courses);
    const { rows: courseCount } = await client.query<{ count: string }>(
      "SELECT count(*) FROM courses"
    );
    console.log(`  ✓ ${courseCount[0]?.count ?? "?"} courses present`);

    if (isDev) {
      console.log("\nLoading synthetic grades (dev/CI only)…");
      const synth = readFileSync(resolve(SEED_DIR, "synthetic_grades.sql"), "utf8");
      await client.query(synth);
      const { rows: gsCount } = await client.query<{ count: string }>(
        "SELECT count(*) FROM grade_submissions"
      );
      console.log(`  ✓ ${gsCount[0]?.count ?? "?"} synthetic grade rows`);
    } else {
      console.log("\nSkipping synthetic grades (APP_ENV is not 'development').");
    }

    console.log("\nSeed complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
