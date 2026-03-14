import { AsyncLocalStorage } from "async_hooks";

const storage = new AsyncLocalStorage<string>();

/** Generate a short correlation ID (12 hex chars) */
export function generateRequestId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Run fn with a request ID bound to the current async context.
 * All calls to getRequestId() within fn (and its children) return this ID.
 */
export function withRequestId<T>(id: string, fn: () => T): T {
  return storage.run(id, fn);
}

/** Get the current request ID, or undefined if not in a request context. */
export function getRequestId(): string | undefined {
  return storage.getStore();
}

/** Get the current request ID or generate a fallback. */
export function getOrGenerateRequestId(): string {
  return storage.getStore() ?? generateRequestId();
}
