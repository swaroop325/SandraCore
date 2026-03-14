import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn().mockResolvedValue({});
const mockQuery = vi.fn().mockResolvedValue({
  rows: [{ total_input: "1000", total_output: "500", total_cost: "0.01", calls: "5" }],
});
vi.mock("./db.js", () => ({ db: { execute: mockExecute, query: mockQuery } }));

beforeEach(() => vi.clearAllMocks());

describe("recordUsage", () => {
  it("inserts a usage record", async () => {
    const { recordUsage } = await import("./usage-tracker.js");
    await recordUsage("user-1", "tg:123", "anthropic.claude-sonnet-4-6", 500, 200);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO llm_usage"),
      expect.any(Array)
    );
  });

  it("does not throw on DB error (best-effort)", async () => {
    mockExecute.mockRejectedValueOnce(new Error("DB down"));
    const { recordUsage } = await import("./usage-tracker.js");
    await expect(recordUsage("user-1", "tg:123", "anthropic.claude-haiku-4-5-20251001", 100, 50)).resolves.not.toThrow();
  });
});

describe("getUserUsage", () => {
  it("returns aggregated usage stats", async () => {
    const { getUserUsage } = await import("./usage-tracker.js");
    const result = await getUserUsage("user-1");
    expect(result.totalInputTokens).toBe(1000);
    expect(result.totalOutputTokens).toBe(500);
    expect(result.calls).toBe(5);
  });
});
