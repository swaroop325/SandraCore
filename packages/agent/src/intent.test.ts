import { describe, it, expect, vi } from "vitest";

const mockSend = vi.fn();
vi.mock("./bedrock-client.js", () => ({
  bedrock: { send: mockSend },
}));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  InvokeModelCommand: vi.fn().mockImplementation((p) => p),
}));

function makeBedrockResponse(text: string) {
  return {
    body: Buffer.from(JSON.stringify({ content: [{ text }] })),
  };
}

describe("classifyMessage", () => {
  it("returns intent and complexity", async () => {
    mockSend.mockResolvedValueOnce(
      makeBedrockResponse('{"intent":"task_create","complexity":"simple"}')
    );
    const { classifyMessage } = await import("./intent.js");
    const result = await classifyMessage("Remind me to call John tomorrow");
    expect(result.intent).toBe("task_create");
    expect(result.complexity).toBe("simple");
  });

  it("falls back to conversation/simple on parse error", async () => {
    mockSend.mockResolvedValueOnce(makeBedrockResponse("not json"));
    const { classifyMessage } = await import("./intent.js");
    const result = await classifyMessage("some message");
    expect(result.intent).toBe("conversation");
    expect(result.complexity).toBe("simple");
  });
});

describe("selectModel", () => {
  it("maps simple to haiku", async () => {
    const { selectModel } = await import("./intent.js");
    expect(selectModel("simple")).toContain("haiku");
  });
  it("maps complex to sonnet", async () => {
    const { selectModel } = await import("./intent.js");
    expect(selectModel("complex")).toContain("sonnet");
  });
  it("maps deep to opus", async () => {
    const { selectModel } = await import("./intent.js");
    expect(selectModel("deep")).toContain("opus");
  });
});
