import { randomBytes } from "node:crypto";
import { db, withTransaction } from "./db.js";
import { auditLog } from "./audit.js";
import { sha256Hex } from "./crypto.js";

// Human-friendly alphabet — no ambiguous characters (0/O, 1/I/l)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_PENDING_PER_USER = 3;

/** Generate a cryptographically random pairing code using node:crypto randomBytes */
export function generatePairingCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length]!)
    .join("");
}

export interface PairingRequest {
  id: string;
  code: string;
  telegramId: bigint;
  channel: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Create a new pairing request for a Telegram user.
 * Cleans up expired requests first. Rejects if MAX_PENDING_PER_USER active.
 */
export async function createPairingRequest(
  telegramId: number,
  channel = "telegram"
): Promise<{ code: string; expiresAt: Date }> {
  // Purge expired requests for this user
  await db.execute(
    `DELETE FROM pairing_requests
     WHERE telegram_id = $1 AND (expires_at < now() OR used_at IS NOT NULL)`,
    [telegramId]
  );

  // Count still-active pending requests
  const pending = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM pairing_requests
     WHERE telegram_id = $1 AND used_at IS NULL AND expires_at > now()`,
    [telegramId]
  );
  const activeCount = Number(pending.rows[0]?.count ?? 0);
  if (activeCount >= MAX_PENDING_PER_USER) {
    throw new Error(
      `Too many pending pairing requests for telegram_id ${telegramId}. Wait for existing codes to expire.`
    );
  }

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + TTL_MS);

  await db.execute(
    `INSERT INTO pairing_requests (code, telegram_id, channel, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [code, telegramId, channel, expiresAt]
  );

  void auditLog({ action: "pairing.created", details: { telegramId: String(telegramId), channel } });
  return { code, expiresAt };
}

/**
 * Attempt to redeem a pairing code sent by a user.
 * Returns true if approved, false if code invalid/expired/already used.
 * On success: marks code used, sets user status to 'approved', adds to allowlist.
 */
export async function redeemPairingCode(
  inputCode: string,
  telegramId: number
): Promise<boolean> {
  const normalised = inputCode.trim().toUpperCase();

  // Wrap the lookup-and-redeem in a transaction with SELECT FOR UPDATE to
  // prevent TOCTOU races where two concurrent requests redeem the same code.
  const redeemed = await withTransaction(async (client) => {
    const result = await client.query<{ id: string; telegram_id: string }>(
      `SELECT id, telegram_id
       FROM pairing_requests
       WHERE code = $1
         AND telegram_id = $2
         AND used_at IS NULL
         AND expires_at > now()
       FOR UPDATE`,
      [normalised, telegramId]
    );

    const request = result.rows[0];
    if (!request) {
      return false;
    }

    // Mark code as used (within same transaction — atomic with the lock)
    await client.query(
      `UPDATE pairing_requests SET used_at = now() WHERE id = $1`,
      [request.id]
    );

    return true;
  });

  if (!redeemed) {
    void auditLog({ action: "auth.failure", details: { reason: "invalid_pairing_code" } });
    return false;
  }

  // Approve the user and add to allowlist (outside the lock — these are idempotent)
  await db.execute(
    `UPDATE users SET status = 'approved' WHERE telegram_id = $1`,
    [telegramId]
  );

  await db.execute(
    `INSERT INTO user_allowlist (user_id, channel)
     SELECT id, 'telegram' FROM users WHERE telegram_id = $1
     ON CONFLICT (user_id, channel) DO NOTHING`,
    [telegramId]
  );

  void auditLog({ action: "pairing.redeemed", details: { codeHash: sha256Hex(normalised), channel: "telegram" } });
  return true;
}

/**
 * List active (unused, non-expired) pairing requests.
 * Used by the admin to see pending approvals.
 */
export async function listActivePairingRequests(): Promise<PairingRequest[]> {
  const result = await db.query<{
    id: string;
    code: string;
    telegram_id: string;
    channel: string;
    created_at: Date;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `SELECT id, code, telegram_id, channel, created_at, expires_at, used_at
     FROM pairing_requests
     WHERE used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC`
  );

  return result.rows.map((r) => ({
    id: r.id,
    code: r.code,
    telegramId: BigInt(r.telegram_id),
    channel: r.channel,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    usedAt: r.used_at,
  }));
}

/**
 * Admin: generate a pairing code for a specific telegram_id.
 * Useful for CLI-based approval flow.
 */
export async function generateApprovalCode(telegramId: number): Promise<string> {
  const { code, expiresAt } = await createPairingRequest(telegramId);
  console.log(
    `Pairing code for telegram_id ${telegramId}: ${code} (expires ${expiresAt.toISOString()})`
  );
  return code;
}
