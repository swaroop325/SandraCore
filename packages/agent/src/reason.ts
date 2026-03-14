import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import type { Message } from "@sandra/memory";
import { BEDROCK_VERSION } from "@sandra/core";
import { getSoul } from "./soul.js";
import { bedrock } from "./bedrock-client.js";
import { TOOL_DEFINITIONS } from "./tool-registry.js";

function getAvailableTools() {
  return TOOL_DEFINITIONS.filter((t) => {
    if (t.name === "web_search" && !process.env["PERPLEXITY_API_KEY"]) return false;
    if (t.name === "browser" && process.env["CHROME_PORT"] === "0") return false;
    return true;
  });
}
import { executeTool } from "./tool-executor.js";
import { detectToolLoop, hashToolInput } from "./tool-loop-detection.js";
import type { ToolInvocation } from "./tool-loop-detection.js";

/** Maximum tool-call rounds before forcing a final text-only response. */
const MAX_TOOL_TURNS = 5;

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type ContentBlock = TextBlock | ToolUseBlock;

interface ModelResponse {
  stop_reason: string;
  content: ContentBlock[];
}

/** Extract the first text block from a content array, or empty string if none. */
function extractText(content: ContentBlock[]): string {
  const block = content.find((b): b is TextBlock => b.type === "text");
  return block?.text ?? "";
}

type ConversationRole = "user" | "assistant";

interface ConversationMessage {
  role: ConversationRole;
  content: unknown;
}

export async function reason(
  history: Message[],
  userMessage: string,
  memories: string[],
  modelId: string,
  userId?: string
): Promise<string> {
  let systemPrompt = getSoul();

  if (memories.length > 0) {
    systemPrompt += `\n\nRelevant context from memory:\n- ${memories.join("\n- ")}`;
  }

  const messages: ConversationMessage[] = [
    ...history.map((m) => ({ role: m.role as ConversationRole, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  let turnsUsed = 0;
  const invocationHistory: ToolInvocation[] = [];

  while (turnsUsed < MAX_TOOL_TURNS) {
    const body = JSON.stringify({
      anthropic_version: BEDROCK_VERSION,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: getAvailableTools(),
      tool_choice: { type: "auto" },
    });

    const res = await bedrock.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
      })
    );

    const parsed = JSON.parse(Buffer.from(res.body).toString()) as ModelResponse;
    const { stop_reason, content } = parsed;

    if (stop_reason === "end_turn") {
      return extractText(content);
    }

    if (stop_reason === "tool_use") {
      // Append the assistant's full response (including tool_use blocks) to history.
      messages.push({ role: "assistant", content });

      // Collect all tool_use blocks and execute them.
      const toolUseBlocks = content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      // Push new invocations to history and check for loops before executing.
      // Only ping_pong is acted on here — generic_repeat and circuit_breaker are
      // subsumed by the MAX_TOOL_TURNS budget which is the authoritative limit for
      // simple repetition patterns.
      for (const block of toolUseBlocks) {
        invocationHistory.push({ name: block.name, inputHash: hashToolInput(block.input) });
      }
      const loopCheck = detectToolLoop(invocationHistory);
      if (loopCheck.detected && loopCheck.kind === "ping_pong") {
        const loopNote = `[Loop detected (${loopCheck.kind}): ${loopCheck.message ?? "repetitive tool calls"} — stopping tool loop early.]`;
        messages.push({ role: "assistant", content: [{ type: "text", text: loopNote }] });
        return loopNote;
      }

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const result = await executeTool(
            block.name,
            block.input,
            userId ?? ""
          );
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result,
          };
        })
      );

      // Append all tool results as a single user message.
      messages.push({ role: "user", content: toolResults });

      turnsUsed += 1;
      continue;
    }

    // Any other stop_reason (e.g. "max_tokens") — return whatever text is present.
    return extractText(content);
  }

  // MAX_TOOL_TURNS reached — make one final call without tools to force a text response.
  const finalBody = JSON.stringify({
    anthropic_version: BEDROCK_VERSION,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const finalRes = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: finalBody,
    })
  );

  const finalParsed = JSON.parse(
    Buffer.from(finalRes.body).toString()
  ) as ModelResponse;

  return extractText(finalParsed.content);
}
