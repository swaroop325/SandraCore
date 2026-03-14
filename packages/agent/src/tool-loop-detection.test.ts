import { describe, it, expect } from "vitest";
import { detectToolLoop, hashToolInput } from "./tool-loop-detection.js";
import type { ToolInvocation } from "./tool-loop-detection.js";

function inv(name: string, input: Record<string, unknown> = {}): ToolInvocation {
  return { name, inputHash: hashToolInput(input) };
}

describe("hashToolInput", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const hash = hashToolInput({ query: "hello" });
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("same input produces same hash", () => {
    expect(hashToolInput({ a: 1, b: 2 })).toBe(hashToolInput({ a: 1, b: 2 }));
  });

  it("different inputs produce different hashes", () => {
    expect(hashToolInput({ query: "foo" })).not.toBe(hashToolInput({ query: "bar" }));
  });
});

describe("detectToolLoop — no loop", () => {
  it("returns not detected for empty history", () => {
    expect(detectToolLoop([])).toEqual({ detected: false });
  });

  it("returns not detected for 1 invocation", () => {
    expect(detectToolLoop([inv("web_search", { query: "q" })])).toEqual({ detected: false });
  });

  it("returns not detected for 2 identical invocations", () => {
    const call = inv("web_search", { query: "q" });
    expect(detectToolLoop([call, call])).toEqual({ detected: false });
  });

  it("returns not detected for normal varied calls", () => {
    const history = [
      inv("web_search", { query: "a" }),
      inv("web_fetch", { url: "https://example.com" }),
      inv("create_task", { description: "buy milk" }),
    ];
    expect(detectToolLoop(history)).toEqual({ detected: false });
  });
});

describe("detectToolLoop — generic_repeat", () => {
  it("detects 3 identical consecutive calls", () => {
    const call = inv("web_search", { query: "same" });
    const result = detectToolLoop([call, call, call]);
    expect(result.detected).toBe(true);
    expect(result.kind).toBe("generic_repeat");
    expect(result.message).toContain("web_search");
  });

  it("detects 4 identical consecutive calls", () => {
    const call = inv("run_code", { code: "print(1)" });
    const result = detectToolLoop([call, call, call, call]);
    expect(result.detected).toBe(true);
    expect(result.kind).toBe("generic_repeat");
  });

  it("does not trigger generic_repeat if last 3 are not all the same", () => {
    const a = inv("web_search", { query: "a" });
    const b = inv("web_search", { query: "b" });
    const result = detectToolLoop([a, a, b]);
    expect(result.detected).toBe(false);
  });
});

describe("detectToolLoop — ping_pong", () => {
  it("detects A B A B pattern", () => {
    const a = inv("web_search", { query: "q1" });
    const b = inv("web_fetch", { url: "https://x.com" });
    const result = detectToolLoop([a, b, a, b]);
    expect(result.detected).toBe(true);
    expect(result.kind).toBe("ping_pong");
    expect(result.message).toContain("web_fetch");
  });

  it("detects A B A B in a longer history", () => {
    const a = inv("web_search", { query: "q" });
    const b = inv("create_task", { description: "x" });
    const c = inv("web_fetch", { url: "https://other.com" });
    // c a b a b — last 4 are a b a b
    const result = detectToolLoop([c, a, b, a, b]);
    expect(result.detected).toBe(true);
    expect(result.kind).toBe("ping_pong");
  });

  it("does not trigger ping_pong for only 3 calls A B A", () => {
    const a = inv("web_search", { query: "q" });
    const b = inv("web_fetch", { url: "https://x.com" });
    const result = detectToolLoop([a, b, a]);
    // Only 3 calls — ping_pong requires 4, so no ping_pong; also no generic_repeat
    expect(result.kind).not.toBe("ping_pong");
  });

  it("does not trigger ping_pong when tools differ in last 4", () => {
    const a = inv("web_search", { query: "a" });
    const b = inv("web_fetch", { url: "https://x.com" });
    const c = inv("create_task", { description: "y" });
    const result = detectToolLoop([a, b, c, a]);
    expect(result.detected).toBe(false);
  });
});

describe("detectToolLoop — circuit_breaker", () => {
  it("detects same tool+input 3 times in last 10 calls (non-consecutive)", () => {
    const repeated = inv("web_search", { query: "important" });
    const other1 = inv("web_fetch", { url: "https://a.com" });
    const other2 = inv("create_task", { description: "task" });
    const history = [other1, repeated, other2, repeated, other1, repeated];
    const result = detectToolLoop(history);
    expect(result.detected).toBe(true);
    expect(result.kind).toBe("circuit_breaker");
    expect(result.message).toContain("web_search");
  });

  it("does not trigger circuit_breaker for 2 occurrences in last 10", () => {
    const repeated = inv("web_search", { query: "q" });
    // Use distinct inputs for "other" calls so they don't accumulate a 3-hit count themselves
    const other1 = inv("web_fetch", { url: "https://a.com" });
    const other2 = inv("web_fetch", { url: "https://b.com" });
    const other3 = inv("web_fetch", { url: "https://c.com" });
    const history = [other1, repeated, other2, repeated, other3];
    const result = detectToolLoop(history);
    expect(result.detected).toBe(false);
  });

  it("circuit_breaker only looks at last 10 calls", () => {
    // Put 3 occurrences in positions 11, 12, 13 (i.e., outside the last-10 window)
    // then add 10 more different calls — should NOT trigger
    const old = inv("web_search", { query: "old" });
    const recent = inv("web_fetch", { url: `https://${Math.random()}.com` });
    const others = Array.from({ length: 10 }, (_, i) =>
      inv("create_task", { description: `task-${i}` })
    );
    const history = [old, old, old, ...others];
    // The 3 occurrences of `old` are beyond position -10
    const result = detectToolLoop(history);
    expect(result.detected).toBe(false);
    void recent; // suppress unused warning
  });
});
