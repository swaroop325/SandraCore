import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted() so the mock logger is available inside the vi.mock() factory
const { mockLogger } = vi.hoisted(() => {
  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    isEnabled: vi.fn(),
  };
  return { mockLogger };
});

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: vi.fn(() => mockLogger),
}));

import { createHookRegistry } from "./hooks.js";
import type { AssistantInput, AssistantOutput } from "@sandra/core";
import type { BeforeMessageHook, AfterMessageHook, OnErrorHook } from "./hooks.js";

// Minimal fixtures — only type-safe fields required
function makeInput(overrides?: Partial<AssistantInput>): AssistantInput {
  return {
    id: "msg-1",
    text: "hello",
    userId: "user-1",
    sessionId: "sess-1",
    channel: "telegram",
    locale: "en",
    timestamp: 1000,
    ...overrides,
  };
}

function makeOutput(overrides?: Partial<AssistantOutput>): AssistantOutput {
  return {
    reply: "hi there",
    intent: "conversation",
    ...overrides,
  };
}

describe("createHookRegistry", () => {
  let registry: ReturnType<typeof createHookRegistry>;

  beforeEach(() => {
    registry = createHookRegistry();
  });

  // ── count() ────────────────────────────────────────────────────────────

  it("count() returns 0 for empty registry", () => {
    expect(registry.count()).toBe(0);
  });

  it("count() returns total hooks across phases", () => {
    const before: BeforeMessageHook = { phase: "before_message", handler: async (i) => i };
    const after: AfterMessageHook = { phase: "after_message", handler: async (_i, o) => o };
    const onErr: OnErrorHook = { phase: "on_error", handler: vi.fn() };
    registry.register(before);
    registry.register(after);
    registry.register(onErr);
    expect(registry.count()).toBe(3);
  });

  it("count(phase) returns only hooks for that phase", () => {
    const b1: BeforeMessageHook = { phase: "before_message", handler: async (i) => i };
    const b2: BeforeMessageHook = { phase: "before_message", handler: async (i) => i };
    const a1: AfterMessageHook = { phase: "after_message", handler: async (_i, o) => o };
    registry.register(b1);
    registry.register(b2);
    registry.register(a1);
    expect(registry.count("before_message")).toBe(2);
    expect(registry.count("after_message")).toBe(1);
    expect(registry.count("on_error")).toBe(0);
  });

  // ── unregister() ───────────────────────────────────────────────────────

  it("unregister() removes a registered hook", () => {
    const hook: BeforeMessageHook = { phase: "before_message", handler: async (i) => i };
    registry.register(hook);
    expect(registry.count()).toBe(1);
    registry.unregister(hook);
    expect(registry.count()).toBe(0);
  });

  it("unregister() is a no-op for a hook not in the registry", () => {
    const hook: BeforeMessageHook = { phase: "before_message", handler: async (i) => i };
    expect(() => registry.unregister(hook)).not.toThrow();
    expect(registry.count()).toBe(0);
  });

  // ── clear() ────────────────────────────────────────────────────────────

  it("clear() empties all hooks", () => {
    registry.register({ phase: "before_message", handler: async (i) => i });
    registry.register({ phase: "after_message", handler: async (_i, o) => o });
    registry.register({ phase: "on_error", handler: vi.fn() });
    expect(registry.count()).toBe(3);
    registry.clear();
    expect(registry.count()).toBe(0);
  });

  // ── runBefore() ────────────────────────────────────────────────────────

  it("runBefore() passes through input when no hooks registered", async () => {
    const input = makeInput();
    const result = await registry.runBefore(input);
    expect(result).toBe(input);
  });

  it("runBefore() chains multiple hooks in registration order", async () => {
    const calls: number[] = [];

    const h1: BeforeMessageHook = {
      phase: "before_message",
      handler: async (input) => {
        calls.push(1);
        return { ...input, text: input.text + " [h1]" };
      },
    };
    const h2: BeforeMessageHook = {
      phase: "before_message",
      handler: async (input) => {
        calls.push(2);
        return { ...input, text: input.text + " [h2]" };
      },
    };

    registry.register(h1);
    registry.register(h2);

    const result = await registry.runBefore(makeInput({ text: "start" }));
    expect(calls).toEqual([1, 2]);
    expect(result.text).toBe("start [h1] [h2]");
  });

  it("runBefore() skips after_message and on_error hooks", async () => {
    const afterHandler = vi.fn(async (_i: AssistantInput, o: AssistantOutput) => o);
    const errorHandler = vi.fn();
    registry.register({ phase: "after_message", handler: afterHandler });
    registry.register({ phase: "on_error", handler: errorHandler });

    const input = makeInput();
    const result = await registry.runBefore(input);
    expect(result).toBe(input);
    expect(afterHandler).not.toHaveBeenCalled();
    expect(errorHandler).not.toHaveBeenCalled();
  });

  it("runBefore() propagates hook errors", async () => {
    const boom = new Error("before hook failed");
    const hook: BeforeMessageHook = {
      phase: "before_message",
      handler: async () => { throw boom; },
    };
    registry.register(hook);
    await expect(registry.runBefore(makeInput())).rejects.toThrow("before hook failed");
  });

  // ── runAfter() ─────────────────────────────────────────────────────────

  it("runAfter() passes through output when no hooks registered", async () => {
    const output = makeOutput();
    const result = await registry.runAfter(makeInput(), output);
    expect(result).toBe(output);
  });

  it("runAfter() chains multiple hooks in registration order", async () => {
    const calls: number[] = [];

    const h1: AfterMessageHook = {
      phase: "after_message",
      handler: async (_input, output) => {
        calls.push(1);
        return { ...output, reply: output.reply + " [h1]" };
      },
    };
    const h2: AfterMessageHook = {
      phase: "after_message",
      handler: async (_input, output) => {
        calls.push(2);
        return { ...output, reply: output.reply + " [h2]" };
      },
    };

    registry.register(h1);
    registry.register(h2);

    const result = await registry.runAfter(makeInput(), makeOutput({ reply: "base" }));
    expect(calls).toEqual([1, 2]);
    expect(result.reply).toBe("base [h1] [h2]");
  });

  it("runAfter() receives original input and threaded output across hooks", async () => {
    const receivedInputs: AssistantInput[] = [];

    const h1: AfterMessageHook = {
      phase: "after_message",
      handler: async (input, output) => {
        receivedInputs.push(input);
        return { ...output, intent: "h1_modified" };
      },
    };
    const h2: AfterMessageHook = {
      phase: "after_message",
      handler: async (input, output) => {
        receivedInputs.push(input);
        return output;
      },
    };

    registry.register(h1);
    registry.register(h2);

    const input = makeInput();
    await registry.runAfter(input, makeOutput());
    // Both hooks receive the same original input
    expect(receivedInputs[0]).toBe(input);
    expect(receivedInputs[1]).toBe(input);
  });

  it("runAfter() propagates hook errors", async () => {
    const hook: AfterMessageHook = {
      phase: "after_message",
      handler: async () => { throw new Error("after hook failed"); },
    };
    registry.register(hook);
    await expect(registry.runAfter(makeInput(), makeOutput())).rejects.toThrow("after hook failed");
  });

  // ── runOnError() ───────────────────────────────────────────────────────

  it("runOnError() is a no-op when no hooks registered", async () => {
    await expect(registry.runOnError(makeInput(), new Error("oops"))).resolves.toBeUndefined();
  });

  it("runOnError() calls all on_error hooks", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    registry.register({ phase: "on_error", handler: handler1 });
    registry.register({ phase: "on_error", handler: handler2 });

    const input = makeInput();
    const err = new Error("pipeline error");
    await registry.runOnError(input, err);

    expect(handler1).toHaveBeenCalledWith(input, err);
    expect(handler2).toHaveBeenCalledWith(input, err);
  });

  it("runOnError() calls remaining hooks even if one throws", async () => {
    const handler1 = vi.fn().mockRejectedValue(new Error("hook1 exploded"));
    const handler2 = vi.fn().mockResolvedValue(undefined);

    registry.register({ phase: "on_error", handler: handler1 });
    registry.register({ phase: "on_error", handler: handler2 });

    // Must NOT throw
    await expect(registry.runOnError(makeInput(), new Error("original"))).resolves.toBeUndefined();
    expect(handler2).toHaveBeenCalled();
  });

  it("runOnError() swallows hook errors — no exception propagates", async () => {
    const throwingHook: OnErrorHook = {
      phase: "on_error",
      handler: async () => { throw new Error("on_error hook itself blew up"); },
    };
    registry.register(throwingHook);

    // Should not throw
    await expect(registry.runOnError(makeInput(), new Error("original"))).resolves.toBeUndefined();
  });

  it("runOnError() skips before_message and after_message hooks", async () => {
    const beforeHandler = vi.fn(async (i: AssistantInput) => i);
    const afterHandler = vi.fn(async (_i: AssistantInput, o: AssistantOutput) => o);
    registry.register({ phase: "before_message", handler: beforeHandler });
    registry.register({ phase: "after_message", handler: afterHandler });

    await registry.runOnError(makeInput(), new Error("err"));
    expect(beforeHandler).not.toHaveBeenCalled();
    expect(afterHandler).not.toHaveBeenCalled();
  });

  // ── unregister() effect on run methods ────────────────────────────────

  it("unregistered hook is not called in runBefore()", async () => {
    const handler = vi.fn(async (i: AssistantInput) => i);
    const hook: BeforeMessageHook = { phase: "before_message", handler };
    registry.register(hook);
    registry.unregister(hook);

    await registry.runBefore(makeInput());
    expect(handler).not.toHaveBeenCalled();
  });

  it("unregistered hook is not called in runAfter()", async () => {
    const handler = vi.fn(async (_i: AssistantInput, o: AssistantOutput) => o);
    const hook: AfterMessageHook = { phase: "after_message", handler };
    registry.register(hook);
    registry.unregister(hook);

    await registry.runAfter(makeInput(), makeOutput());
    expect(handler).not.toHaveBeenCalled();
  });

  // ── clear() effect on run methods ─────────────────────────────────────

  it("clear() prevents hooks from running in subsequent calls", async () => {
    const handler = vi.fn(async (i: AssistantInput) => i);
    registry.register({ phase: "before_message", handler });
    registry.clear();

    await registry.runBefore(makeInput());
    expect(handler).not.toHaveBeenCalled();
  });
});
