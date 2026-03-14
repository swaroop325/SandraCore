import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { db, auditLog, safeCompare, sha256Hex } from "@sandra/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  telegram_id: string | null;
  phone: string | null;
  email: string | null;
  name: string | null;
  locale: string;
  status: string;
  created_at: Date;
}

interface MessageRow {
  id: string;
  session_id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: Date;
}

interface AuditRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  action: string;
  ip: string | null;
  channel: string | null;
  details: unknown;
  created_at: Date;
}

interface StatusCountRow {
  status: string;
  count: string;
}

interface CountRow {
  count: string;
}

interface LlmUsageRow {
  total_tokens: string | null;
  total_cost: string | null;
}

interface WebhookHookRow {
  id: string;
  user_id: string;
  name: string;
  hook_id: string;
  secret: string;
  enabled: boolean;
  created_at: Date;
}

// ── Admin key middleware ───────────────────────────────────────────────────

function requireAdminKey(req: Request, res: Response, next: () => void): void {
  const adminKey = process.env["ADMIN_API_KEY"];
  const provided = req.headers["x-admin-key"];

  if (
    !adminKey ||
    typeof provided !== "string" ||
    !safeCompare(provided, adminKey)
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Router ────────────────────────────────────────────────────────────────

export const adminRouter = Router();

adminRouter.use(requireAdminKey);

// ── GET /admin/users ──────────────────────────────────────────────────────

adminRouter.get("/users", async (_req: Request, res: Response) => {
  try {
    const result = await db.query<UserRow>(
      `SELECT id, telegram_id, phone, email, name, locale, status, created_at
         FROM users
        ORDER BY created_at DESC
        LIMIT 50`
    );
    res.json({ users: result.rows, total: result.rows.length });
  } catch (err: unknown) {
    console.error("[admin] GET /users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── UUID validation helper ─────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ── GET /admin/users/:id ──────────────────────────────────────────────────

adminRouter.get("/users/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!isValidUuid(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  try {
    const userResult = await db.query<UserRow>(
      `SELECT id, telegram_id, phone, email, name, locale, status, created_at
         FROM users WHERE id = $1`,
      [id]
    );
    const user = userResult.rows[0];
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const msgResult = await db.query<MessageRow>(
      `SELECT id, session_id, user_id, role, content, created_at
         FROM conversation_messages
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5`,
      [id]
    );

    res.json({ user, recentMessages: msgResult.rows });
  } catch (err: unknown) {
    console.error("[admin] GET /users/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /admin/users/:id/approve ─────────────────────────────────────────

adminRouter.post("/users/:id/approve", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!isValidUuid(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  try {
    const result = await db.query<{ id: string }>(
      `UPDATE users SET status = 'approved' WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    void auditLog({ action: "user.approved", details: { userId: id } });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[admin] POST /users/:id/approve error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /admin/users/:id/block ───────────────────────────────────────────

adminRouter.post("/users/:id/block", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (!isValidUuid(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  try {
    const result = await db.query<{ id: string }>(
      `UPDATE users SET status = 'blocked' WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    void auditLog({ action: "user.blocked", details: { userId: id } });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[admin] POST /users/:id/block error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /admin/pairing/generate ──────────────────────────────────────────

adminRouter.post("/pairing/generate", async (req: Request, res: Response) => {
  const { channel = "telegram" } = (req.body ?? {}) as { channel?: string };
  try {
    const code = crypto.randomBytes(16).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO pairing_requests (id, code, telegram_id, channel, created_at, expires_at)
       VALUES (gen_random_uuid(), $1, 0, $2, now(), $3)`,
      [code, channel, expiresAt]
    );

    void auditLog({ action: "pairing.created", details: { codeHash: sha256Hex(code), channel } });
    res.status(201).json({ code, expiresAt });
  } catch (err: unknown) {
    console.error("[admin] POST /pairing/generate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /admin/audit ──────────────────────────────────────────────────────

adminRouter.get("/audit", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
  const offset = Number(req.query["offset"] ?? 0);
  const action = (req.query["action"] as string | undefined) ?? null;
  const userId = (req.query["userId"] as string | undefined) ?? null;

  if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
    res.status(400).json({ error: "Invalid limit or offset" });
    return;
  }

  try {
    const result = await db.query<AuditRow>(
      `SELECT id, user_id, session_id, action, ip, channel, details, created_at
         FROM audit_log
        WHERE ($1::text IS NULL OR action = $1)
          AND ($2::uuid IS NULL OR user_id = $2::uuid)
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4`,
      [action, userId, limit, offset]
    );

    const countResult = await db.query<CountRow>(
      `SELECT COUNT(*) AS count
         FROM audit_log
        WHERE ($1::text IS NULL OR action = $1)
          AND ($2::uuid IS NULL OR user_id = $2::uuid)`,
      [action, userId]
    );

    res.json({
      entries: result.rows,
      total: Number(countResult.rows[0]?.count ?? 0),
    });
  } catch (err: unknown) {
    console.error("[admin] GET /audit error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /admin/stats ──────────────────────────────────────────────────────

adminRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [
      userStatusResult,
      messages24hResult,
      pendingTasksResult,
      upcomingRemindersResult,
      llmUsageResult,
    ] = await Promise.all([
      db.query<StatusCountRow>(
        `SELECT status, COUNT(*) AS count FROM users GROUP BY status`
      ),
      db.query<CountRow>(
        `SELECT COUNT(*) AS count
           FROM conversation_messages
          WHERE created_at > now() - interval '24 hours'`
      ),
      db.query<CountRow>(
        `SELECT COUNT(*) AS count FROM tasks WHERE status = 'pending'`
      ),
      db.query<CountRow>(
        `SELECT COUNT(*) AS count
           FROM reminders
          WHERE sent = false AND trigger_time < now() + interval '1 hour'`
      ),
      db.query<LlmUsageRow>(
        `SELECT SUM(input_tokens + output_tokens) AS total_tokens,
                SUM(estimated_cost_usd) AS total_cost
           FROM llm_usage
          WHERE recorded_at > now() - interval '24 hours'`
      ),
    ]);

    const totalUsers = userStatusResult.rows.reduce(
      (sum, r) => sum + Number(r.count),
      0
    );
    const byStatus: Record<string, number> = {};
    for (const row of userStatusResult.rows) {
      byStatus[row.status] = Number(row.count);
    }

    const llmRow = llmUsageResult.rows[0];

    res.json({
      users: { total: totalUsers, byStatus },
      messages24h: Number(messages24hResult.rows[0]?.count ?? 0),
      pendingTasks: Number(pendingTasksResult.rows[0]?.count ?? 0),
      upcomingReminders: Number(upcomingRemindersResult.rows[0]?.count ?? 0),
      llm24h: {
        tokens: Number(llmRow?.total_tokens ?? 0),
        costUsd: Number(llmRow?.total_cost ?? 0),
      },
    });
  } catch (err: unknown) {
    console.error("[admin] GET /stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /admin/webhooks ──────────────────────────────────────────────────

adminRouter.post("/webhooks", async (req: Request, res: Response) => {
  const { name, userId } = (req.body ?? {}) as {
    name?: string;
    userId?: string;
  };

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  try {
    const hookId = crypto.randomBytes(8).toString("hex");
    const secret = crypto.randomBytes(32).toString("hex");

    await db.query(
      `INSERT INTO webhook_hooks (id, user_id, name, hook_id, secret, enabled)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, true)`,
      [userId, name, hookId, secret]
    );

    res.status(201).json({
      hookId,
      secret,
      url: "/webhooks/inbound/" + hookId,
    });
  } catch (err: unknown) {
    console.error("[admin] POST /webhooks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /admin/webhooks ───────────────────────────────────────────────────

adminRouter.get("/webhooks", async (_req: Request, res: Response) => {
  try {
    const result = await db.query<WebhookHookRow>(
      `SELECT id, user_id, name, hook_id, enabled, created_at FROM webhook_hooks ORDER BY created_at DESC`
    );
    res.json({ hooks: result.rows });
  } catch (err: unknown) {
    console.error("[admin] GET /webhooks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
