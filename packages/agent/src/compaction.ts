import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrock } from "./bedrock-client.js";
import { MODELS, BEDROCK_VERSION } from "@sandra/core";
import { isOverBudget, trimToFit, estimateMessagesTokens, getBudget } from "./token-counter.js";
import type { Message } from "@sandra/memory";

// Keep the most recent N messages verbatim — never summarize these
const PRESERVE_RECENT = 10;

async function generateSummary(messages: Message[]): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const body = {
    anthropic_version: BEDROCK_VERSION,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Summarize the following conversation into a concise paragraph capturing key facts, decisions, tasks, and context. Be specific — preserve names, dates, and numbers.\n\n${transcript}`,
      },
    ],
  };

  const cmd = new InvokeModelCommand({
    modelId: MODELS.SONNET,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const res = await bedrock.send(cmd);
  const output = JSON.parse(Buffer.from(res.body).toString());
  return output.content[0].text as string;
}

/**
 * If the message history exceeds the model's context budget, summarize the
 * oldest messages and replace them with a single summary turn.
 *
 * Returns the (possibly compacted) messages array.
 */
export async function compactIfNeeded(
  messages: Message[],
  modelId: string
): Promise<Message[]> {
  if (!isOverBudget(messages, modelId)) return messages;
  if (messages.length <= PRESERVE_RECENT) {
    // Can't compact further — just trim hard
    return trimToFit(messages, modelId);
  }

  // Split: summarize old, keep recent verbatim
  const oldMessages = messages.slice(0, messages.length - PRESERVE_RECENT);
  const recentMessages = messages.slice(messages.length - PRESERVE_RECENT);

  if (oldMessages.length === 0) return recentMessages;

  try {
    const summary = await generateSummary(oldMessages);
    const summaryMessage: Message = {
      role: "assistant",
      content: `[Context summary from earlier in this conversation]\n${summary}`,
    };
    return [summaryMessage, ...recentMessages];
  } catch {
    // Summarization failed — fall back to hard trim
    return trimToFit(messages, modelId);
  }
}
