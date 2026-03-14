/**
 * Per-session message debouncer.
 * When a user sends multiple messages rapidly, batches them into one
 * call to avoid parallel LLM invocations.
 */

interface DebouncerEntry {
  timer: ReturnType<typeof setTimeout>;
  accumulated: string[];
  resolvers: ((v: string | null) => void)[];
}

/** Default debounce window in ms */
const DEFAULT_DEBOUNCE_MS = 1500;

/**
 * Creates a debouncer instance. Each sessionId gets its own timer.
 *
 * Usage:
 *   const debouncer = createDebouncer();
 *   const text = await debouncer.add(sessionId, incomingText);
 *   // text is the combined messages after the debounce window, or null if
 *   // this message was merged into a later call (caller should skip processing)
 */
export function createDebouncer(debounceMs = DEFAULT_DEBOUNCE_MS): {
  /** Returns combined text if this call should be processed, null if it was merged into a later call */
  add(sessionId: string, text: string): Promise<string | null>;
  /** Clean up all pending timers */
  destroy(): void;
} {
  const pending = new Map<string, DebouncerEntry>();

  function add(sessionId: string, text: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const existing = pending.get(sessionId);

      if (existing) {
        // Cancel the old timer; earlier callers will receive null
        clearTimeout(existing.timer);
        existing.accumulated.push(text);
        existing.resolvers.push(resolve);

        // Restart the timer with the updated entry
        existing.timer = setTimeout(() => {
          const entry = pending.get(sessionId);
          if (!entry) return;
          pending.delete(sessionId);

          const combined = entry.accumulated.join("\n");
          // Resolve all earlier callers with null (their messages were merged)
          for (let i = 0; i < entry.resolvers.length - 1; i++) {
            entry.resolvers[i]!(null);
          }
          // Resolve the last caller with the combined text
          entry.resolvers[entry.resolvers.length - 1]!(combined);
        }, debounceMs);
      } else {
        // First message for this session
        const entry: DebouncerEntry = {
          accumulated: [text],
          resolvers: [resolve],
          timer: setTimeout(() => {
            const e = pending.get(sessionId);
            if (!e) return;
            pending.delete(sessionId);

            const combined = e.accumulated.join("\n");
            for (let i = 0; i < e.resolvers.length - 1; i++) {
              e.resolvers[i]!(null);
            }
            e.resolvers[e.resolvers.length - 1]!(combined);
          }, debounceMs),
        };
        pending.set(sessionId, entry);
      }
    });
  }

  function destroy(): void {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      // Resolve all pending promises with null so callers are not left hanging
      for (const resolver of entry.resolvers) {
        resolver(null);
      }
    }
    pending.clear();
  }

  return { add, destroy };
}
