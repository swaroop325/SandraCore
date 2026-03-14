import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HookHandler, SessionResetEvent } from "../types.js";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("hooks:session-memory");

/**
 * On session reset, save the last N messages to a dated markdown file
 * at MEMORY_DIR/sessions/YYYY-MM-DD-<sessionSlug>.md
 *
 * MEMORY_DIR defaults to process.env["MEMORY_DIR"] ?? "./memory"
 */
export const sessionMemoryHook: HookHandler<SessionResetEvent> = async (event) => {
  const memoryDir = process.env["MEMORY_DIR"] ?? "./memory";
  const sessionsDir = join(memoryDir, "sessions");

  if (event.recentMessages.length === 0) return;

  try {
    await mkdir(sessionsDir, { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const slug = event.sessionId.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40);
    const filename = `${dateStr}-${slug}.md`;
    const filePath = join(sessionsDir, filename);

    const lines: string[] = [
      `# Session: ${event.sessionId}`,
      `**Date:** ${now.toISOString()}`,
      `**User:** ${event.userId}`,
      "",
      "## Conversation",
      "",
    ];

    for (const msg of event.recentMessages) {
      lines.push(`**${msg.role === "user" ? "User" : "Assistant"}:** ${msg.content.slice(0, 500)}`);
      lines.push("");
    }

    await writeFile(filePath, lines.join("\n"), "utf-8");
    log.info("Session memory saved", { file: filename, messages: event.recentMessages.length });
  } catch (err) {
    log.error("Failed to save session memory", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
