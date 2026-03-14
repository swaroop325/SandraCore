import { db, loadSecrets } from "@sandra/utils";
import { readFileSync } from "fs";
import { join } from "path";

await loadSecrets();

const sql = readFileSync(
  join(process.cwd(), "infra/migrations/0001_initial.sql"),
  "utf-8"
);

await db.execute(sql);
console.log("Migration complete.");
await process.exit(0);
