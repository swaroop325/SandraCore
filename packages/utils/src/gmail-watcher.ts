import { google } from "googleapis";
import { createSubsystemLogger } from "./logger.js";

const log = createSubsystemLogger("gmail-watcher");

export interface GmailWatchConfig {
  /** GCP project topic name, e.g. "projects/my-project/topics/gmail" */
  topicName: string;
  /** Gmail account to watch, e.g. "user@gmail.com" */
  emailAddress: string;
  /** Google OAuth2 credentials (access_token, refresh_token, client_id, client_secret) */
  credentials: {
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    access_token?: string;
    refresh_token: string;
  };
}

export interface GmailPushNotification {
  /** base64url-encoded JSON: { emailAddress, historyId } */
  data: string;
  messageId: string;
  publishTime: string;
}

export interface GmailWatcherHandle {
  stop(): void;
}

/**
 * Start Gmail watch with automatic renewal.
 * Returns a handle to stop the renewal timer.
 */
export async function startGmailWatch(config: GmailWatchConfig): Promise<GmailWatcherHandle> {
  const auth = buildAuthClient(config.credentials);
  const gmail = google.gmail({ version: "v1", auth });

  async function registerWatch(): Promise<void> {
    try {
      const res = await gmail.users.watch({
        userId: "me",
        requestBody: {
          topicName: config.topicName,
          labelIds: ["INBOX"],
          labelFilterBehavior: "INCLUDE",
        },
      });
      log.info("Gmail watch registered", {
        historyId: res.data.historyId,
        expiration: res.data.expiration,
      });
    } catch (err) {
      log.error("Failed to register Gmail watch", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // Initial registration
  await registerWatch();

  // Renew every 12 hours
  const interval = setInterval(() => {
    registerWatch().catch((err) => {
      log.error("Gmail watch renewal failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, 12 * 60 * 60 * 1000);

  return {
    stop() {
      clearInterval(interval);
    },
  };
}

/**
 * Process a Gmail Pub/Sub push notification.
 * Decodes the base64 data, fetches unread messages since historyId,
 * and delivers them via the onMessage callback.
 *
 * @param notification - The Pub/Sub push notification body
 * @param config - Gmail watcher config
 * @param onMessage - Callback for each new email message text
 */
export async function processGmailPushNotification(
  notification: GmailPushNotification,
  config: GmailWatchConfig,
  onMessage: (opts: {
    emailAddress: string;
    historyId: string;
    subject: string;
    body: string;
    from: string;
  }) => Promise<void>
): Promise<void> {
  let decoded: { emailAddress: string; historyId: string };
  try {
    const raw = Buffer.from(notification.data, "base64url").toString("utf-8");
    decoded = JSON.parse(raw) as { emailAddress: string; historyId: string };
  } catch {
    log.warn("Failed to decode Gmail push notification data");
    return;
  }

  const auth = buildAuthClient(config.credentials);
  const gmail = google.gmail({ version: "v1", auth });

  // Fetch history to find new messages
  try {
    const histRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId: decoded.historyId,
      historyTypes: ["messageAdded"],
      labelId: "INBOX",
    });

    const histories = histRes.data.history ?? [];
    for (const hist of histories) {
      for (const msgRef of hist.messagesAdded ?? []) {
        const msgId = msgRef.message?.id;
        if (!msgId) continue;

        // Fetch full message
        const msgRes = await gmail.users.messages.get({
          userId: "me",
          id: msgId,
          format: "full",
        });

        const headers = msgRes.data.payload?.headers ?? [];
        const subject =
          headers.find((h) => h.name?.toLowerCase() === "subject")?.value ??
          "(no subject)";
        const from =
          headers.find((h) => h.name?.toLowerCase() === "from")?.value ??
          "unknown";
        const body = extractEmailBody(msgRes.data.payload);

        await onMessage({
          emailAddress: decoded.emailAddress,
          historyId: decoded.historyId,
          subject,
          body,
          from,
        });
      }
    }
  } catch (err) {
    log.error("Failed to process Gmail history", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function buildAuthClient(credentials: GmailWatchConfig["credentials"]) {
  const oauth2 = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uri
  );
  oauth2.setCredentials({
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token,
  });
  return oauth2;
}

function extractEmailBody(payload: any): string {
  if (!payload) return "";

  // Try text/plain part first
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Recurse into parts
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractEmailBody(part);
      if (text) return text;
    }
  }

  return "";
}

