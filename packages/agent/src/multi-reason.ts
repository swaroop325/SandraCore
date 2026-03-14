import { getProviderForModel } from "./llm-provider.js";
import { reason as bedrockReason } from "./reason.js";
import type { Message } from "@sandra/memory";

/**
 * Like reason(), but routes to an alternative provider if one is registered
 * for the given modelId. Falls back to Bedrock if no alternative provider found.
 */
export async function reasonWithProvider(
  history: Message[],
  userText: string,
  memories: string[],
  modelId: string,
  systemPrompt?: string
): Promise<string> {
  const provider = getProviderForModel(modelId);

  if (!provider) {
    // Fall back to Bedrock
    return bedrockReason(history, userText, memories, modelId);
  }

  const messages = [
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userText },
  ];

  const systemMessages = memories.length > 0
    ? [{ role: "system" as const, content: `Relevant context:\n${memories.join("\n")}` }]
    : [];

  const response = await provider.complete({
    model: modelId,
    messages: [...systemMessages, ...messages],
    maxTokens: 2048,
  });

  return response.text;
}
