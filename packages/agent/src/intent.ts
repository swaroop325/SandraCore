import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { Classification, Complexity } from "@sandra/core";
import { MODELS, BEDROCK_VERSION } from "@sandra/core";
import { bedrock } from "./bedrock-client.js";

export async function classifyMessage(message: string): Promise<Classification> {
  const body = JSON.stringify({
    anthropic_version: BEDROCK_VERSION,
    max_tokens: 128,
    messages: [
      {
        role: "user",
        content: `Classify this message. Respond ONLY with valid JSON, no other text.\n\nMessage: "${message}"\n\nJSON format: {"intent": "task_create|research|code_generate|recall|conversation", "complexity": "simple|complex|deep"}`,
      },
    ],
  });

  try {
    const res = await bedrock.send(
      new InvokeModelCommand({
        modelId: MODELS.HAIKU,
        contentType: "application/json",
        accept: "application/json",
        body,
      })
    );

    const outer = JSON.parse(Buffer.from(res.body).toString());
    const classification: Classification = JSON.parse(outer.content[0].text);
    return classification;
  } catch {
    return { intent: "conversation", complexity: "simple" };
  }
}

export function selectModel(complexity: Complexity): string {
  switch (complexity) {
    case "simple":
      return MODELS.HAIKU;
    case "complex":
      return MODELS.SONNET;
    case "deep":
      return MODELS.OPUS;
  }
}
