export const REGION = "ap-southeast-1";

export const MODELS = {
  HAIKU: "anthropic.claude-haiku-4-5-20251001",
  SONNET: "anthropic.claude-sonnet-4-6",
  OPUS: "anthropic.claude-opus-4-6",
  TITAN_EMBED: "amazon.titan-embed-text-v1",
} as const;

export const BEDROCK_VERSION = "bedrock-2023-05-31";

export const MEMORY_TABLE = "memories";
export const EMBEDDING_DIM = 1536;

export const SHORT_TERM_LIMIT = 20;
export const SEMANTIC_RECALL_LIMIT = 5;

export const SQS_MAX_DELAY_SECS = 900; // 15 minutes
