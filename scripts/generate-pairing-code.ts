import { loadSecrets, generateApprovalCode } from "@sandra/utils";

await loadSecrets();

const telegramId = process.argv[2];
if (!telegramId || isNaN(Number(telegramId))) {
  console.error("Usage: tsx scripts/generate-pairing-code.ts <telegram_id>");
  process.exit(1);
}

const code = await generateApprovalCode(Number(telegramId));
console.log(`Share this code with the user: ${code}`);
process.exit(0);
