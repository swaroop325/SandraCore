import type { Context } from "grammy";

const TYPING_INTERVAL_MS = 4_500; // Telegram typing lasts ~5s, refresh at 4.5s

/**
 * Show typing indicator while an async operation runs.
 * Automatically refreshes every 4.5 seconds.
 */
export async function withTyping<T>(
  ctx: Context,
  fn: () => Promise<T>
): Promise<T> {
  let stopped = false;

  async function keepTyping(): Promise<void> {
    while (!stopped) {
      try {
        await ctx.replyWithChatAction("typing");
      } catch {
        // Bot may have been blocked or chat deleted — ignore
      }
      await new Promise((r) => setTimeout(r, TYPING_INTERVAL_MS));
    }
  }

  const typingLoop = keepTyping();
  try {
    const result = await fn();
    return result;
  } finally {
    stopped = true;
    await typingLoop.catch(() => {});
  }
}
