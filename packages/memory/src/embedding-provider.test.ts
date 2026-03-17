import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Bedrock mock (hoisted so vi.mock factory can reference it) ---
const mockSend = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  InvokeModelCommand: vi.fn().mockImplementation((input: unknown) => input),
}));

// --- fetch mock ---
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset environment variables
  delete process.env["EMBEDDING_PROVIDER"];
  delete process.env["OLLAMA_BASE_URL"];
  delete process.env["OLLAMA_EMBED_MODEL"];
  delete process.env["OPENAI_BASE_URL"];
  delete process.env["OPENAI_API_KEY"];
  delete process.env["OPENAI_EMBED_MODEL"];
});

describe("createBedrockEmbeddingProvider", () => {
  it("calls Bedrock with the Titan embed model and returns embedding", async () => {
    const fakeEmbedding = [0.1, 0.2, 0.3];
    mockSend.mockResolvedValueOnce({
      body: Buffer.from(JSON.stringify({ embedding: fakeEmbedding })),
    });

    const { createBedrockEmbeddingProvider } = await import("./embedding-provider.js");
    const provider = createBedrockEmbeddingProvider();
    const result = await provider.embed("test text");

    expect(provider.name).toBe("bedrock");
    expect(mockSend).toHaveBeenCalledTimes(1);
    const callArg = mockSend.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArg["modelId"]).toBe("amazon.titan-embed-text-v1");
    expect(result).toEqual(fakeEmbedding);
  });
});

describe("createOllamaEmbeddingProvider", () => {
  it("calls the correct Ollama URL with default base URL and model", async () => {
    const fakeEmbedding = [0.4, 0.5, 0.6];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ embedding: fakeEmbedding }),
    });

    const { createOllamaEmbeddingProvider } = await import("./embedding-provider.js");
    const provider = createOllamaEmbeddingProvider();
    const result = await provider.embed("hello");

    expect(provider.name).toBe("ollama");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/embeddings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "nomic-embed-text", prompt: "hello" }),
      })
    );
    expect(result).toEqual(fakeEmbedding);
  });

  it("uses custom baseUrl and model when provided", async () => {
    const fakeEmbedding = [0.7, 0.8];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ embedding: fakeEmbedding }),
    });

    const { createOllamaEmbeddingProvider } = await import("./embedding-provider.js");
    const provider = createOllamaEmbeddingProvider({
      baseUrl: "http://myhost:11434",
      model: "mxbai-embed-large",
    });
    await provider.embed("text");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://myhost:11434/api/embeddings",
      expect.objectContaining({
        body: JSON.stringify({ model: "mxbai-embed-large", prompt: "text" }),
      })
    );
  });
});

describe("createOpenAIEmbeddingProvider", () => {
  it("calls the correct URL with Authorization header", async () => {
    const fakeEmbedding = [0.9, 1.0];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ data: [{ embedding: fakeEmbedding }] }),
    });

    const { createOpenAIEmbeddingProvider } = await import("./embedding-provider.js");
    const provider = createOpenAIEmbeddingProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-key",
    });
    const result = await provider.embed("embed me");

    expect(provider.name).toBe("openai");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-key",
        }),
        body: JSON.stringify({ model: "text-embedding-3-small", input: "embed me" }),
      })
    );
    expect(result).toEqual(fakeEmbedding);
  });

  it("uses a custom model when specified", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ data: [{ embedding: [1, 2, 3] }] }),
    });

    const { createOpenAIEmbeddingProvider } = await import("./embedding-provider.js");
    const provider = createOpenAIEmbeddingProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "key",
      model: "text-embedding-ada-002",
    });
    await provider.embed("text");

    const body = JSON.parse(
      (mockFetch.mock.calls[0]![1] as { body: string }).body
    ) as { model: string };
    expect(body.model).toBe("text-embedding-ada-002");
  });
});

describe("setEmbeddingProvider / getEmbeddingProvider", () => {
  it("round-trips: set then get returns provider with same name and working embed", async () => {
    const { setEmbeddingProvider, getEmbeddingProvider } = await import(
      "./embedding-provider.js"
    );
    const custom = {
      name: "custom",
      embed: async (_text: string) => [1, 2, 3],
    };
    setEmbeddingProvider(custom);
    const got = getEmbeddingProvider();
    // Provider is wrapped with cache — check name and functional behavior
    expect(got.name).toBe("custom");
    await expect(got.embed("hello")).resolves.toEqual([1, 2, 3]);
  });
});

describe("autoConfigureEmbeddingProvider", () => {
  it("returns Cohere provider by default (no env var set)", async () => {
    // Reset module cache to get a fresh _provider = null
    const mod = await import("./embedding-provider.js");
    // Force reset by calling with default env
    delete process.env["EMBEDDING_PROVIDER"];
    const provider = mod.autoConfigureEmbeddingProvider();
    expect(provider.name).toBe("cohere");
  });

  it("returns Ollama provider when EMBEDDING_PROVIDER=ollama", async () => {
    process.env["EMBEDDING_PROVIDER"] = "ollama";
    const mod = await import("./embedding-provider.js");
    const provider = mod.autoConfigureEmbeddingProvider();
    expect(provider.name).toBe("ollama");
  });

  it("returns OpenAI provider when EMBEDDING_PROVIDER=openai", async () => {
    process.env["EMBEDDING_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "sk-test";
    const mod = await import("./embedding-provider.js");
    const provider = mod.autoConfigureEmbeddingProvider();
    expect(provider.name).toBe("openai");
  });
});
