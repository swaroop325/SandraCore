import type { AssistantInput, AssistantOutput } from "@sandra/core";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("hooks");

export type HookPhase = "before_message" | "after_message" | "on_error" | "lifecycle";

export interface BeforeMessageHook {
  phase: "before_message";
  /** Can transform/augment the input. Return modified input or same input. */
  handler(input: AssistantInput): AssistantInput | Promise<AssistantInput>;
}

export interface AfterMessageHook {
  phase: "after_message";
  /** Can log, transform, or side-effect on the output. Return modified output or same output. */
  handler(input: AssistantInput, output: AssistantOutput): AssistantOutput | Promise<AssistantOutput>;
}

export interface OnErrorHook {
  phase: "on_error";
  /** Called when handleMessage throws. Can log, report, or rethrow. */
  handler(input: AssistantInput, error: unknown): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Lifecycle event-based hooks
// ---------------------------------------------------------------------------

export type LifecycleEvent =
  | { type: "agent.bootstrap"; agentId: string }
  | { type: "message.received"; userId: string; sessionId: string; channel: string }
  | { type: "message.sent"; userId: string; reply: string; durationMs: number }
  | { type: "message.transcribed"; userId: string; transcript: string };

export interface LifecycleHook {
  phase: "lifecycle";
  handler(event: LifecycleEvent): void | Promise<void>;
}

export type Hook = BeforeMessageHook | AfterMessageHook | OnErrorHook | LifecycleHook;

export interface HookRegistry {
  register(hook: Hook): void;
  unregister(hook: Hook): void;
  runBefore(input: AssistantInput): Promise<AssistantInput>;
  runAfter(input: AssistantInput, output: AssistantOutput): Promise<AssistantOutput>;
  runOnError(input: AssistantInput, error: unknown): Promise<void>;
  runLifecycle(event: LifecycleEvent): Promise<void>;
  clear(): void;
  count(phase?: HookPhase): number;
}

export function createHookRegistry(): HookRegistry {
  const hooks: Hook[] = [];

  return {
    register(hook: Hook): void {
      hooks.push(hook);
    },

    unregister(hook: Hook): void {
      const idx = hooks.indexOf(hook);
      if (idx !== -1) {
        hooks.splice(idx, 1);
      }
    },

    async runBefore(input: AssistantInput): Promise<AssistantInput> {
      let current = input;
      for (const hook of hooks) {
        if (hook.phase === "before_message") {
          // Errors propagate — caller knows a hook failed
          current = await hook.handler(current);
        }
      }
      return current;
    },

    async runAfter(input: AssistantInput, output: AssistantOutput): Promise<AssistantOutput> {
      let current = output;
      for (const hook of hooks) {
        if (hook.phase === "after_message") {
          // Errors propagate — caller knows a hook failed
          current = await hook.handler(input, current);
        }
      }
      return current;
    },

    async runOnError(input: AssistantInput, error: unknown): Promise<void> {
      for (const hook of hooks) {
        if (hook.phase === "on_error") {
          try {
            await hook.handler(input, error);
          } catch (hookErr: unknown) {
            // Swallow — never propagate on_error hook failures into the main pipeline
            log.error("on_error hook threw", {
              hookErr: hookErr instanceof Error ? hookErr.message : String(hookErr),
            });
          }
        }
      }
    },

    async runLifecycle(event: LifecycleEvent): Promise<void> {
      for (const hook of hooks) {
        if (hook.phase === "lifecycle") {
          try {
            await hook.handler(event);
          } catch (hookErr: unknown) {
            // Swallow — lifecycle hook failures must not disrupt the main pipeline
            log.error("lifecycle hook threw", {
              eventType: event.type,
              hookErr: hookErr instanceof Error ? hookErr.message : String(hookErr),
            });
          }
        }
      }
    },

    clear(): void {
      hooks.splice(0, hooks.length);
    },

    count(phase?: HookPhase): number {
      if (phase === undefined) {
        return hooks.length;
      }
      return hooks.filter((h) => h.phase === phase).length;
    },
  };
}

/** Global singleton hook registry */
export const hookRegistry: HookRegistry = createHookRegistry();
