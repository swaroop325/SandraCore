import { db } from "./db.js";

export interface UsageRecord {
  userId: string;
  sessionId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  recordedAt: Date;
}

// Approximate cost per 1M tokens (USD) — update as pricing changes
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "anthropic.claude-haiku-4-5-20251001": { input: 0.80,  output: 4.00  },
  "anthropic.claude-sonnet-4-6":         { input: 3.00,  output: 15.00 },
  "anthropic.claude-opus-4-6":           { input: 15.00, output: 75.00 },
};

function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_COSTS[modelId] ?? { input: 3.00, output: 15.00 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

/**
 * Record token usage after an LLM call.
 * Best-effort — never throws. Logging only.
 */
export async function recordUsage(
  userId: string,
  sessionId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  try {
    const estimatedCostUsd = estimateCost(modelId, inputTokens, outputTokens);
    await db.execute(
      `INSERT INTO llm_usage (user_id, session_id, model_id, input_tokens, output_tokens, estimated_cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, sessionId, modelId, inputTokens, outputTokens, estimatedCostUsd]
    );
  } catch {
    // Best-effort — don't break the main flow
  }
}

/**
 * Get total usage stats for a user.
 */
export async function getUserUsage(userId: string): Promise<{
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  calls: number;
}> {
  const res = await db.query<{
    total_input: string;
    total_output: string;
    total_cost: string;
    calls: string;
  }>(
    `SELECT
       COALESCE(SUM(input_tokens), 0) AS total_input,
       COALESCE(SUM(output_tokens), 0) AS total_output,
       COALESCE(SUM(estimated_cost_usd), 0) AS total_cost,
       COUNT(*) AS calls
     FROM llm_usage
     WHERE user_id = $1`,
    [userId]
  );
  const row = res.rows[0];
  if (!row) return { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0, calls: 0 };
  return {
    totalInputTokens: Number(row.total_input),
    totalOutputTokens: Number(row.total_output),
    totalCostUsd: Number(row.total_cost),
    calls: Number(row.calls),
  };
}
