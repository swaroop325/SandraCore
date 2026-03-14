export const REGION = "ap-southeast-1";

export const MODELS = {
  HAIKU: process.env["BEDROCK_HAIKU_MODEL"] ?? "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  SONNET: process.env["BEDROCK_SONNET_MODEL"] ?? process.env["ANTHROPIC_MODEL"] ?? "global.anthropic.claude-sonnet-4-6",
  OPUS: process.env["BEDROCK_OPUS_MODEL"] ?? "global.anthropic.claude-opus-4-6-v1",
  TITAN_EMBED: "amazon.titan-embed-text-v1",
} as const;

export const BEDROCK_VERSION = "bedrock-2023-05-31";

export const MEMORY_TABLE = "memories";
export const EMBEDDING_DIM = Number(process.env["EMBEDDING_DIM"] ?? 1024);

export const SHORT_TERM_LIMIT = 20;
export const SEMANTIC_RECALL_LIMIT = 5;

export const SQS_MAX_DELAY_SECS = 900; // 15 minutes
