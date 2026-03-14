import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { db, loadSecrets } from "@sandra/utils";
import { sendTelegram } from "@sandra/extensions-telegram";
import { initOtel, trace, metrics } from "@sandra/otel";
import { REGION } from "@sandra/core";

import { registerWorkerShutdown } from "./graceful-shutdown.js";

await loadSecrets();
initOtel("sandra-worker");
registerWorkerShutdown();

const sqs = new SQSClient({ region: REGION });

async function poll(): Promise<void> {
  const queueUrl = process.env["SQS_QUEUE_URL"]!;
  const res = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
    })
  );

  for (const msg of res.Messages ?? []) {
    try {
      const { reminderId, userId } = JSON.parse(msg.Body!) as {
        reminderId: string;
        userId: string;
      };

      await trace("reminder.deliver", async (span) => {
        span.setAttributes({ reminderId, userId });

        const row = await db.query<{
          id: string;
          title: string;
          telegram_id: number;
        }>(
          `SELECT r.id, t.title, u.telegram_id
           FROM reminders r
           JOIN tasks t ON t.id = r.task_id
           JOIN users u ON u.id = r.user_id
           WHERE r.id = $1 AND r.sent = false`,
          [reminderId]
        );

        if (row.rows.length > 0) {
          const record = row.rows[0]!;
          await sendTelegram(record.telegram_id, `Reminder: ${record.title}`);
          await db.execute(`UPDATE reminders SET sent = true WHERE id = $1`, [
            record.id,
          ]);
          metrics.reminderCount.add(1);
        }
      });
    } catch (err) {
      console.error("Failed to process reminder:", err);
    } finally {
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: msg.ReceiptHandle!,
        })
      );
    }
  }
}

const sqsUrl = process.env["SQS_QUEUE_URL"] ?? "";
if (!sqsUrl || sqsUrl.includes("YOUR_ACCOUNT")) {
  console.warn("[worker] SQS_QUEUE_URL not configured — reminder worker idle (set a real queue URL to enable)");
  // Keep process alive without triggering the "unsettled top-level await" warning
  setInterval(() => { /* keep-alive */ }, 2 ** 30);
  process.exitCode = 0;
}

while (true) {
  await poll().catch((err) => {
    console.error("[worker] poll error:", err instanceof Error ? err.message : err);
  });
  // Brief backoff to avoid tight error loops
  await new Promise(resolve => setTimeout(resolve, 1000));
}
