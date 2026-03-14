import { AsyncLocalStorage } from "async_hooks";

export const MAX_SUBAGENT_DEPTH = 3;

const depthStorage = new AsyncLocalStorage<number>();

/** Get the current subagent recursion depth (0 if not inside any subagent context). */
export function getCurrentDepth(): number {
  return depthStorage.getStore() ?? 0;
}

/** Run a function with a specific depth value in context. */
export function runWithDepth<T>(depth: number, fn: () => Promise<T>): Promise<T> {
  return depthStorage.run(depth, fn);
}

/**
 * Returns the next depth value (current + 1).
 * Does NOT set anything in context — call runWithDepth with the result.
 */
export function incrementDepth(): number {
  return getCurrentDepth() + 1;
}
