import type { Message } from "@sandra/memory";

// Bedrock Anthropic models use roughly 3.5-4 chars per token on average.
// We use 4 chars/token as a conservative estimate for budget checks.
const CHARS_PER_TOKEN = 4;

// Context window limits per model (in tokens)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "anthropic.claude-haiku-4-5-20251001": 200_000,
  "anthropic.claude-sonnet-4-6":         200_000,
  "anthropic.claude-opus-4-6":           200_000,
};

const DEFAULT_LIMIT = 180_000;

// Safety margin: we use 80% of the limit before compacting
const SAFETY_FACTOR = 0.8;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

export function getContextLimit(modelId: string): number {
  return MODEL_CONTEXT_LIMITS[modelId] ?? DEFAULT_LIMIT;
}

export function getBudget(modelId: string): number {
  return Math.floor(getContextLimit(modelId) * SAFETY_FACTOR);
}

export function isOverBudget(messages: Message[], modelId: string): boolean {
  return estimateMessagesTokens(messages) > getBudget(modelId);
}

export function trimToFit(messages: Message[], modelId: string): Message[] {
  const budget = getBudget(modelId);
  const result: Message[] = [];
  let tokens = 0;
  // Walk from newest to oldest, fill budget
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateTokens(messages[i]!.content) + 4;
    if (tokens + t > budget) break;
    result.unshift(messages[i]!);
    tokens += t;
  }
  return result;
}
