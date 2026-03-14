import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  createOllamaProvider,
  createOpenAICompatProvider,
  registerProvider,
  getProviderForModel,
  listProviders,
  _resetProviders,
} from "./llm-provider.js";

beforeEach(() => {
  vi.clearAllMocks();
  _resetProviders();
});

describe("createOllamaProvider", () => {
  it("calls Ollama /api/chat and returns response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        message: { content: "Hello from Ollama!" },
        model: "llama3",
        prompt_eval_count: 10,
        eval_count: 5,
      }),
    });

    const provider = createOllamaProvider("http://localhost:11434");
    const result = await provider.complete({
      model: "llama3",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe("Hello from Ollama!");
    expect(result.provider).toBe("ollama");
    expect(result.inputTokens).toBe(10);
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const provider = createOllamaProvider();
    await expect(provider.complete({ model: "llama3", messages: [] })).rejects.toThrow("500");
  });

  it("supports non-Bedrock models", () => {
    const p = createOllamaProvider();
    expect(p.supports("llama3")).toBe(true);
    expect(p.supports("anthropic.claude-sonnet-4-6")).toBe(false);
  });
});

describe("createOpenAICompatProvider", () => {
  beforeEach(() => { process.env["OPENAI_API_KEY"] = "test-key"; });
  afterEach(() => { delete process.env["OPENAI_API_KEY"]; });

  it("calls /chat/completions and returns response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "OpenAI response" } }],
        model: "gpt-4o",
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    });

    const provider = createOpenAICompatProvider();
    const result = await provider.complete({
      model: "gpt-4o",
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.text).toBe("OpenAI response");
    expect(result.outputTokens).toBe(10);
  });

  it("supports gpt- and o1 models", () => {
    const p = createOpenAICompatProvider();
    expect(p.supports("gpt-4o")).toBe(true);
    expect(p.supports("o1-mini")).toBe(true);
    expect(p.supports("anthropic.claude-sonnet-4-6")).toBe(false);
  });
});

describe("provider registry", () => {
  it("getProviderForModel returns matching provider", () => {
    const p = createOllamaProvider();
    registerProvider(p);
    expect(getProviderForModel("llama3")).toBe(p);
  });

  it("returns null for unregistered model", () => {
    // Only check if Bedrock models aren't registered
    expect(getProviderForModel("unknown-model-xyz")).toBeNull();
  });
});
