import { sendSlack } from "./send.js";

export interface SlackActionResult {
  ok: boolean;
  error?: string;
}

async function slackPost(
  token: string,
  endpoint: string,
  body: Record<string, string>
): Promise<SlackActionResult> {
  try {
    const response = await fetch(`https://slack.com/api/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as { ok: boolean; error?: string };
    if (data.ok) {
      return { ok: true };
    }
    return { ok: false, ...(data.error !== undefined ? { error: data.error } : {}) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}

/** Pin a message in a Slack channel. */
export async function pinSlackMessage(
  token: string,
  channel: string,
  timestamp: string
): Promise<SlackActionResult> {
  return slackPost(token, "pins.add", { channel, timestamp });
}

/** Delete a message from a Slack channel. */
export async function deleteSlackMessage(
  token: string,
  channel: string,
  timestamp: string
): Promise<SlackActionResult> {
  return slackPost(token, "chat.delete", { channel, ts: timestamp });
}

/** Add a reaction to a Slack message. */
export async function addSlackReaction(
  token: string,
  channel: string,
  timestamp: string,
  name: string
): Promise<SlackActionResult> {
  return slackPost(token, "reactions.add", { channel, timestamp, name });
}

/**
 * Send a text message (and optional Block Kit blocks) to a Slack channel.
 * When blocks are provided they are sent in a single call (not chunked).
 * Without blocks, delegates to sendSlack which chunks at 3000 chars.
 */
export async function sendSlackMessage(
  channelId: string,
  text: string,
  options?: { blocks?: unknown[] }
): Promise<void> {
  if (options?.blocks && options.blocks.length > 0) {
    // Lazy import to avoid circular dependency at startup
    const { getSlackApp } = await import("./index.js");
    const slackApp = getSlackApp();
    if (!slackApp) throw new Error("Slack app not initialized");
    await slackApp.client.chat.postMessage({
      channel: channelId,
      text,
      blocks: options.blocks as Exclude<NonNullable<Parameters<
        typeof slackApp.client.chat.postMessage
      >[0]>["blocks"], undefined>,
    });
  } else {
    await sendSlack(channelId, text);
  }
}

/**
 * Reply to an existing message in a Slack thread.
 * threadTs is the `ts` of the parent message to reply to.
 */
export async function sendSlackReply(
  threadTs: string,
  channelId: string,
  text: string
): Promise<void> {
  const { getSlackApp } = await import("./index.js");
  const slackApp = getSlackApp();
  if (!slackApp) throw new Error("Slack app not initialized");

  // Slack limit is ~4000 chars; chunk at 3000 chars
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + 3000));
    i += 3000;
  }

  for (const chunk of chunks) {
    await slackApp.client.chat.postMessage({
      channel: channelId,
      text: chunk,
      thread_ts: threadTs,
    });
  }
}
