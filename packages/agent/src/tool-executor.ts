import { webSearch, webFetch, getLinkPreview, runInSandbox, readPdf } from "@sandra/tools";
import type { SandboxOptions } from "@sandra/tools";
import { createTask } from "@sandra/tasks";
import { analyzeImageFromUrl } from "@sandra/media";
import { db } from "@sandra/utils";
import { executePluginTool } from "./plugin-tool-executor.js";
import { callAgent } from "./acp.js";
import type { AssistantInput, AssistantOutput } from "@sandra/core";

// ---------------------------------------------------------------------------
// Injectable handleMessage — avoids circular dependency at import time.
// Wire up from index.ts via setHandleMessage(). Tests may inject a mock.
// ---------------------------------------------------------------------------

type HandleMessageFn = (input: AssistantInput) => Promise<AssistantOutput>;

let _handleMessage: HandleMessageFn | null = null;

async function getHandleMessage(): Promise<HandleMessageFn> {
  if (!_handleMessage) {
    const mod = await import("./index.js");
    _handleMessage = mod.handleMessage;
  }
  return _handleMessage;
}

/** For testing: inject a mock handleMessage */
export function setHandleMessage(fn: HandleMessageFn): void {
  _handleMessage = fn;
}

/**
 * Execute a named tool with the given input and return a string result.
 * Never throws — errors are returned as "Error: <message>" so the model
 * can observe the failure and decide how to proceed.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (name) {
      case "web_search": {
        const query = input["query"] as string;
        const result = await webSearch(query);
        return JSON.stringify(result);
      }

      case "web_fetch": {
        const url = input["url"] as string;
        const result = await webFetch(url);
        return JSON.stringify(result);
      }

      case "link_preview": {
        const url = input["url"] as string;
        const result = await getLinkPreview(url);
        return JSON.stringify(result);
      }

      case "create_task": {
        const description = input["description"] as string;
        const result = await createTask(description, userId);
        return result;
      }

      case "analyze_image": {
        const url = input["url"] as string;
        const prompt = input["prompt"] as string | undefined;
        const result = await analyzeImageFromUrl(url, prompt);
        return JSON.stringify(result);
      }

      case "run_code": {
        const { language, code } = input as { language: string; code: string };
        const result = await runInSandbox({ language: language as SandboxOptions["language"], code });
        return `Exit code: ${result.exitCode}\nStdout:\n${result.stdout}\nStderr:\n${result.stderr}`;
      }

      case "delegate_to_agent": {
        const { agent_name, task } = input as { agent_name: string; task: string };
        const response = await callAgent({ agentName: agent_name, task, userId });
        return `Agent "${agent_name}" completed in ${response.durationMs}ms:\n${response.result}`;
      }

      case "read_pdf": {
        const { path } = input as { path: string };
        const result = await readPdf(path);
        if (!result.success) return `Error reading PDF: ${result.error ?? "unknown error"}`;
        return `PDF extracted (${result.pages} pages):\n${result.text}`;
      }

      case "sessions_list": {
        const limit = (input["limit"] as number | undefined) ?? 10;
        try {
          const rows = await db.execute(
            `SELECT DISTINCT session_id, MAX(created_at) as last_active FROM conversation_messages WHERE user_id = $1 GROUP BY session_id ORDER BY last_active DESC LIMIT $2`,
            [userId, limit]
          );
          return JSON.stringify(rows);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return `Error listing sessions: ${message}`;
        }
      }

      case "sessions_history": {
        const sessionId = input["session_id"] as string;
        const limit = (input["limit"] as number | undefined) ?? 20;
        try {
          const rows = await db.execute(
            `SELECT role, content, created_at FROM conversation_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [sessionId, limit]
          );
          return JSON.stringify(rows);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return `Error fetching session history: ${message}`;
        }
      }

      case "sessions_send": {
        const targetSessionId = input["session_id"] as string;
        const message = input["message"] as string;
        try {
          const handleMessage = await getHandleMessage();
          await handleMessage({
            id: `sessions_send_${Date.now()}`,
            text: message,
            userId,
            sessionId: targetSessionId,
            channel: "internal",
            locale: "en",
            timestamp: Date.now(),
          });
          return `Message sent to session "${targetSessionId}".`;
        } catch (err: unknown) {
          const message2 = err instanceof Error ? err.message : String(err);
          return `Error sending to session: ${message2}`;
        }
      }

      case "sessions_spawn": {
        const { task, session_id } = input as { task: string; session_id?: string };

        const spawnedSessionId = session_id ?? `spawn:${crypto.randomUUID().slice(0, 8)}`;

        try {
          const handleMessage = await getHandleMessage();
          const result = await handleMessage({
            id: crypto.randomUUID(),
            text: task,
            userId,
            sessionId: spawnedSessionId,
            channel: "internal",
            locale: "en",
            timestamp: Date.now(),
          });

          return JSON.stringify({
            spawned_session_id: spawnedSessionId,
            reply: result.reply,
          });
        } catch (err: unknown) {
          return JSON.stringify({
            error: `Failed to spawn session: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      default: {
        // Fallthrough: check plugin registry before giving up.
        const pluginResult = await executePluginTool(name, input, userId);
        if (pluginResult !== null) {
          return pluginResult;
        }
        return `Error: Unknown tool "${name}"`;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}
