import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- hoisted mock fns ----
const mockSendPollApi = vi.hoisted(() => vi.fn());

vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(() => ({
    api: {
      sendPoll: mockSendPollApi,
    },
  })),
}));

import { Bot } from "grammy";
import { sendPoll } from "./polls.js";

function makeMockBot(): Bot {
  return new Bot("fake-token");
}

beforeEach(() => {
  mockSendPollApi.mockReset();
});

describe("sendPoll", () => {
  it("calls bot.api.sendPoll with correct params and returns success", async () => {
    mockSendPollApi.mockResolvedValueOnce({
      poll: { id: "poll-123" },
    });

    const bot = makeMockBot();
    const result = await sendPoll(bot, 12345, {
      question: "Favourite colour?",
      options: ["Red", "Blue", "Green"],
      isAnonymous: false,
      type: "regular",
      allowsMultipleAnswers: false,
    });

    expect(mockSendPollApi).toHaveBeenCalledOnce();
    const [chatId, question, opts, extra] = mockSendPollApi.mock.calls[0] as [
      unknown, string, string[], Record<string, unknown>
    ];
    expect(chatId).toBe(12345);
    expect(question).toBe("Favourite colour?");
    expect(opts).toEqual(["Red", "Blue", "Green"]);
    expect(extra["is_anonymous"]).toBe(false);
    expect(extra["allows_multiple_answers"]).toBe(false);

    expect(result).toEqual({ success: true, pollId: "poll-123" });
  });

  it("returns success with pollId for a quiz poll", async () => {
    mockSendPollApi.mockResolvedValueOnce({
      poll: { id: "quiz-456" },
    });

    const bot = makeMockBot();
    const result = await sendPoll(bot, "channel-id", {
      question: "What is 2+2?",
      options: ["3", "4", "5"],
      type: "quiz",
      correctOptionId: 1,
      openPeriod: 60,
    });

    const [, , , extra] = mockSendPollApi.mock.calls[0] as [
      unknown, string, string[], Record<string, unknown>
    ];
    expect(extra["type"]).toBe("quiz");
    expect(extra["correct_option_id"]).toBe(1);
    expect(extra["open_period"]).toBe(60);
    expect(result).toEqual({ success: true, pollId: "quiz-456" });
  });

  it("omits optional keys when not provided", async () => {
    mockSendPollApi.mockResolvedValueOnce({ poll: { id: "p1" } });

    const bot = makeMockBot();
    await sendPoll(bot, 1, { question: "Yes or no?", options: ["Yes", "No"] });

    const [, , , extra] = mockSendPollApi.mock.calls[0] as [
      unknown, string, string[], Record<string, unknown>
    ];
    expect("is_anonymous" in extra).toBe(false);
    expect("type" in extra).toBe(false);
    expect("allows_multiple_answers" in extra).toBe(false);
    expect("open_period" in extra).toBe(false);
    expect("correct_option_id" in extra).toBe(false);
  });

  it("returns failure with error message when api throws", async () => {
    mockSendPollApi.mockRejectedValueOnce(new Error("Forbidden: bot is not a member"));

    const bot = makeMockBot();
    const result = await sendPoll(bot, 99, {
      question: "Crash?",
      options: ["Yes", "No"],
    });

    expect(result).toEqual({
      success: false,
      error: "Forbidden: bot is not a member",
    });
  });

  it("handles non-Error throws gracefully", async () => {
    mockSendPollApi.mockRejectedValueOnce("string error");

    const bot = makeMockBot();
    const result = await sendPoll(bot, 1, {
      question: "Q?",
      options: ["A", "B"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("string error");
  });
});
