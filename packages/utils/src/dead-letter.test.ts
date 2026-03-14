import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  SendMessageCommand: vi.fn().mockImplementation((p) => p),
}));
vi.mock("./logger.js", () => ({
  createSubsystemLogger: vi.fn().mockReturnValue({
    warn: vi.fn(), info: vi.fn(), error: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["DLQ_URL"];
});

describe("sendToDeadLetter", () => {
  it("logs to console when DLQ_URL not set", async () => {
    const { sendToDeadLetter } = await import("./dead-letter.js");
    await expect(sendToDeadLetter('{"test":true}', new Error("fail"))).resolves.not.toThrow();
  });

  it("sends to SQS when DLQ_URL is set", async () => {
    process.env["DLQ_URL"] = "https://sqs.ap-southeast-1.amazonaws.com/123/dlq";
    const { sendToDeadLetter } = await import("./dead-letter.js");
    await sendToDeadLetter('{"test":true}', new Error("fail"), 3);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("does not throw if SQS send fails", async () => {
    process.env["DLQ_URL"] = "https://sqs.ap-southeast-1.amazonaws.com/123/dlq";
    mockSend.mockRejectedValueOnce(new Error("SQS down"));
    const { sendToDeadLetter } = await import("./dead-letter.js");
    await expect(sendToDeadLetter('{"test":true}', new Error("fail"))).resolves.not.toThrow();
  });
});
