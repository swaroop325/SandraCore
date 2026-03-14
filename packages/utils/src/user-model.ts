import { db } from "./db.js";
import { createSubsystemLogger } from "./logger.js";

const log = createSubsystemLogger("utils");

export type ModelPreference = "haiku" | "sonnet" | "opus" | null;

const MODEL_MAP: Record<string, string> = {
  haiku:  "anthropic.claude-haiku-4-5-20251001",
  sonnet: "anthropic.claude-sonnet-4-6",
  opus:   "anthropic.claude-opus-4-6",
};

/**
 * Get the user's model override as a Bedrock model ID, or null if not set.
 */
export async function getUserModelOverride(userId: string): Promise<string | null> {
  // Ensure a row exists for the user
  await db.execute(
    `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [userId]
  );

  const res = await db.query<{ model_override: string | null }>(
    `SELECT model_override FROM user_settings WHERE user_id = $1`,
    [userId]
  );

  const override = res.rows[0]?.model_override ?? null;
  if (!override) return null;

  return MODEL_MAP[override] ?? null;
}

/**
 * Set a user's model preference. Pass null to clear the override.
 */
export async function setUserModelOverride(userId: string, preference: ModelPreference): Promise<void> {
  await db.execute(
    `INSERT INTO user_settings (user_id, model_override) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET model_override = EXCLUDED.model_override`,
    [userId, preference]
  );
  log.debug("setUserModelOverride", { userId, preference });
}

/**
 * Parse a model preference string from user input.
 * Accepts "haiku", "fast", "sonnet", "normal", "opus", "deep", "clear", "reset", "auto"
 * Returns null for clear/reset/auto.
 * Returns undefined if input is not a recognised preference keyword.
 */
export function parseModelPreference(input: string): ModelPreference | undefined {
  const normalised = input.trim().toLowerCase();

  switch (normalised) {
    case "haiku":
    case "fast":
    case "cheap":
      return "haiku";

    case "sonnet":
    case "normal":
    case "default":
      return "sonnet";

    case "opus":
    case "deep":
    case "smart":
    case "best":
      return "opus";

    case "clear":
    case "reset":
    case "auto":
    case "none":
      return null;

    default:
      return undefined;
  }
}
