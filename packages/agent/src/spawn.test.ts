import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      body: Buffer.from(JSON.stringify({
        content: [{ type: "text", text: "Subagent result here." }],
        usage: { input_tokens: 100, output_tokens: 50 },
        model: "anthropic.claude-sonnet-4-6",
      })),
    }),
  })),
  InvokeModelCommand: vi.fn(),
}));

vi.mock("@sandra/core", () => ({
  REGION: "us-east-1",
  MODELS: {
    HAIKU: "anthropic.claude-haiku-4-5-20251001",
    SONNET: "anthropic.claude-sonnet-4-6",
    OPUS: "anthropic.claude-opus-4-6",
  },
  BEDROCK_VERSION: "bedrock-2023-05-31",
}));

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({
    debug: vi.fn(), info: vi.fn(), error: vi.fn(),
  }),
}));

vi.mock("./soul.js", () => ({
  getSoul: vi.fn().mockReturnValue("You are Sandra, a helpful AI assistant."),
}));

import { spawnSubagent } from "./spawn.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("spawnSubagent", () => {
  it("returns subagent output", async () => {
    const result = await spawnSubagent({ task: "Summarize: the sky is blue" });
    expect(result.output).toBe("Subagent result here.");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it("includes context when provided", async () => {
    const { InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    await spawnSubagent({ task: "Extract names", context: "John met Jane yesterday" });
    const callArg = vi.mocked(InvokeModelCommand).mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
  });

  it("uses custom model when specified", async () => {
    const result = await spawnSubagent({
      task: "Quick task",
      modelId: "anthropic.claude-haiku-4-5-20251001",
    });
    expect(result.output).toBeDefined();
  });
});
