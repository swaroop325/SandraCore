import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRows = [
  { role: "assistant", content: "Hello!" },
  { role: "user", content: "Hi Sandra" },
];

const mockQuery = vi.fn().mockResolvedValue({ rows: [...mockRows] });
const mockExecute = vi.fn().mockResolvedValue({});

vi.mock("@sandra/utils", () => ({
  db: { query: mockQuery, execute: mockExecute },
}));

describe("loadHistory", () => {
  it("returns messages in chronological order", async () => {
    const { loadHistory } = await import("./short-term.js");
    const msgs = await loadHistory("tg:123");
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[1]?.role).toBe("assistant");
  });

  it("passes sessionId and limit to query", async () => {
    const { loadHistory } = await import("./short-term.js");
    await loadHistory("tg:456", 10);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE session_id"),
      ["tg:456", 10]
    );
  });
});

describe("appendMessage", () => {
  it("inserts message into conversation_messages", async () => {
    const { appendMessage } = await import("./short-term.js");
    await appendMessage("tg:123", "user-1", "user", "Hello");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO conversation_messages"),
      expect.arrayContaining(["tg:123", "user-1", "user", "Hello"])
    );
  });
});
