import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessagesTokens,
  isOverBudget,
  trimToFit,
  getBudget,
} from "./token-counter.js";
import type { Message } from "@sandra/memory";

describe("estimateTokens", () => {
  it("estimates tokens from character length", () => {
    expect(estimateTokens("hello")).toBe(2); // 5 chars / 4 = 1.25 → ceil = 2
    expect(estimateTokens("")).toBe(0);
  });

  it("scales with message length", () => {
    const short = estimateTokens("short");
    const long = estimateTokens("a".repeat(1000));
    expect(long).toBeGreaterThan(short);
  });
});

describe("estimateMessagesTokens", () => {
  it("sums token estimates across messages", () => {
    const msgs: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    const total = estimateMessagesTokens(msgs);
    expect(total).toBeGreaterThan(0);
    expect(total).toBe(estimateTokens("hello") + 4 + estimateTokens("world") + 4);
  });

  it("returns 0 for empty array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

describe("isOverBudget", () => {
  it("returns false for short history", () => {
    const msgs: Message[] = [{ role: "user", content: "hi" }];
    expect(isOverBudget(msgs, "anthropic.claude-haiku-4-5-20251001")).toBe(false);
  });

  it("returns true for very long history", () => {
    const msgs: Message[] = Array.from({ length: 1000 }, (_, i) => ({
      role: "user" as const,
      content: "a".repeat(1000),
    }));
    expect(isOverBudget(msgs, "anthropic.claude-sonnet-4-6")).toBe(true);
  });
});

describe("trimToFit", () => {
  it("keeps all messages when under budget", () => {
    const msgs: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    const trimmed = trimToFit(msgs, "anthropic.claude-sonnet-4-6");
    expect(trimmed).toHaveLength(2);
  });

  it("trims oldest messages first when over budget", () => {
    // Create 1000 large messages
    const msgs: Message[] = Array.from({ length: 1000 }, (_, i) => ({
      role: "user" as const,
      content: "x".repeat(800),
    }));
    const trimmed = trimToFit(msgs, "anthropic.claude-sonnet-4-6");
    expect(trimmed.length).toBeLessThan(1000);
    // Should keep the most recent messages
    expect(trimmed[trimmed.length - 1]).toEqual(msgs[msgs.length - 1]);
  });

  it("returns empty array when single message exceeds budget", () => {
    const msgs: Message[] = [{ role: "user", content: "x".repeat(5_000_000) }];
    const trimmed = trimToFit(msgs, "anthropic.claude-haiku-4-5-20251001");
    expect(trimmed).toHaveLength(0);
  });
});
