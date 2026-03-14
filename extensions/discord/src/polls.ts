import { Client } from "discord.js";

export interface DiscordPollOptions {
  question: string;
  answers: string[];
  duration?: number;         // hours, default 24
  allowMultiselect?: boolean;
}

export interface DiscordPollResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Number emoji reactions for fallback reaction-based polls (up to 10 options)
const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

export async function sendDiscordPoll(
  client: Client,
  channelId: string,
  options: DiscordPollOptions
): Promise<DiscordPollResult> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isSendable()) {
      return { success: false, error: "Channel not found or not sendable" };
    }

    const duration = options.duration ?? 24;
    const allowMultiselect = options.allowMultiselect ?? false;

    // Attempt native Discord poll API (requires discord.js v14.16+ with API v10 poll support)
    try {
      const msg = await channel.send({
        poll: {
          question: { text: options.question },
          answers: options.answers.map((a) => ({ text: a })),
          duration,
          allowMultiselect,
        },
      });
      return { success: true, messageId: msg.id };
    } catch {
      // Fallback: reaction-based poll
      const lines = options.answers
        .slice(0, NUMBER_EMOJIS.length)
        .map((answer, i) => `${NUMBER_EMOJIS[i]} ${answer}`);

      const content = `**${options.question}**\n${lines.join("\n")}`;
      const msg = await channel.send(content);

      // Add reactions sequentially
      for (let i = 0; i < Math.min(options.answers.length, NUMBER_EMOJIS.length); i++) {
        await msg.react(NUMBER_EMOJIS[i]!);
      }

      return { success: true, messageId: msg.id };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
