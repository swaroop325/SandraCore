import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { REGION, MODELS, BEDROCK_VERSION } from "@sandra/core";
import { createSubsystemLogger } from "@sandra/utils";
import { getSoul } from "./soul.js";

const log = createSubsystemLogger("agent");

export interface SpawnInput {
  /** Task description for the subagent */
  task: string;
  /** Optional context/background to give the subagent */
  context?: string;
  /** Max tokens for response. Default 2048 */
  maxTokens?: number;
  /** Model to use. Defaults to Sonnet */
  modelId?: string;
}

export interface SpawnResult {
  output: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const client = new BedrockRuntimeClient({ region: REGION });

/**
 * Spawn an isolated subagent to handle a focused subtask.
 * The subagent has its own context window — it doesn't inherit conversation history.
 * Use for: research, data extraction, summarization, code generation.
 */
export async function spawnSubagent(input: SpawnInput): Promise<SpawnResult> {
  const { task, context, maxTokens = 2048, modelId = MODELS.SONNET } = input;

  const soul = getSoul();
  const systemPrompt = [
    soul,
    "",
    "## Subagent Mode",
    "You are running as a focused subagent. Complete the specific task given to you.",
    "Return only the result — no preamble, no meta-commentary.",
  ].join("\n");

  const userContent = context
    ? `Context:\n${context}\n\nTask:\n${task}`
    : task;

  log.debug("Spawning subagent", { modelId, taskPreview: task.slice(0, 100) });

  const body = {
    anthropic_version: BEDROCK_VERSION,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  };

  const response = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    })
  );

  const result = JSON.parse(Buffer.from(response.body).toString("utf-8")) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };

  const output = result.content.find((c) => c.type === "text")?.text ?? "";

  return {
    output,
    model: result.model ?? modelId,
    inputTokens: result.usage?.input_tokens ?? 0,
    outputTokens: result.usage?.output_tokens ?? 0,
  };
}
