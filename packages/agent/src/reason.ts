import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { Message } from "@sandra/memory";
import { BEDROCK_VERSION } from "@sandra/core";
import { getSoul } from "./soul.js";
import { bedrock } from "./bedrock-client.js";

export async function reason(
  history: Message[],
  userMessage: string,
  memories: string[],
  modelId: string
): Promise<string> {
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

  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body,
    })
  );

  return JSON.parse(Buffer.from(res.body).toString()).content[0].text as string;
}
