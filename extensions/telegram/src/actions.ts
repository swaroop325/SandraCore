import { Bot } from "grammy";

/** Pin a message in a chat. Returns true on success, false on error. */
export async function pinMessage(
  bot: Bot,
  chatId: number | string,
  messageId: number
): Promise<boolean> {
  try {
    await bot.api.pinChatMessage(chatId, messageId);
    return true;
  } catch {
    return false;
  }
}

/** Unpin a message. If messageId is omitted, unpins the most recent pinned message. */
export async function unpinMessage(
  bot: Bot,
  chatId: number | string,
  messageId?: number
): Promise<boolean> {
  try {
    await bot.api.unpinChatMessage(chatId, messageId);
    return true;
  } catch {
    return false;
  }
}

/** Edit the text of an existing message. Returns true on success, false on error. */
export async function editMessage(
  bot: Bot,
  chatId: number | string,
  messageId: number,
  newText: string
): Promise<boolean> {
  try {
    await bot.api.editMessageText(chatId, messageId, newText);
    return true;
  } catch {
    return false;
  }
}

/** Delete a message. Returns true on success, false on error. */
export async function deleteMessage(
  bot: Bot,
  chatId: number | string,
  messageId: number
): Promise<boolean> {
  try {
    await bot.api.deleteMessage(chatId, messageId);
    return true;
  } catch {
    return false;
  }
}

/** Get the number of members in a chat. Returns null on error. */
export async function getChatMemberCount(
  bot: Bot,
  chatId: number | string
): Promise<number | null> {
  try {
    const count = await bot.api.getChatMemberCount(chatId);
    return count;
  } catch {
    return null;
  }
}

/**
 * Ban a user from a chat (requires admin privileges).
 * @param untilDate Unix timestamp when the ban is lifted (0 or undefined = permanent)
 */
export async function banUser(
  bot: Bot,
  chatId: number | string,
  userId: number,
  untilDate?: number
): Promise<boolean> {
  try {
    const extra: Record<string, unknown> = {};
    if (untilDate !== undefined) {
      extra["until_date"] = untilDate;
    }
    await bot.api.banChatMember(
      chatId,
      userId,
      extra as Parameters<typeof bot.api.banChatMember>[2]
    );
    return true;
  } catch {
    return false;
  }
}
