import { classifyMessage, selectModel } from "./intent.js";
import { reason } from "./reason.js";
import { compactIfNeeded } from "./compaction.js";
import { buildUrlContext } from "./url-context.js";
import { research } from "@sandra/research";
import { createTask } from "@sandra/tasks";
import { loadHistory, appendMessage, recallMemory, writeMemory } from "@sandra/memory";
import { trace, metrics } from "@sandra/otel";
import { getUserModelOverride } from "@sandra/utils";
import type { AssistantInput, AssistantOutput } from "@sandra/core";
import { hookRegistry } from "./hooks.js";

export { streamReason } from "./stream-reason.js";
export { spawnSubagent } from "./spawn.js";
export type { SpawnInput, SpawnResult } from "./spawn.js";
export { createOllamaProvider, createOpenAICompatProvider, registerProvider, getProviderForModel, listProviders, autoRegisterProviders, _resetProviders } from "./llm-provider.js";
export type { LLMProvider, LLMMessage, LLMRequest, LLMResponse } from "./llm-provider.js";
export { reasonWithProvider } from "./multi-reason.js";
export { buildUrlContext } from "./url-context.js";
export { createDebouncer } from "./debounce.js";
export { TOOL_DEFINITIONS, TOOL_NAMES } from "./tool-registry.js";
export type { ToolDefinition, ToolName } from "./tool-registry.js";
export { executeTool } from "./tool-executor.js";
export { hookRegistry, createHookRegistry } from "./hooks.js";
export type { Hook, HookPhase, BeforeMessageHook, AfterMessageHook, OnErrorHook, HookRegistry, LifecycleHook, LifecycleEvent } from "./hooks.js";
export { setHandleMessage } from "./tool-executor.js";
export { callAgent } from "./acp.js";
export type { AcpRequest, AcpResponse } from "./acp.js";
export { runAgentsInParallel, runAgentsSequentially } from "./multi-agent.js";
export type { AgentTask } from "./multi-agent.js";

export async function handleMessage(input: AssistantInput): Promise<AssistantOutput> {
  return trace("handleMessage", async (span) => {
    const processedInput = await hookRegistry.runBefore(input);
    const { text, userId, sessionId } = processedInput;
    span.setAttributes({ userId, sessionId, channel: processedInput.channel });

    const startMs = Date.now();
    let intent: string | undefined;

    try {
      // Load history, memories, model override, and URL context in parallel
      const [history, memories, modelOverride, urlContext] = await trace("memory.load", async () =>
        Promise.all([
          loadHistory(sessionId, userId),
          recallMemory(userId, text),
          getUserModelOverride(userId),
          buildUrlContext(text),
        ])
      );

      // Inject URL context into message text when a URL was detected
      const enrichedText = urlContext ? `${urlContext}\n\n${text}` : text;

      await appendMessage(sessionId, userId, "user", text);

      const classified = await trace("intent.classify", async () =>
        classifyMessage(text)
      );
      intent = classified.intent;
      const { complexity } = classified;
      // Per-user model override takes priority over complexity-based selection
      const modelId = modelOverride ?? selectModel(complexity);
      span.setAttributes({ intent, complexity, modelId });

      const compactedHistory = await compactIfNeeded(history, modelId);

      let reply: string;

      reply = await trace("agent.respond", async () => {
        if (intent === "research") {
          return research(enrichedText);
        } else if (intent === "task_create") {
          return createTask(enrichedText, userId);
        } else {
          return reason(compactedHistory, enrichedText, memories, modelId, userId);
        }
      });

      await Promise.all([
        appendMessage(sessionId, userId, "assistant", reply),
        writeMemory(userId, text),
      ]);

      metrics.messageCount.add(1, { intent, channel: processedInput.channel });
      metrics.messageLatency.record(Date.now() - startMs, { intent });

      const processedOutput = await hookRegistry.runAfter(processedInput, { reply, intent });
      return processedOutput;
    } catch (err: unknown) {
      metrics.errorCount.add(1, { intent: intent ?? "unknown" });
      await hookRegistry.runOnError(processedInput, err);
      throw err;
    }
  });
}
