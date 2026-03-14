import {
  Client,
  GatewayIntentBits,
  type Message,
  Events,
  Partials,
} from "discord.js";
import { createSubsystemLogger, db, auditLog } from "@sandra/utils";
import { handleMessage } from "@sandra/agent";

const log = createSubsystemLogger("discord");

let _client: Client | null = null;

async function upsertDiscordUser(discordId: string, username: string): Promise<{ id: string; status: string }> {
  // Use phone field with "dc:" prefix as discord identifier until schema is extended
  const phone = `dc:${discordId}`;
  const res = await db.query<{ id: string; status: string }>(
    `INSERT INTO users (phone, name, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, status`,
    [phone, username]
  );
  return res.rows[0]!;
}

async function handleDiscordMessage(msg: Message): Promise<void> {
  if (msg.author.bot) return;

  // Only DMs unless guilds are explicitly enabled
  const allowGuilds = process.env["DISCORD_ALLOW_GUILDS"] === "1";
  if (msg.guild && !allowGuilds) return;

  const text = msg.content.trim();
  if (!text) return;

  try {
    const user = await upsertDiscordUser(msg.author.id, msg.author.username);

    if (user.status !== "approved") {
      void auditLog({ action: "auth.failure", channel: "discord", details: { discordId: msg.author.id } });
      await msg.reply("You are not yet approved. Contact the administrator for access.");
      return;
    }

    const sessionId = `dc:${msg.author.id}`;

    // Show typing indicator
    if (msg.channel.isSendable()) {
      await msg.channel.sendTyping().catch(() => {/* ignore */});
    }

    void auditLog({ action: "message.received", userId: user.id, channel: "discord" });
    const response = await handleMessage({
      id: crypto.randomUUID(),
      text,
      userId: user.id,
      sessionId,
      channel: "discord",
      locale: "en",
      timestamp: Date.now(),
    });

    if (response.reply) {
      // Discord has a 2000-char limit per message
      const chunks = chunkText(response.reply, 1900);
      for (const chunk of chunks) {
        await msg.reply(chunk);
      }
    }
  } catch (err) {
    log.error("Error handling Discord message", {
      error: err instanceof Error ? err.message : String(err),
      userId: msg.author.id,
    });
    await msg.reply("Sorry, something went wrong. Please try again.").catch(() => {/* ignore */});
  }
}

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

export function createDiscordBot(token: string): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once(Events.ClientReady, (c) => {
    log.info("Discord bot ready", { tag: c.user.tag });
  });

  client.on(Events.MessageCreate, (msg) => {
    handleDiscordMessage(msg).catch((err) => {
      log.error("Unhandled Discord message error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  client.login(token);
  _client = client;
  return client;
}

export function getDiscordClient(): Client | null {
  return _client;
}

export async function sendDiscord(channelId: string, text: string): Promise<void> {
  if (!_client) throw new Error("Discord client not initialized");
  const channel = await _client.channels.fetch(channelId);
  if (!channel?.isSendable()) throw new Error("Channel is not sendable");
  const chunks = chunkText(text, 1900);
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}
