import { handleMessage } from "@sandra/agent";
import type { CronJob } from "./scheduler.js";
import { createSubsystemLogger } from "@sandra/utils";
import { deliverCronReply } from "./delivery.js";

const log = createSubsystemLogger("cron");

/**
 * Creates a JobExecutor that calls handleMessage for each cron job,
 * then delivers the reply according to the job's delivery configuration.
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

    await deliverCronReply({
      reply: response.reply,
      sessionId,
      channel: job.channel,
      ...(job.delivery
        ? {
            delivery: {
              mode: job.delivery.mode,
              ...(job.delivery.webhookUrl !== undefined ? { webhookUrl: job.delivery.webhookUrl } : {}),
              ...(job.delivery.webhookSecret !== undefined ? { webhookSecret: job.delivery.webhookSecret } : {}),
            },
          }
        : {}),
    });

    return response.reply;
  };
}
