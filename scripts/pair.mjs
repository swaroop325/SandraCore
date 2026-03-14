#!/usr/bin/env node
// Generate a Telegram pairing code for local dev.
// Usage: node scripts/pair.mjs [channel]
// Requires the dev server to be running and ADMIN_API_KEY set in .env.local

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local
const envFile = join(ROOT, ".env.local");
let adminKey = process.env["ADMIN_API_KEY"];
let port = process.env["PORT"] ?? "3000";

try {
  const lines = readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const [k, ...rest] = line.split("=");
    const v = rest.join("=").trim();
    if (k?.trim() === "ADMIN_API_KEY" && v) adminKey = v;
    if (k?.trim() === "PORT" && v) port = v;
  }
} catch {
  // .env.local not found — rely on process.env
}

const channel = process.argv[2] ?? "telegram";

if (!adminKey) {
  console.error("✗ ADMIN_API_KEY not set. Add it to .env.local:\n  ADMIN_API_KEY=dev-admin-local");
  process.exit(1);
}

try {
  const res = await fetch(`http://localhost:${port}/admin/pairing/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify({ channel }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`✗ Admin API error ${res.status}: ${body}`);
    process.exit(1);
  }

  const { code, expiresAt } = await res.json();
  const expires = new Date(expiresAt).toLocaleTimeString();

  console.log("");
  console.log("┌─────────────────────────────────┐");
  console.log(`│  Pairing code: ${code.padEnd(17)}│`);
  console.log(`│  Channel:      ${channel.padEnd(17)}│`);
  console.log(`│  Expires:      ${expires.padEnd(17)}│`);
  console.log("└─────────────────────────────────┘");
  console.log("");
  console.log(`Send to the bot: /pair ${code}`);
  console.log("");
} catch (err) {
  console.error(`✗ Could not reach server on port ${port}. Is dev.sh running?`);
  process.exit(1);
}
