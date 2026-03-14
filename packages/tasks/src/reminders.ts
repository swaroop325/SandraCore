import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { SQS_MAX_DELAY_SECS } from "@sandra/core";
import { db, sqsClient } from "@sandra/utils";

export async function scheduleReminder(
  userId: string,
  taskId: string,
  triggerTime: Date
): Promise<void> {
  const reminderId = crypto.randomUUID();

  await db.execute(
    `INSERT INTO reminders (id, user_id, task_id, trigger_time) VALUES ($1, $2, $3, $4)`,
    [reminderId, userId, taskId, triggerTime]
  );

  const delaySecs = Math.max(
    0,
    Math.min(
      SQS_MAX_DELAY_SECS,
      Math.floor((triggerTime.getTime() - Date.now()) / 1000)
    )
  );

  const queueUrl = process.env["SQS_QUEUE_URL"];
  if (!queueUrl) {
    throw new Error("Missing SQS_QUEUE_URL environment variable.");
  }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ reminderId, userId, taskId }),
      DelaySeconds: delaySecs,
    })
  );
}
