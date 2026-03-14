import { describe, it, expect, vi } from "vitest";
import type { Message } from "@sandra/memory";

vi.mock("./bedrock-client.js", () => ({
  bedrock: {
    send: vi.fn().mockResolvedValue({
      body: Buffer.from(JSON.stringify({ content: [{ text: "Summary of old messages." }] })),
    }),
  },
}));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  InvokeModelCommand: vi.fn().mockImplementation((p) => p),
}));

describe("compactIfNeeded", () => {
  it("returns messages unchanged when under budget", async () => {
    const { compactIfNeeded } = await import("./compaction.js");
    const msgs: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    const result = await compactIfNeeded(msgs, "anthropic.claude-sonnet-4-6");
    expect(result).toEqual(msgs);
  });

  it("summarizes old messages when over budget", async () => {
    const { compactIfNeeded } = await import("./compaction.js");
    // Create 1000 large messages to exceed budget
    const msgs: Message[] = Array.from({ length: 500 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: "x".repeat(1600),
    }));
    const result = await compactIfNeeded(msgs, "anthropic.claude-sonnet-4-6");
    expect(result.length).toBeLessThan(msgs.length);
    // First message should be the summary
    expect(result[0]?.content).toContain("[Context summary");
    expect(result[0]?.role).toBe("assistant");
  });

  it("falls back to trimToFit if summarization fails", async () => {
    const { bedrock } = await import("./bedrock-client.js");
    (bedrock.send as any).mockRejectedValueOnce(new Error("Bedrock down"));
    const { compactIfNeeded } = await import("./compaction.js");
    const msgs: Message[] = Array.from({ length: 500 }, () => ({
      role: "user" as const,
      content: "x".repeat(1600),
    }));
    // Should not throw even if summarization fails
    await expect(compactIfNeeded(msgs, "anthropic.claude-sonnet-4-6")).resolves.not.toThrow();
  });
});
