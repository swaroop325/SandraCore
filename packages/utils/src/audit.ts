import { db } from "./db.js";
import { createSubsystemLogger } from "./logger.js";

const log = createSubsystemLogger("audit");

export type AuditAction =
  | "auth.success"
  | "auth.failure"
  | "auth.lockout"
  | "pairing.created"
  | "pairing.redeemed"
  | "pairing.expired"
  | "message.received"
  | "tool.called"
  | "admin.access"
  | "rate_limit.exceeded"
  | "security.violation";

export interface AuditEntry {
  userId?: string;
  sessionId?: string;
  action: AuditAction;
  ip?: string;
  channel?: string;
  details?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Best-effort — never throws.
 * Falls back to structured log if DB is unavailable.
 */
export async function auditLog(entry: AuditEntry): Promise<void> {
  const { userId, sessionId, action, ip, channel, details } = entry;
  try {
    await db.execute(
      `INSERT INTO audit_log (user_id, session_id, action, ip, channel, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId ?? null, sessionId ?? null, action, ip ?? null, channel ?? null,
       details ? JSON.stringify(details) : null]
    );
  } catch {
    // Best-effort: log to console if DB is unavailable
    log.warn("audit log DB write failed — logging to stdout", { ...entry });
  }
}
