import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@aws-sdk/client-bedrock-runtime", () => {
  return {
    InvokeModelWithResponseStreamCommand: vi.fn((input) => input),
  };
});

vi.mock("@sandra/core", () => ({
  BEDROCK_VERSION: "bedrock-2023-05-31",
  REGION: "ap-southeast-1",
}));

vi.mock("@sandra/utils", () => ({
  getSecret: vi.fn(),
  createSubsystemLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("@sandra/memory", () => ({}));

// Mock soul
vi.mock("./soul.js", () => ({
  getSoul: vi.fn(() => "You are Sandra."),
}));

// Helper: build a fake streaming chunk Uint8Array from an event object
function makeChunk(event: unknown): { chunk: { bytes: Uint8Array } } {
  return {
    chunk: {
      bytes: new TextEncoder().encode(JSON.stringify(event)),
    },
  };
}

// Build an async iterable from an array of raw chunk objects
async function* makeStream(
  chunks: Array<{ chunk: { bytes: Uint8Array } }>
): AsyncGenerator<{ chunk: { bytes: Uint8Array } }> {
  for (const c of chunks) yield c;
}

// Mock bedrock client — we'll override .send per test
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("./bedrock-client.js", () => ({
  bedrock: { send: mockSend },
}));

// Import after mocks
import { streamReason } from "./stream-reason.js";

// ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("streamReason", () => {
  it("yields text chunks from content_block_delta events", async () => {
    const chunks = [
      makeChunk({ type: "message_start", message: {} }),
      makeChunk({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      makeChunk({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }),
      makeChunk({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: ", world" } }),
      makeChunk({ type: "content_block_stop", index: 0 }),
      makeChunk({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
      makeChunk({ type: "message_stop" }),
    ];

    mockSend.mockResolvedValue({ body: makeStream(chunks) });

    const results: string[] = [];
    for await (const chunk of streamReason([], "Hi", [], "anthropic.claude-sonnet-4-6")) {
      results.push(chunk);
    }

    expect(results).toEqual(["Hello", ", world"]);
  });

  it("ignores non-text events (message_start, content_block_start, etc.)", async () => {
    const chunks = [
      makeChunk({ type: "message_start", message: {} }),
      makeChunk({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      makeChunk({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Only this" } }),
      makeChunk({ type: "content_block_stop", index: 0 }),
      makeChunk({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
      makeChunk({ type: "message_stop" }),
    ];

    mockSend.mockResolvedValue({ body: makeStream(chunks) });

    const results: string[] = [];
    for await (const chunk of streamReason([], "Hi", [], "anthropic.claude-sonnet-4-6")) {
      results.push(chunk);
    }

    // Only the text_delta event should be yielded
    expect(results).toHaveLength(1);
    expect(results[0]).toBe("Only this");
  });

  it("concatenating all chunks gives full response text", async () => {
    const words = ["The ", "quick ", "brown ", "fox"];
    const chunks = [
      makeChunk({ type: "message_start", message: {} }),
      ...words.map((w) =>
        makeChunk({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: w } })
      ),
      makeChunk({ type: "message_stop" }),
    ];

    mockSend.mockResolvedValue({ body: makeStream(chunks) });

    let fullText = "";
    for await (const chunk of streamReason([], "Tell me", [], "anthropic.claude-sonnet-4-6")) {
      fullText += chunk;
    }

    expect(fullText).toBe("The quick brown fox");
  });

  it("does not yield anything for non-text-delta events", async () => {
    const chunks = [
      makeChunk({ type: "message_start", message: {} }),
      makeChunk({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      makeChunk({ type: "content_block_stop", index: 0 }),
      makeChunk({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
      makeChunk({ type: "message_stop" }),
    ];

    mockSend.mockResolvedValue({ body: makeStream(chunks) });

    const results: string[] = [];
    for await (const chunk of streamReason([], "Hi", [], "anthropic.claude-sonnet-4-6")) {
      results.push(chunk);
    }

    expect(results).toHaveLength(0);
  });

  it("re-throws errors from Bedrock", async () => {
    mockSend.mockRejectedValue(new Error("Bedrock unavailable"));

    await expect(async () => {
      for await (const _ of streamReason([], "Hi", [], "anthropic.claude-sonnet-4-6")) {
        // should not reach here
      }
    }).rejects.toThrow("Bedrock unavailable");
  });

  it("includes memories in system prompt", async () => {
    const chunks = [
      makeChunk({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }),
    ];

    mockSend.mockResolvedValue({ body: makeStream(chunks) });

    for await (const _ of streamReason([], "Hi", ["fact one", "fact two"], "anthropic.claude-sonnet-4-6")) {
      // consume
    }

    const callArg = mockSend.mock.calls[0]?.[0] as { body: string };
    const parsedBody = JSON.parse(callArg.body) as { system: string };
    expect(parsedBody.system).toContain("fact one");
    expect(parsedBody.system).toContain("fact two");
  });
});
