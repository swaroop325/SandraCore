import type { Bot } from "grammy";

let _bot: Bot | null = null;

export function registerBot(bot: Bot): void {
  _bot = bot;
}

export async function sendTelegram(telegramId: number, message: string): Promise<void> {
  if (!_bot) throw new Error("Bot not registered");
  await _bot.api.sendMessage(telegramId, message);
}
