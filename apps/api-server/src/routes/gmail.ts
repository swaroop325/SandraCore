import type { Request, Response } from "express";
import { createSubsystemLogger, auditLog } from "@sandra/utils";
import { processGmailPushNotification, type GmailWatchConfig } from "@sandra/utils/gmail-watcher";
import { handleMessage } from "@sandra/agent";

const log = createSubsystemLogger("api:gmail");

let _watchConfig: GmailWatchConfig | null = null;

export function setGmailWatchConfig(cfg: GmailWatchConfig): void {
  _watchConfig = cfg;
}

/**
 * POST /webhooks/gmail
 * Receives Gmail Pub/Sub push notifications.
 * Google sends: { message: { data: base64url, messageId, publishTime }, subscription }
 */
export async function handleGmailWebhook(req: Request, res: Response): Promise<void> {
  // Always 200 immediately to avoid Pub/Sub retries
  res.sendStatus(200);

  if (!_watchConfig) {
    log.warn("Gmail webhook received but no watch config set");
    return;
  }

  const body = req.body as {
    message?: { data?: string; messageId?: string; publishTime?: string };
    subscription?: string;
  };
  const msg = body.message;

  if (!msg?.data) {
    log.warn("Gmail webhook: missing message.data");
    return;
  }

  try {
    await processGmailPushNotification(
      {
        data: msg.data,
        messageId: msg.messageId ?? "",
        publishTime: msg.publishTime ?? "",
      },
      _watchConfig,
      async ({ emailAddress, subject, body: emailBody, from }) => {
        // Lookup user by email
        const { db } = await import("@sandra/utils");
        const userRes = await db.query<{ id: string; status: string }>(
          "SELECT id, status FROM users WHERE email = $1 LIMIT 1",
          [emailAddress]
        );

        if (userRes.rows.length === 0) {
          log.debug("Gmail: no user found for email", { emailAddress });
          return;
        }

        const user = userRes.rows[0]!;
        if (user.status !== "approved") {
          void auditLog({
            action: "auth.failure",
            channel: "gmail",
            details: { emailAddress },
          });
          return;
        }

        const text = `[Email from ${from}]\nSubject: ${subject}\n\n${emailBody}`;

        void auditLog({ action: "message.received", userId: user.id, channel: "gmail" });

        await handleMessage({
          id: crypto.randomUUID(),
          text,
          userId: user.id,
          sessionId: `gmail:${emailAddress}`,
          channel: "gmail",
          locale: "en",
          timestamp: Date.now(),
        });

        log.info("Processed Gmail message", { from, subject });
      }
    );
  } catch (err) {
    log.error("Gmail webhook processing error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
