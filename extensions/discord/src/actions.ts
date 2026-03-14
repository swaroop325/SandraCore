import { Client, type GuildMember } from "discord.js";

/** Pin a message in a channel. Returns true on success, false on error. */
export async function pinDiscordMessage(
  client: Client,
  channelId: string,
  messageId: string
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("messages" in channel)) return false;
    const msg = await (channel as { messages: { fetch: (id: string) => Promise<{ pin: () => Promise<unknown> }> } }).messages.fetch(messageId);
    await msg.pin();
    return true;
  } catch {
    return false;
  }
}

/** Delete a message in a channel. Returns true on success, false on error. */
export async function deleteDiscordMessage(
  client: Client,
  channelId: string,
  messageId: string
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("messages" in channel)) return false;
    const msg = await (channel as { messages: { fetch: (id: string) => Promise<{ delete: () => Promise<unknown> }> } }).messages.fetch(messageId);
    await msg.delete();
    return true;
  } catch {
    return false;
  }
}

/** Kick a member from a guild. Returns true on success, false on error. */
export async function kickMember(
  client: Client,
  guildId: string,
  userId: string,
  reason?: string
): Promise<boolean> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId) as GuildMember;
    const kickOptions: Parameters<GuildMember["kick"]>[0] = reason !== undefined ? reason : undefined;
    await member.kick(kickOptions);
    return true;
  } catch {
    return false;
  }
}

/** Ban a member from a guild. Returns true on success, false on error. */
export async function banMember(
  client: Client,
  guildId: string,
  userId: string,
  reason?: string,
  deleteMessageDays?: number
): Promise<boolean> {
  try {
    const guild = await client.guilds.fetch(guildId);
    const banOptions: { reason?: string; deleteMessageDays?: number } = {};
    if (reason !== undefined) banOptions.reason = reason;
    if (deleteMessageDays !== undefined) banOptions.deleteMessageDays = deleteMessageDays;
    await guild.members.ban(userId, banOptions);
    return true;
  } catch {
    return false;
  }
}

/** Send a text message to a channel. Returns true on success, false on error. */
export async function sendToChannel(
  client: Client,
  channelId: string,
  text: string
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) return false;
    await channel.send(text);
    return true;
  } catch {
    return false;
  }
}
