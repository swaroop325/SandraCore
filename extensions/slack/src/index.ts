import { App, type MessageEvent } from "@slack/bolt";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createSubsystemLogger, db, auditLog } from "@sandra/utils";
import { handleMessage } from "@sandra/agent";
import { registerApp } from "./send.js";

export { sendSlack } from "./send.js";

const log = createSubsystemLogger("slack");

export let app: App | null = null;

// ---------------------------------------------------------------------------
// User upsert
// ---------------------------------------------------------------------------

async function upsertSlackUser(
  slackId: string,
  displayName: string
): Promise<{ id: string; status: string }> {
  // Use phone field with "sl:" prefix as Slack identifier (mirrors "dc:" for Discord)
  const phone = `sl:${slackId}`;
  const res = await db.query<{ id: string; status: string }>(
    `INSERT INTO users (phone, name, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, status`,
    [phone, displayName]
  );
  return res.rows[0]!;
}

// ---------------------------------------------------------------------------
// Text chunking
// ---------------------------------------------------------------------------

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export function createSlackApp(signingSecret: string, botToken: string): App {
  const slackApp = new App({
    signingSecret,
    token: botToken,
    // HTTP mode — the API server mounts the receiver; do not call app.start() here
  });

  // Listen on all message events and filter to DMs (channel_type === "im") unless
  // SLACK_ALLOW_CHANNELS=1 is set in the environment.
  slackApp.message(async ({ message, client, context }) => {
    const msg = message as MessageEvent & {
      channel_type?: string;
      subtype?: string;
      bot_id?: string;
    };

    // Ignore bot messages and message edits/deletions (subtypes are present on those)
    if (msg.bot_id || msg.subtype) return;

    const allowChannels = process.env["SLACK_ALLOW_CHANNELS"] === "1";
    if (!allowChannels && context["channelType"] !== "im" && msg.channel_type !== "im") return;

    // message.text may be undefined for file/attachment-only messages
    const text =
      "text" in msg && typeof msg.text === "string" ? msg.text.trim() : "";
    if (!text) return;

    const slackUserId: string =
      "user" in msg && typeof msg.user === "string" ? msg.user : "";
    const channelId: string =
      "channel" in msg && typeof msg.channel === "string" ? msg.channel : "";

    if (!slackUserId || !channelId) return;

    try {
      // Fetch display name — non-fatal if it fails
      let displayName = slackUserId;
      try {
        const info = await client.users.info({ user: slackUserId });
        displayName =
          info.user?.profile?.display_name ||
          info.user?.real_name ||
          info.user?.name ||
          slackUserId;
      } catch {
        // Fall back to raw Slack user ID
      }

      const user = await upsertSlackUser(slackUserId, displayName);

      if (user.status !== "approved") {
        void auditLog({
          action: "auth.failure",
          channel: "slack",
          details: { slackId: slackUserId },
        });
        await client.chat.postMessage({
          channel: channelId,
          text: "You are not yet approved. Contact the administrator for access.",
        });
        return;
      }

      // Show typing indicator (fire-and-forget; not all plan types support it)
      await (client.conversations as unknown as { typing: (args: { channel: string }) => Promise<void> })
        .typing({ channel: channelId })
        .catch(() => {/* ignore */});

      void auditLog({ action: "message.received", userId: user.id, channel: "slack" });

      const response = await handleMessage({
        id: crypto.randomUUID(),
        text,
        userId: user.id,
        sessionId: `sl:${slackUserId}`,
        channel: "slack",
        locale: "en",
        timestamp: Date.now(),
      });

      if (response.reply) {
        // Slack's hard limit is ~4000 chars per message; chunk at 3000 for safety
        const chunks = chunkText(response.reply, 3000);
        for (const chunk of chunks) {
          await client.chat.postMessage({ channel: channelId, text: chunk });
        }
      }
    } catch (err) {
      log.error("Error handling Slack message", {
        error: err instanceof Error ? err.message : String(err),
        slackUserId,
      });
      await client.chat
        .postMessage({
          channel: channelId,
          text: "Sorry, something went wrong. Please try again.",
        })
        .catch(() => {/* ignore */});
    }
  });

  app = slackApp;
  registerApp(slackApp);
  return slackApp;
}

// ---------------------------------------------------------------------------
// Accessors / helpers
// ---------------------------------------------------------------------------

export function getSlackApp(): App | null {
  return app;
}

/**
 * Return the Express-compatible request handler for HTTP-mode mounting.
 *
 * Usage in the API server:
 *   expressApp.post("/slack/events", getWebhookHandler(slackApp));
 */
export function getWebhookHandler(
  a: App
): (req: IncomingMessage, res: ServerResponse) => void {
  // Bolt's default HTTP receiver exposes requestHandler on the receiver object
  return (
    (a as unknown as { receiver: { requestHandler: (req: IncomingMessage, res: ServerResponse) => void } })
      .receiver.requestHandler
  );
}
