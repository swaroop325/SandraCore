import crypto, { timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { db, auditLog } from "@sandra/utils";
import { handleMessage } from "@sandra/agent";

interface WebhookHookRow {
  id: string;
  user_id: string;
  name: string;
  hook_id: string;
  secret: string;
  enabled: boolean;
}

/** Handle an inbound webhook trigger: POST /webhooks/inbound/:hookId */
export async function handleWebhookInbound(req: Request, res: Response): Promise<void> {
  const { hookId } = req.params as { hookId: string };

  // 1. Look up hook by hookId
  let hook: WebhookHookRow | undefined;
  try {
    const result = await db.query<WebhookHookRow>(
      `SELECT id, user_id, name, hook_id, secret, enabled
         FROM webhook_hooks
        WHERE hook_id = $1
        LIMIT 1`,
      [hookId],
    );
    hook = result.rows[0];
  } catch {
    res.status(500).json({ error: "Internal error" });
    return;
  }

  // 2. Not found or disabled → 404
  if (!hook || !hook.enabled) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  // 3. Verify HMAC-SHA256 signature
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const expectedSig = crypto
    .createHmac("sha256", hook.secret)
    .update(rawBody)
    .digest("hex");

  const providedSig = req.headers["x-hook-signature"];
  const sigMismatch =
    typeof providedSig !== "string" ||
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig));
  if (sigMismatch) {
    void auditLog({
      action: "security.violation",
      userId: hook.user_id,
      channel: "webhook",
      details: { hookId, reason: "invalid_signature" },
    });
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // 5. Construct message from webhook payload
  const messageText = "Webhook trigger: " + JSON.stringify(req.body);

  // 6. Call handleMessage
  try {
    const response = await handleMessage({
      id: crypto.randomUUID(),
      text: messageText,
      userId: hook.user_id,
      sessionId: "webhook:" + hookId,
      channel: "internal",
      locale: "en",
      timestamp: Date.now(),
    });

    // 8. Audit log success
    void auditLog({
      action: "message.received",
      userId: hook.user_id,
      sessionId: "webhook:" + hookId,
      channel: "webhook",
      details: { hookId },
    });

    // 7. Respond with reply
    res.status(200).json({ ok: true, reply: response.reply });
  } catch (err: unknown) {
    console.error("[webhooks] handleWebhookInbound error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
