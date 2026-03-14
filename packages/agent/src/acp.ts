import { randomBytes } from "crypto";
import type { AssistantOutput } from "@sandra/core";

export interface AcpRequest {
  /** Human-readable name for this sub-agent invocation */
  agentName: string;
  /** The task/prompt for the sub-agent */
  task: string;
  /** userId to run as — defaults to calling agent's userId */
  userId?: string;
  /** Session ID for the sub-agent — if omitted, generates one */
  sessionId?: string;
  /** Maximum tokens for the sub-agent response */
  maxTokens?: number;
  /** Current nesting depth — used to enforce MAX_SUBAGENT_DEPTH */
  depth?: number;
}

export interface AcpResponse {
  agentName: string;
  result: string;
  sessionId: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Injectable handleMessage — avoids circular dependency issues at import time.
// The real implementation is lazily loaded from ./index.js on first use.
// Tests may call _setHandleMessage() to inject a mock.
// ---------------------------------------------------------------------------

type HandleMessageFn = (
  input: import("@sandra/core").AssistantInput
) => Promise<AssistantOutput>;

let _handleMessage: HandleMessageFn | null = null;

async function getHandleMessage(): Promise<HandleMessageFn> {
  if (!_handleMessage) {
    const mod = await import("./index.js");
    _handleMessage = mod.handleMessage;
  }
  return _handleMessage;
}

/** For testing: inject a mock handleMessage */
export function _setHandleMessage(fn: HandleMessageFn): void {
  _handleMessage = fn;
}

/**
 * Invoke a sub-agent with a specific task.
 * Uses handleMessage internally so the sub-agent has full capabilities
 * (memory, tools, reasoning) but operates independently.
 */
const MAX_SUBAGENT_DEPTH = 3;

export async function callAgent(request: AcpRequest): Promise<AcpResponse> {
  const { agentName, task, userId = "system", maxTokens: _maxTokens, depth = 0 } = request;
  void _maxTokens; // reserved for future use

  if (depth >= MAX_SUBAGENT_DEPTH) {
    const sessionId = request.sessionId ?? `acp:${agentName}:blocked`;
    return {
      agentName,
      result: JSON.stringify({ error: "Maximum subagent depth exceeded" }),
      sessionId,
      durationMs: 0,
    };
  }

  const sessionId =
    request.sessionId ?? `acp:${agentName}:${randomBytes(8).toString("hex")}`;

  const startMs = Date.now();

  try {
    const handleMessage = await getHandleMessage();
    const output = await handleMessage({
      id: randomBytes(8).toString("hex"),
      text: task,
      userId,
      sessionId,
      channel: "internal",
      locale: "en",
      timestamp: Date.now(),
    });

    return {
      agentName,
      result: output.reply,
      sessionId,
      durationMs: Date.now() - startMs,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      agentName,
      result: `Error: ${message}`,
      sessionId,
      durationMs: Date.now() - startMs,
    };
  }
}
