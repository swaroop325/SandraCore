import { InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import type { Message } from "@sandra/memory";
import { BEDROCK_VERSION } from "@sandra/core";
import { getSoul } from "./soul.js";
import { bedrock } from "./bedrock-client.js";

/**
 * Like reason(), but returns an AsyncGenerator yielding text chunks
 * as they arrive from Bedrock streaming.
 *
 * The generator yields string chunks. The final accumulated text is
 * available by concatenating all chunks.
 */
export async function* streamReason(
  history: Message[],
  userMessage: string,
  memories: string[],
  modelId: string
): AsyncGenerator<string, void, unknown> {
  let systemPrompt = getSoul();

  if (memories.length > 0) {
    systemPrompt += `\n\nRelevant context from memory:\n- ${memories.join("\n- ")}`;
  }

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const body = JSON.stringify({
    anthropic_version: BEDROCK_VERSION,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  try {
    const res = await bedrock.send(
      new InvokeModelWithResponseStreamCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
      })
    );

    const decoder = new TextDecoder();

    for await (const chunk of res.body ?? []) {
      if (!chunk?.chunk?.bytes) continue;
      const event = JSON.parse(decoder.decode(chunk.chunk.bytes)) as {
        type: string;
        delta?: { type?: string; text?: string };
      };

      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "text_delta" &&
        typeof event.delta.text === "string"
      ) {
        yield event.delta.text;
      }
    }
  } catch (err) {
    throw err;
  }
}
