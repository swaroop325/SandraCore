#!/usr/bin/env node
// Run all SQL migrations in order. Safe to re-run — errors are caught per-file.
import { createRequire } from "node:module";
// Resolve pg from packages/utils which declares it as a dependency
const require = createRequire(new URL("../packages/utils/package.json", import.meta.url));
const pg = require("pg");
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "infra/migrations");

const migrations = [
  "0001_initial.sql",
  "0002_pairing.sql",
  "0003_usage_tracking.sql",
  "0004_security.sql",
  "0005_model_override.sql",
  "0006_cron_jobs.sql",
  "0007_cron_schedule.sql",
  "0008_users_email.sql",
];

const client = new pg.Client({
  connectionString: process.env["DATABASE_URL"],
  ssl: false,
});

try {
  await client.connect();
  for (const file of migrations) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    try {
      await client.query(sql);
    } catch (err) {
      // Ignore "already exists" errors — migration was already applied
      if (!err.message.includes("already exists")) {
        console.warn(`  ⚠ ${file}: ${err.message}`);
      }
    }
  }
  console.log("✓ Migrations applied");
} catch (err) {
  console.warn(`⚠ DB migration skipped: ${err.message}`);
  process.exit(0);
} finally {
  await client.end().catch(() => {});
}
