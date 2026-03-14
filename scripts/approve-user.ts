import { db, loadSecrets } from "@sandra/utils";

await loadSecrets();

const telegramId = process.argv[2];
if (!telegramId) {
  console.error("Usage: tsx scripts/approve-user.ts <telegram_id>");
  process.exit(1);
}

const res = await db.execute(
  `UPDATE users SET status = 'approved' WHERE telegram_id = $1 RETURNING id`,
  [telegramId]
);

if (res.rowCount === 0) {
  console.error(`No user found with telegram_id: ${telegramId}`);
  process.exit(1);
}
console.log(`Approved user with telegram_id: ${telegramId}`);
await process.exit(0);
