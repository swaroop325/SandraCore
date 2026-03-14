import { describe, it, expect, vi } from "vitest";

describe("withTyping", () => {
  it("executes fn and returns result", async () => {
    const mockCtx = { replyWithChatAction: vi.fn().mockResolvedValue({}) };
    const { withTyping } = await import("./typing.js");
    const result = await withTyping(mockCtx as any, async () => "hello");
    expect(result).toBe("hello");
  });

  it("does not throw if typing action fails", async () => {
    const mockCtx = { replyWithChatAction: vi.fn().mockRejectedValue(new Error("blocked")) };
    const { withTyping } = await import("./typing.js");
    const result = await withTyping(mockCtx as any, async () => 42);
    expect(result).toBe(42);
  });
});

describe("reactions", () => {
  it("withStatus formats correctly", async () => {
    const { withStatus } = await import("./reactions.js");
    const msg = withStatus("done", "Task created");
    expect(msg).toContain("✅");
    expect(msg).toContain("Task created");
  });

  it("withStatus error uses ❌", async () => {
    const { withStatus } = await import("./reactions.js");
    expect(withStatus("error", "Failed")).toContain("❌");
  });
});
