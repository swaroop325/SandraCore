import { classifyMessage, selectModel } from "./intent.js";
export { spawnSubagent } from "./spawn.js";
export type { SpawnInput, SpawnResult } from "./spawn.js";
export { createOllamaProvider, createOpenAICompatProvider, registerProvider, getProviderForModel, listProviders, autoRegisterProviders, _resetProviders } from "./llm-provider.js";
export type { LLMProvider, LLMMessage, LLMRequest, LLMResponse } from "./llm-provider.js";
export { reasonWithProvider } from "./multi-reason.js";
import { reason } from "./reason.js";
import { compactIfNeeded } from "./compaction.js";
import { research } from "@sandra/research";
import { createTask } from "@sandra/tasks";
import { loadHistory, appendMessage, recallMemory, writeMemory } from "@sandra/memory";
import { trace, metrics } from "@sandra/otel";
import type { AssistantInput, AssistantOutput } from "@sandra/core";

export async function handleMessage(input: AssistantInput): Promise<AssistantOutput> {
  return trace("handleMessage", async (span) => {
    const { text, userId, sessionId } = input;
    span.setAttributes({ userId, sessionId, channel: input.channel });

    const startMs = Date.now();
    let intent: string | undefined;

    try {
      const [history, memories] = await trace("memory.load", async () =>
        Promise.all([
          loadHistory(sessionId),
          recallMemory(userId, text),
        ])
      );

      await appendMessage(sessionId, userId, "user", text);

      const classified = await trace("intent.classify", async () =>
        classifyMessage(text)
      );
      intent = classified.intent;
      const { complexity } = classified;
      const modelId = selectModel(complexity);
      span.setAttributes({ intent, complexity, modelId });

      const compactedHistory = await compactIfNeeded(history, modelId);

      let reply: string;

      reply = await trace("agent.respond", async () => {
        if (intent === "research") {
          return research(text);
        } else if (intent === "task_create") {
          return createTask(text, userId);
        } else {
          return reason(compactedHistory, text, memories, modelId);
        }
      });

      await Promise.all([
        appendMessage(sessionId, userId, "assistant", reply),
        writeMemory(userId, text),
      ]);

      metrics.messageCount.add(1, { intent, channel: input.channel });
      metrics.messageLatency.record(Date.now() - startMs, { intent });

      return { reply, intent };
    } catch (err: unknown) {
      metrics.errorCount.add(1, { intent: intent ?? "unknown" });
      throw err;
    }
  });
}
