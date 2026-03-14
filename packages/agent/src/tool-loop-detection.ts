import { createHash } from "crypto";

export type LoopKind = "generic_repeat" | "ping_pong" | "circuit_breaker";

export interface LoopDetectionResult {
  detected: boolean;
  kind?: LoopKind;
  message?: string;
}

/** Represents a single tool invocation for loop detection */
export interface ToolInvocation {
  name: string;
  inputHash: string; // SHA-256 hex of JSON.stringify(input)
}

/** Compute a stable hash for a tool input object */
export function hashToolInput(input: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/**
 * Check tool call history for loop patterns.
 * - generic_repeat: same tool+input called 3+ times in a row
 * - ping_pong: alternating between 2 tool+input combos (A B A B...) with at least 4 entries
 * - circuit_breaker: same tool+input called 3+ times anywhere in last 10 calls
 */
export function detectToolLoop(history: ToolInvocation[]): LoopDetectionResult {
  if (history.length < 3) {
    return { detected: false };
  }

  const key = (inv: ToolInvocation): string => `${inv.name}:${inv.inputHash}`;

  // generic_repeat: last 3 (or more) entries are identical
  const lastKey = key(history[history.length - 1]!);
  const secondLastKey = key(history[history.length - 2]!);
  const thirdLastKey = key(history[history.length - 3]!);

  if (lastKey === secondLastKey && lastKey === thirdLastKey) {
    return {
      detected: true,
      kind: "generic_repeat",
      message: `Tool "${history[history.length - 1]!.name}" called with the same input 3 times in a row.`,
    };
  }

  // ping_pong: alternating A B A B pattern (need at least 4 entries)
  if (history.length >= 4) {
    const a = key(history[history.length - 1]!);
    const b = key(history[history.length - 2]!);
    const c = key(history[history.length - 3]!);
    const d = key(history[history.length - 4]!);

    if (a !== b && a === c && b === d) {
      return {
        detected: true,
        kind: "ping_pong",
        message: `Tools "${history[history.length - 1]!.name}" and "${history[history.length - 2]!.name}" are alternating in a ping-pong loop.`,
      };
    }
  }

  // circuit_breaker: same tool+input 3+ times anywhere in last 10 calls
  const window = history.slice(-10);
  const counts = new Map<string, number>();
  for (const inv of window) {
    const k = key(inv);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  for (const [k, count] of counts.entries()) {
    if (count >= 3) {
      const toolName = k.split(":")[0]!;
      return {
        detected: true,
        kind: "circuit_breaker",
        message: `Tool "${toolName}" has been called with the same input ${count} times in the last ${window.length} calls.`,
      };
    }
  }

  return { detected: false };
}
