import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("agent");

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
}

export interface LLMProvider {
  name: string;
  /** Returns true if this provider can handle the given model ID */
  supports(modelId: string): boolean;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

// ── Ollama provider ───────────────────────────────────────────────────────

export function createOllamaProvider(baseUrl?: string): LLMProvider {
  const url = baseUrl ?? process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";

  return {
    name: "ollama",
    supports(modelId) {
      // Ollama handles anything that doesn't look like an AWS Bedrock ID
      return !modelId.includes("anthropic.") && !modelId.includes("amazon.");
    },
    async complete(req) {
      log.debug("Ollama complete", { model: req.model });
      const response = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: false,
          options: {
            num_predict: req.maxTokens ?? 2048,
            temperature: req.temperature ?? 0.7,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) throw new Error(`Ollama error: HTTP ${response.status}`);

      const data = await response.json() as {
        message: { content: string };
        model: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      return {
        text: data.message.content,
        model: data.model,
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        provider: "ollama",
      };
    },
  };
}

// ── OpenAI-compatible provider ────────────────────────────────────────────

export function createOpenAICompatProvider(options?: {
  baseUrl?: string;
  apiKey?: string;
  name?: string;
}): LLMProvider {
  const baseUrl = options?.baseUrl ?? process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1";
  const apiKey = options?.apiKey ?? process.env["OPENAI_API_KEY"] ?? "";
  const providerName = options?.name ?? "openai-compat";

  return {
    name: providerName,
    supports(modelId) {
      return modelId.startsWith("gpt-") || modelId.startsWith("o1") ||
             modelId.startsWith("mistral") || modelId.startsWith("llama");
    },
    async complete(req) {
      log.debug("OpenAI-compat complete", { model: req.model, provider: providerName });
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) throw new Error(`${providerName} error: HTTP ${response.status}`);

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        model: string;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      return {
        text: data.choices[0]?.message.content ?? "",
        model: data.model,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        provider: providerName,
      };
    },
  };
}

// ── Provider registry ─────────────────────────────────────────────────────

const _providers: LLMProvider[] = [];

/** Reset the registry — for testing only */
export function _resetProviders(): void {
  _providers.length = 0;
}

export function registerProvider(provider: LLMProvider): void {
  _providers.unshift(provider); // highest priority first
  log.info("LLM provider registered", { name: provider.name });
}

export function getProviderForModel(modelId: string): LLMProvider | null {
  return _providers.find((p) => p.supports(modelId)) ?? null;
}

export function listProviders(): string[] {
  return _providers.map((p) => p.name);
}

/** Auto-register providers based on env vars */
export function autoRegisterProviders(): void {
  if (process.env["OLLAMA_BASE_URL"] || process.env["OLLAMA_ENABLED"] === "1") {
    registerProvider(createOllamaProvider());
  }
  if (process.env["OPENAI_API_KEY"] || process.env["OPENAI_BASE_URL"]) {
    registerProvider(createOpenAICompatProvider());
  }
}
