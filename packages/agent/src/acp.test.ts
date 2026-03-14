import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AssistantInput, AssistantOutput } from "@sandra/core";

// ---------------------------------------------------------------------------
// Mock handleMessage via the injectable _setHandleMessage API exposed by acp.ts.
// We do NOT need to vi.mock("./index.js") because acp.ts supports injection.
// ---------------------------------------------------------------------------

const mockHandleMessage = vi.fn<[AssistantInput], Promise<AssistantOutput>>();

import { callAgent, _setHandleMessage } from "./acp.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Inject the mock before each test so the lazy-loaded real module is never used.
  _setHandleMessage(mockHandleMessage);
});

// ---------------------------------------------------------------------------
// callAgent tests
// ---------------------------------------------------------------------------

describe("callAgent", () => {
  it("calls handleMessage with the correct text and channel", async () => {
    mockHandleMessage.mockResolvedValueOnce({ reply: "done", intent: "conversation" });

    await callAgent({ agentName: "researcher", task: "Find info on TypeScript" });

    expect(mockHandleMessage).toHaveBeenCalledTimes(1);
    const call = mockHandleMessage.mock.calls[0]![0];
    expect(call.text).toBe("Find info on TypeScript");
    expect(call.channel).toBe("internal");
  });

  it("uses the provided sessionId when given", async () => {
    mockHandleMessage.mockResolvedValueOnce({ reply: "result", intent: "conversation" });

    const response = await callAgent({
      agentName: "coder",
      task: "Write a sort function",
      sessionId: "acp:coder:fixed-session",
    });

    expect(response.sessionId).toBe("acp:coder:fixed-session");
    const call = mockHandleMessage.mock.calls[0]![0];
    expect(call.sessionId).toBe("acp:coder:fixed-session");
  });

  it("generates a sessionId when not provided", async () => {
    mockHandleMessage.mockResolvedValueOnce({ reply: "ok", intent: "conversation" });

    const response = await callAgent({ agentName: "helper", task: "Help me" });

    expect(response.sessionId).toMatch(/^acp:helper:[0-9a-f]{16}$/);
  });

  it("returns durationMs as a non-negative number", async () => {
    mockHandleMessage.mockResolvedValueOnce({ reply: "fast", intent: "conversation" });

    const response = await callAgent({ agentName: "fast-agent", task: "Quick task" });

    expect(typeof response.durationMs).toBe("number");
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns the reply from handleMessage as result", async () => {
    mockHandleMessage.mockResolvedValueOnce({ reply: "The answer is 42", intent: "conversation" });

    const response = await callAgent({ agentName: "answerer", task: "What is the answer?" });

    expect(response.result).toBe("The answer is 42");
    expect(response.agentName).toBe("answerer");
  });

  it("defaults userId to 'system' when not provided", async () => {
    mockHandleMessage.mockResolvedValueOnce({ reply: "ok", intent: "conversation" });

    await callAgent({ agentName: "agent", task: "do something" });

    const call = mockHandleMessage.mock.calls[0]![0];
    expect(call.userId).toBe("system");
  });

  it("passes through explicit userId", async () => {
    mockHandleMessage.mockResolvedValueOnce({ reply: "ok", intent: "conversation" });

    await callAgent({ agentName: "agent", task: "do something", userId: "user-123" });

    const call = mockHandleMessage.mock.calls[0]![0];
    expect(call.userId).toBe("user-123");
  });

  it("wraps errors: result starts with 'Error:' when handleMessage throws", async () => {
    mockHandleMessage.mockRejectedValueOnce(new Error("Bedrock timeout"));

    const response = await callAgent({ agentName: "flaky", task: "risky task" });

    expect(response.result).toMatch(/^Error: Bedrock timeout/);
    expect(response.agentName).toBe("flaky");
    expect(typeof response.durationMs).toBe("number");
  });

  it("wraps non-Error throws too", async () => {
    mockHandleMessage.mockRejectedValueOnce("string error");

    const response = await callAgent({ agentName: "flaky2", task: "risky task 2" });

    expect(response.result).toBe("Error: string error");
  });
});
