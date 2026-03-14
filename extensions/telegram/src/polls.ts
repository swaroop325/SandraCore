import { Bot } from "grammy";

export interface TelegramPollOptions {
  question: string;
  options: string[];           // 2-10 options
  isAnonymous?: boolean;       // default true
  type?: "regular" | "quiz";  // default "regular"
  allowsMultipleAnswers?: boolean;
  openPeriod?: number;         // seconds (5-600)
  correctOptionId?: number;    // for quiz type
}

export interface TelegramPollResult {
  success: boolean;
  pollId?: string;
  error?: string;
}

export async function sendPoll(
  bot: Bot,
  chatId: number | string,
  options: TelegramPollOptions
): Promise<TelegramPollResult> {
  try {
    const extra: Record<string, unknown> = {};

    if (options.isAnonymous !== undefined) {
      extra["is_anonymous"] = options.isAnonymous;
    }
    if (options.type !== undefined) {
      extra["type"] = options.type;
    }
    if (options.allowsMultipleAnswers !== undefined) {
      extra["allows_multiple_answers"] = options.allowsMultipleAnswers;
    }
    if (options.openPeriod !== undefined) {
      extra["open_period"] = options.openPeriod;
    }
    if (options.correctOptionId !== undefined) {
      extra["correct_option_id"] = options.correctOptionId;
    }

    const result = await bot.api.sendPoll(
      chatId,
      options.question,
      options.options,
      extra as Parameters<typeof bot.api.sendPoll>[3]
    );

    return { success: true, pollId: result.poll.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
