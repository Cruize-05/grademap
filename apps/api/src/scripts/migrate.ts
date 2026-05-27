/**
 * Migration runner — applies every db/migrations/*.sql file in numerical order.
 *
 * Each migration is wrapped in a transaction. A `_migrations` table tracks
 * which migrations have already run so re-running is idempotent.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --filter @grademap/api migrate
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const REPO_ROOT = resolve(import.meta.dirname ?? __dirname, "../../../..");
const MIGRATIONS_DIR = resolve(REPO_ROOT, "db/migrations");

async function main(): Promise<void> {
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await client.query<{ filename: string }>(
      "SELECT filename FROM _migrations"
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
      console.log(`  → ${file}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        count++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }

    console.log(`\nApplied ${count} new migration(s). Total in DB: ${appliedSet.size + count}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
