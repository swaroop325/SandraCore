import { createSubsystemLogger } from "@sandra/utils";
import { createHmac } from "node:crypto";

const log = createSubsystemLogger("cron");

type ChannelSender = (recipientId: string, text: string) => Promise<void>;
const _senders = new Map<string, ChannelSender>();

export function registerChannelSender(channel: string, sender: ChannelSender): void {
  _senders.set(channel, sender);
}

export interface DeliverCronReplyOpts {
  reply: string;
  sessionId: string;
  channel: string;
  delivery?: {
    mode: "none" | "announce" | "webhook";
    webhookUrl?: string;
    webhookSecret?: string;
  };
}

/**
 * Deliver a cron job reply based on the job's delivery config.
 *
 * - mode "none"     — log only (default when delivery is absent)
 * - mode "announce" — send reply to the job's channel via the registered sender
 * - mode "webhook"  — HTTP POST the reply to delivery.webhookUrl
 */
export async function deliverCronReply(opts: DeliverCronReplyOpts): Promise<void> {
  const { reply, sessionId, channel, delivery } = opts;
  const mode = delivery?.mode ?? "none";

  if (mode === "none") {
    log.info("Cron reply (delivery=none)", { sessionId, channel, preview: reply.slice(0, 80) });
    return;
  }

  if (mode === "announce") {
    const sender = _senders.get(channel);
    if (sender === undefined) {
      log.warn("No channel sender registered for cron announce delivery", { channel, sessionId });
      return;
    }

    // Parse recipientId from sessionId — e.g. "tg:12345" → "12345"
    const colonIdx = sessionId.indexOf(":");
    const recipientId = colonIdx !== -1 ? sessionId.slice(colonIdx + 1) : sessionId;

    await sender(recipientId, reply);
    log.info("Cron reply delivered via announce", { channel, sessionId });
    return;
  }

  if (mode === "webhook") {
    const webhookUrl = delivery?.webhookUrl;
    if (!webhookUrl) {
      log.warn("Cron delivery mode is webhook but no webhookUrl configured", { sessionId, channel });
      return;
    }

    const payload = {
      reply,
      sessionId,
      channel,
      timestamp: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = { "Content-Type": "application/json" };

    const secret = delivery?.webhookSecret;
    if (secret) {
      const sig = createHmac("sha256", secret).update(body).digest("hex");
      headers["X-Sandra-Signature"] = `sha256=${sig}`;
    }

    try {
      const res = await fetch(webhookUrl, { method: "POST", headers, body });
      if (!res.ok) {
        log.warn("Cron webhook delivery returned non-2xx", {
          sessionId,
          channel,
          status: res.status,
          webhookUrl,
        });
      } else {
        log.info("Cron reply delivered via webhook", { channel, sessionId, status: res.status });
      }
    } catch (err) {
      log.error("Cron webhook delivery failed", {
        sessionId,
        channel,
        webhookUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
