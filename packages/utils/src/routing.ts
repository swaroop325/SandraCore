/**
 * Group message routing — determines if a message in a group chat
 * should be processed by the agent (mention gating).
 */

export interface RoutingContext {
  text: string;
  channel: string;
  isGroup: boolean;
  botName?: string;
  /** Bot user IDs / mentions to check against */
  botIds?: string[];
}

export interface RoutingDecision {
  shouldProcess: boolean;
  cleanText: string; // text with bot mention stripped
  reason: string;
}

/**
 * Decide whether to process a message in a group chat.
 * DMs always process. Group chats require @mention of bot.
 */
export function routeMessage(ctx: RoutingContext): RoutingDecision {
  const { text, isGroup, botName, botIds = [] } = ctx;

  if (!isGroup) {
    return { shouldProcess: true, cleanText: text, reason: "dm" };
  }

  const name = botName ?? "Sandra";
  // Escape any regex special characters in the bot name to prevent ReDoS
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Check text-based mention
  const mentionPatterns = [
    new RegExp(`@${escapedName}\\b`, "i"),
    new RegExp(`\\b${escapedName}\\b`, "i"),
    /@here\b/i,
  ];

  const hasMention = mentionPatterns.some((p) => p.test(text)) ||
    botIds.some((id) => text.includes(id));

  if (!hasMention) {
    return { shouldProcess: false, cleanText: text, reason: "no_mention" };
  }

  // Strip the mention from the text
  const cleanText = text
    .replace(new RegExp(`<@[^>]+>`, "g"), "")
    .replace(new RegExp(`@${escapedName}\\b`, "gi"), "")
    .replace(/@here\b/gi, "")
    .trim();

  return { shouldProcess: true, cleanText: cleanText || text, reason: "mentioned" };
}

/** Extract channel-specific message limits */
export function getChannelMessageLimit(channel: string): number {
  const limits: Record<string, number> = {
    telegram: 4096,
    whatsapp: 65536,
    discord: 2000,
    msteams: 28000,
    web: 8192,
    api: 4096,
  };
  return limits[channel] ?? 4096;
}
