import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HookHandler, CommandEvent } from "../types.js";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("hooks:command-logger");

/**
 * Appends command events to LOGS_DIR/commands.log (one JSON line per event).
 * LOGS_DIR defaults to process.env["LOGS_DIR"] ?? "./logs"
 */
export const commandLoggerHook: HookHandler<CommandEvent> = async (event) => {
  const logsDir = process.env["LOGS_DIR"] ?? "./logs";
  const logFile = join(logsDir, "commands.log");

  const entry = JSON.stringify({
    ts: event.timestamp.toISOString(),
    userId: event.userId,
    sessionId: event.sessionId,
    channel: event.channel,
    command: event.command,
    args: event.args,
  });

  try {
    await mkdir(logsDir, { recursive: true });
    await appendFile(logFile, entry + "\n", "utf-8");
  } catch (err) {
    log.error("Failed to append command log", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
