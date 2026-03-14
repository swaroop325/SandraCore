import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      body: Buffer.from(JSON.stringify({
        content: [{ type: "text", text: "A beautiful sunset over the ocean." }],
        usage: { input_tokens: 500, output_tokens: 50 },
        model: "anthropic.claude-sonnet-4-6",
      })),
    }),
  })),
  InvokeModelCommand: vi.fn(),
}));

vi.mock("@sandra/core", () => ({
  REGION: "us-east-1",
  MODELS: { SONNET: "anthropic.claude-sonnet-4-6", HAIKU: "anthropic.claude-haiku-4-5-20251001" },
  BEDROCK_VERSION: "bedrock-2023-05-31",
}));

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

import { analyzeImage } from "./image-analysis.js";

describe("analyzeImage", () => {
  it("returns description from model", async () => {
    const result = await analyzeImage({
      imageBase64: Buffer.from("fake image").toString("base64"),
      mediaType: "image/jpeg",
    });
    expect(result.description).toBe("A beautiful sunset over the ocean.");
    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(50);
  });

  it("throws for oversized images", async () => {
    const bigBase64 = "A".repeat(8 * 1024 * 1024); // ~6MB decoded
    await expect(analyzeImage({ imageBase64: bigBase64, mediaType: "image/png" })).rejects.toThrow(
      "too large"
    );
  });

  it("uses custom question when provided", async () => {
    const { InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const result = await analyzeImage({
      imageBase64: "dGVzdA==",
      mediaType: "image/jpeg",
      question: "What text is in this image?",
    });
    expect(result.description).toBeDefined();
  });
});
