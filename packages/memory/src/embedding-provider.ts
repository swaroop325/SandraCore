import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { REGION, MODELS } from "@sandra/core";
import { createEmbeddingCache } from "./embedding-cache.js";

export interface EmbeddingProvider {
  name: string;
  embed(text: string): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
}

// --- Bedrock Titan (existing behavior) ---

export function createBedrockEmbeddingProvider(): EmbeddingProvider {
  const client = new BedrockRuntimeClient({ region: REGION });

  return {
    name: "bedrock",
    async embed(text: string): Promise<number[]> {
      const res = await client.send(
        new InvokeModelCommand({
          modelId: MODELS.TITAN_EMBED,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({ inputText: text }),
        })
      );
      const parsed = JSON.parse(Buffer.from(res.body).toString()) as {
        embedding: number[];
      };
      return parsed.embedding;
    },
  };
}

// --- Ollama ---

export function createOllamaEmbeddingProvider(options?: {
  baseUrl?: string;
  model?: string;
}): EmbeddingProvider {
  const baseUrl = options?.baseUrl ?? "http://localhost:11434";
  const model = options?.model ?? "nomic-embed-text";

  return {
    name: "ollama",
    async embed(text: string): Promise<number[]> {
      const res = await fetch(`${baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text }),
      });
      const json = (await res.json()) as { embedding: number[] };
      return json.embedding;
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return Promise.all(texts.map((t) => this.embed(t)));
    },
  };
}

// --- OpenAI-compatible ---

export function createOpenAIEmbeddingProvider(options: {
  baseUrl: string;
  apiKey: string;
  model?: string;
}): EmbeddingProvider {
  const { baseUrl, apiKey } = options;
  const model = options.model ?? "text-embedding-3-small";

  return {
    name: "openai",
    async embed(text: string): Promise<number[]> {
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: text }),
      });
      const json = (await res.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      return json.data[0]!.embedding;
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
      const json = (await res.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      return json.data.map((d) => d.embedding);
    },
  };
}

// --- Voyage AI ---
export function createVoyageEmbeddingProvider(options: {
  apiKey: string;
  model?: string;
}): EmbeddingProvider {
  const { apiKey } = options;
  const model = options.model ?? "voyage-4-large";

  return {
    name: "voyage",
    async embed(text: string): Promise<number[]> {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: [text] }),
      });
      if (!res.ok) throw new Error(`Voyage AI error: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return json.data[0]!.embedding;
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) throw new Error(`Voyage AI error: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return json.data.map((d) => d.embedding);
    },
  };
}

// --- Google Gemini ---
export function createGeminiEmbeddingProvider(options: {
  apiKey: string;
  model?: string;
}): EmbeddingProvider {
  const { apiKey } = options;
  const model = options.model ?? "text-embedding-004";

  return {
    name: "gemini",
    async embed(text: string): Promise<number[]> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
      });
      if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { embedding: { values: number[] } };
      return json.embedding.values;
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      // Gemini batch endpoint
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((t) => ({
            model: `models/${model}`,
            content: { parts: [{ text: t }] },
          })),
        }),
      });
      if (!res.ok) throw new Error(`Gemini batch error: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { embeddings: Array<{ values: number[] }> };
      return json.embeddings.map((e) => e.values);
    },
  };
}

// --- Mistral ---
export function createMistralEmbeddingProvider(options: {
  apiKey: string;
  model?: string;
}): EmbeddingProvider {
  const { apiKey } = options;
  const model = options.model ?? "mistral-embed";

  return {
    name: "mistral",
    async embed(text: string): Promise<number[]> {
      const res = await fetch("https://api.mistral.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: [text] }),
      });
      if (!res.ok) throw new Error(`Mistral error: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return json.data[0]!.embedding;
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      const res = await fetch("https://api.mistral.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) throw new Error(`Mistral error: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return json.data.map((d) => d.embedding);
    },
  };
}

// --- Registry ---

let _provider: EmbeddingProvider | null = null;
let _cache: ReturnType<typeof createEmbeddingCache> | null = null;

function getCache(): ReturnType<typeof createEmbeddingCache> {
  if (_cache === null) {
    const cachePath = process.env["EMBEDDING_CACHE_PATH"];
    _cache = createEmbeddingCache(cachePath);
  }
  return _cache;
}

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  const cache = getCache();
  _provider = {
    ...provider,
    embed: async (text: string) => {
      const cached = cache.get(text);
      if (cached !== null) return cached;
      const vector = await provider.embed(text);
      cache.set(text, vector);
      return vector;
    },
  };
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!_provider) {
    return autoConfigureEmbeddingProvider();
  }
  return _provider;
}

/**
 * Auto-configure from environment:
 *  EMBEDDING_PROVIDER=bedrock|ollama|openai|voyage|gemini|mistral
 *  OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL
 *  OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_EMBED_MODEL
 *  VOYAGE_API_KEY, VOYAGE_EMBED_MODEL
 *  GEMINI_API_KEY, GEMINI_EMBED_MODEL
 *  MISTRAL_API_KEY, MISTRAL_EMBED_MODEL
 */
export function autoConfigureEmbeddingProvider(): EmbeddingProvider {
  const envProvider = process.env["EMBEDDING_PROVIDER"];

  let provider: EmbeddingProvider;

  if (envProvider === "ollama") {
    const ollamaOpts: { baseUrl?: string; model?: string } = {};
    const ollamaUrl = process.env["OLLAMA_BASE_URL"];
    const ollamaModel = process.env["OLLAMA_EMBED_MODEL"];
    if (ollamaUrl !== undefined) ollamaOpts.baseUrl = ollamaUrl;
    if (ollamaModel !== undefined) ollamaOpts.model = ollamaModel;
    provider = createOllamaEmbeddingProvider(ollamaOpts);
  } else if (envProvider === "openai") {
    const baseUrl =
      process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
    const apiKey = process.env["OPENAI_API_KEY"] ?? "";
    const model = process.env["OPENAI_EMBED_MODEL"];
    provider = createOpenAIEmbeddingProvider({
      baseUrl,
      apiKey,
      ...(model !== undefined ? { model } : {}),
    });
  } else if (envProvider === "voyage") {
    const apiKey = process.env["VOYAGE_API_KEY"] ?? "";
    const model = process.env["VOYAGE_EMBED_MODEL"];
    provider = createVoyageEmbeddingProvider({ apiKey, ...(model !== undefined ? { model } : {}) });
  } else if (envProvider === "gemini") {
    const apiKey = process.env["GEMINI_API_KEY"] ?? "";
    const model = process.env["GEMINI_EMBED_MODEL"];
    provider = createGeminiEmbeddingProvider({ apiKey, ...(model !== undefined ? { model } : {}) });
  } else if (envProvider === "mistral") {
    const apiKey = process.env["MISTRAL_API_KEY"] ?? "";
    const model = process.env["MISTRAL_EMBED_MODEL"];
    provider = createMistralEmbeddingProvider({ apiKey, ...(model !== undefined ? { model } : {}) });
  } else {
    provider = createBedrockEmbeddingProvider();
  }

  setEmbeddingProvider(provider);
  return _provider!;
}
