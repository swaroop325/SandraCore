import type { HookHandler, BootEvent } from "../types.js";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("hooks:boot-md");

const REQUIRED_ENV = [
  "BEDROCK_REGION",
  "LANCEDB_PATH",
  "DATABASE_URL",
];

const OPTIONAL_ENV = [
  "ELEVENLABS_API_KEY",
  "OPENAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "SLACK_BOT_TOKEN",
  "DISCORD_TOKEN",
  "LANCEDB_FTS_PATH",
  "EMBEDDING_PROVIDER",
];

export const bootMdHook: HookHandler<BootEvent> = async (event) => {
  const lines: string[] = [
    `┌─── Sandra ${event.version} — ${event.service} ────────────────────────`,
    `│ env: ${event.nodeEnv}`,
    "│",
    "│ Required:",
  ];

  for (const key of REQUIRED_ENV) {
    const set = Boolean(process.env[key]);
    lines.push(`│   ${set ? "✓" : "✗"} ${key}`);
  }

  lines.push("│");
  lines.push("│ Optional:");

  for (const key of OPTIONAL_ENV) {
    const set = Boolean(process.env[key]);
    lines.push(`│   ${set ? "✓" : "·"} ${key}`);
  }

  lines.push("└────────────────────────────────────────────────────");

  log.info(lines.join("\n"));
};
