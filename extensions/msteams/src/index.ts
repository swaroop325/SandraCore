import { createSubsystemLogger, db } from "@sandra/utils";
import { handleMessage } from "@sandra/agent";

const log = createSubsystemLogger("msteams");

interface BotActivity {
  type: string;
  id: string;
  text?: string;
  from: { id: string; name?: string };
  conversation: { id: string; isGroup?: boolean };
  channelId: string;
  serviceUrl: string;
  replyToId?: string;
}

async function upsertTeamsUser(teamsId: string, name: string): Promise<{ id: string; status: string }> {
  const phone = `teams:${teamsId}`;
  const res = await db.query<{ id: string; status: string }>(
    `INSERT INTO users (phone, name, status) VALUES ($1, $2, 'pending')
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, status`,
    [phone, name]
  );
  return res.rows[0]!;
}

async function sendTeamsReply(serviceUrl: string, activity: BotActivity, text: string): Promise<void> {
  const appId = process.env["TEAMS_APP_ID"] ?? "";
  const appPassword = process.env["TEAMS_APP_PASSWORD"] ?? "";

  // Get Bot Framework token
  const tokenRes = await fetch("https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: appPassword,
      scope: "https://api.botframework.com/.default",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token fetch failed: ${tokenRes.status}`);
  const { access_token } = await tokenRes.json() as { access_token: string };

  const replyUrl = `${serviceUrl}/v3/conversations/${activity.conversation.id}/activities`;
  await fetch(replyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      type: "message",
      text,
      replyToId: activity.id,
    }),
  });
}

/**
 * Handle an incoming Bot Framework activity (call from your API route).
 * Mount this on POST /webhooks/teams in your API server.
 */
export async function handleTeamsActivity(activity: BotActivity): Promise<void> {
  if (activity.type !== "message") return;
  const text = activity.text?.trim();
  if (!text) return;

  // Skip group messages unless bot is mentioned
  if (activity.conversation.isGroup) {
    const botName = process.env["TEAMS_BOT_NAME"] ?? "Sandra";
    if (!text.includes(`@${botName}`) && !text.includes("<at>")) return;
  }

  const user = await upsertTeamsUser(activity.from.id, activity.from.name ?? "Unknown");
  if (user.status !== "approved") {
    await sendTeamsReply(activity.serviceUrl, activity, "You are not yet approved for Sandra. Contact your administrator.");
    return;
  }

  const sessionId = `teams:${activity.from.id}`;
  const response = await handleMessage({
    id: activity.id,
    text,
    userId: user.id,
    sessionId,
    channel: "msteams",
    locale: "en",
    timestamp: Date.now(),
  });

  await sendTeamsReply(activity.serviceUrl, activity, response.reply);
  log.info("Teams message handled", { userId: user.id, sessionId });
}

export type { BotActivity };
