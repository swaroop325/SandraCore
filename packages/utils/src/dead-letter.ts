import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createSubsystemLogger } from "./logger.js";
import { REGION } from "@sandra/core";

const log = createSubsystemLogger("worker");
const sqs = new SQSClient({ region: REGION });

export interface DeadLetterPayload {
  originalBody: string;
  errorMessage: string;
  failedAt: string;
  attempts: number;
}

/**
 * Send a failed message to the dead-letter queue.
 * Falls back to logging if DLQ_URL is not set.
 */
export async function sendToDeadLetter(
  originalBody: string,
  error: unknown,
  attempts = 1
): Promise<void> {
  const dlqUrl = process.env["DLQ_URL"];
  const errorMessage = error instanceof Error ? error.message : String(error);

  const payload: DeadLetterPayload = {
    originalBody,
    errorMessage,
    failedAt: new Date().toISOString(),
    attempts,
  };

  if (!dlqUrl) {
    log.warn("DLQ_URL not set — dead letter dropped to logs", { payload });
    return;
  }

  try {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: dlqUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
    log.info("Message sent to DLQ", { errorMessage, attempts });
  } catch (sendErr) {
    log.error("Failed to send to DLQ — message lost", {
      originalError: errorMessage,
      dlqError: sendErr instanceof Error ? sendErr.message : String(sendErr),
    });
  }
}
