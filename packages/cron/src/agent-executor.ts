import { handleMessage } from "@sandra/agent";
import type { CronJob } from "./scheduler.js";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("cron");

/**
 * Creates a JobExecutor that calls handleMessage for each cron job.
 * Returns the reply string from handleMessage.
 *
 * Note: the executor only runs handleMessage and logs the reply.
 * Delivering the reply via the channel adapter (Telegram/WhatsApp) is
 * a future enhancement — look up the user's channel and forward the reply.
 */
export function createAgentExecutor(): (job: CronJob) => Promise<string> {
  return async (job: CronJob): Promise<string> => {
    log.info("Executing cron job", { id: job.id, userId: job.userId, prompt: job.task.slice(0, 80) });

    const sessionId = job.sessionId;
    const response = await handleMessage({
      id: crypto.randomUUID(),
      text: job.task,
      userId: job.userId,
      sessionId,
      channel: job.channel as import("@sandra/core").Channel,
      locale: "en",
      timestamp: Date.now(),
    });

    log.info("Cron job completed", { id: job.id, reply: response.reply.slice(0, 80) });
    return response.reply;
  };
}
