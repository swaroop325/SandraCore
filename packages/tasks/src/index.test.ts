import { describe, it, expect, vi } from "vitest";

const mockExecute = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
vi.mock("@sandra/utils", () => ({
  db: { query: mockExecute, execute: mockExecute },
  sqsClient: { send: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@aws-sdk/client-sqs", () => ({
  SendMessageCommand: vi.fn(),
  SQSClient: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
}));

describe("createTask", () => {
  it("returns task created message", async () => {
    const { createTask } = await import("./index.js");
    const result = await createTask("Buy groceries", "user-1");
    expect(result).toContain("Buy groceries");
  });

  it("inserts into tasks table", async () => {
    const { createTask } = await import("./index.js");
    await createTask("Send email", "user-2");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO tasks"),
      expect.any(Array)
    );
  });
});
