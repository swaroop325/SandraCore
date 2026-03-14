import { describe, it, expect, vi } from "vitest";

const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
vi.mock("@sandra/utils", () => ({ db: { query: mockQuery } }));

describe("getSessionHistory", () => {
  it("queries with userId", async () => {
    const { getSessionHistory } = await import("./session-history.js");
    await getSessionHistory("user-1");
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("user_id = $1"), expect.arrayContaining(["user-1"]));
  });

  it("filters by sessionId when provided", async () => {
    const { getSessionHistory } = await import("./session-history.js");
    await getSessionHistory("user-1", { sessionId: "tg:123" });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("session_id"),
      expect.arrayContaining(["tg:123"])
    );
  });

  it("filters by search when provided", async () => {
    const { getSessionHistory } = await import("./session-history.js");
    await getSessionHistory("user-1", { search: "remind" });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE"),
      expect.arrayContaining(["%remind%"])
    );
  });

  it("returns empty array when no results", async () => {
    const { getSessionHistory } = await import("./session-history.js");
    const result = await getSessionHistory("user-1");
    expect(result).toEqual([]);
  });
});

describe("formatHistoryForContext", () => {
  it("returns placeholder for empty history", async () => {
    const { formatHistoryForContext } = await import("./session-history.js");
    expect(formatHistoryForContext([])).toContain("No conversation history");
  });

  it("formats entries with role and timestamp", async () => {
    const { formatHistoryForContext } = await import("./session-history.js");
    const entries = [{ role: "user" as const, content: "hello", createdAt: new Date("2025-01-01"), sessionId: "tg:1" }];
    const result = formatHistoryForContext(entries);
    expect(result).toContain("USER");
    expect(result).toContain("hello");
  });
});
