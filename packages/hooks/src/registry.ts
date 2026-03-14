import type { HookEvent, HookHandler, HookRegistry } from "./types.js";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("hooks");

export function createHookRegistry(): HookRegistry {
  const handlers = new Map<string, HookHandler[]>();

  return {
    on(type, handler) {
      const existing = handlers.get(type) ?? [];
      existing.push(handler as HookHandler);
      handlers.set(type, existing);
    },

    async emit(event) {
      const list = handlers.get(event.type) ?? [];
      for (const handler of list) {
        try {
          await handler(event as never);
        } catch (err) {
          log.error(`Hook handler error for ${event.type}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
  };
}

// Global singleton registry
let _registry: HookRegistry | null = null;

export function getHookRegistry(): HookRegistry {
  if (!_registry) {
    _registry = createHookRegistry();
  }
  return _registry;
}
