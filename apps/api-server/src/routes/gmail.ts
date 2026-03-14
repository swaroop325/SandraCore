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
 * Verify a Google-issued OIDC JWT for Pub/Sub push.
 * Checks iss, aud, and email claims. Signature verification requires
 * fetching Google's public keys; at minimum we validate the claims.
 * Returns false if verification fails, true if it passes (or is not configured).
 */
function verifyGoogleJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8")
    ) as Record<string, unknown>;

    // Validate issuer
    const iss = payload["iss"];
    if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
      log.warn("Gmail JWT: unexpected issuer", { iss });
      return false;
    }

    // Validate audience if configured
    const expectedAud = process.env["GMAIL_PUBSUB_AUDIENCE"];
    if (expectedAud) {
      const aud = payload["aud"];
      if (aud !== expectedAud) {
        log.warn("Gmail JWT: audience mismatch", { aud, expected: expectedAud });
        return false;
      }
    }

    // Validate service account email if configured
    const expectedEmail = process.env["GMAIL_SERVICE_ACCOUNT"];
    if (expectedEmail) {
      const email = payload["email"];
      if (email !== expectedEmail) {
        log.warn("Gmail JWT: email mismatch", { email, expected: expectedEmail });
        return false;
      }
    }

    return true;
  } catch (err) {
    log.warn("Gmail JWT: failed to decode token", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * POST /webhooks/gmail
 * Receives Gmail Pub/Sub push notifications.
 * Google sends: { message: { data: base64url, messageId, publishTime }, subscription }
 */
export async function handleGmailWebhook(req: Request, res: Response): Promise<void> {
  // ── Google OIDC JWT verification ─────────────────────────────────────────
  const audience = process.env["GMAIL_PUBSUB_AUDIENCE"];
  const serviceAccount = process.env["GMAIL_SERVICE_ACCOUNT"];
  const jwtConfigured = !!(audience || serviceAccount);

  const authHeader = req.headers["authorization"];
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (jwtConfigured) {
    if (!token) {
      log.warn("Gmail webhook: missing Authorization header");
      res.sendStatus(401);
      return;
    }
    if (!verifyGoogleJwt(token)) {
      void auditLog({ action: "security.violation", channel: "gmail", details: { reason: "invalid_google_jwt" } });
      res.sendStatus(401);
      return;
    }
  } else if (token) {
    // Best-effort check even when not fully configured
    if (!verifyGoogleJwt(token)) {
      log.warn("Gmail webhook: JWT present but failed basic validation — allowing through (GMAIL_PUBSUB_AUDIENCE / GMAIL_SERVICE_ACCOUNT not set)");
    }
  } else {
    log.warn("Gmail webhook: no Authorization header and GMAIL_PUBSUB_AUDIENCE/GMAIL_SERVICE_ACCOUNT not configured — allowing through");
  }

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
