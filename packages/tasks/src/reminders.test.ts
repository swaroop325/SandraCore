import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn().mockResolvedValue({});
const mockDbExecute = vi.fn().mockResolvedValue({});

vi.mock("@sandra/utils", () => ({
  db: { query: mockDbExecute, execute: mockDbExecute },
  sqsClient: { send: mockSend },
}));
vi.mock("@aws-sdk/client-sqs", () => ({
  SendMessageCommand: vi.fn().mockImplementation((params) => params),
}));

beforeEach(() => {
  process.env["SQS_QUEUE_URL"] = "https://sqs.ap-southeast-1.amazonaws.com/test/sandra-reminders";
  vi.clearAllMocks();
});

describe("scheduleReminder", () => {
  it("inserts reminder into DB", async () => {
    const { scheduleReminder } = await import("./reminders.js");
    const triggerTime = new Date(Date.now() + 60_000);
    await scheduleReminder("user-1", "task-1", triggerTime);
    expect(mockDbExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO reminders"),
      expect.any(Array)
    );
  });

  it("enqueues SQS message", async () => {
    const { scheduleReminder } = await import("./reminders.js");
    const triggerTime = new Date(Date.now() + 60_000);
    await scheduleReminder("user-1", "task-1", triggerTime);
    expect(mockSend).toHaveBeenCalled();
  });
});
