import {
  SQSClient,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { REGION } from "@sandra/core";

export const sqsClient = new SQSClient({ region: REGION });

export async function checkSQS(): Promise<boolean> {
  try {
    const url = process.env["SQS_QUEUE_URL"];
    if (!url) return false;
    await sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: url,
        AttributeNames: ["ApproximateNumberOfMessages"],
      })
    );
    return true;
  } catch {
    return false;
  }
}
