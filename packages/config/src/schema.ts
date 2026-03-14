import { z } from "zod";

// Secret ref: inline value OR env:/file: prefixed ref
const SecretRef = z.string().min(1);

export const SandraConfigSchema = z.object({
  // Required secrets
  telegramBotToken: SecretRef.describe("Telegram bot token from @BotFather. Supports env:/file: refs."),
  telegramWebhookSecret: SecretRef.describe("Secret token to validate Telegram webhook calls."),
  databaseUrl: SecretRef.describe("PostgreSQL connection string. Supports env:/file: refs."),
  sqsQueueUrl: z.string().url().describe("Full SQS queue URL for reminder delivery."),
  lancedbPath: z.string().min(1).describe("Filesystem path for LanceDB data directory."),

  // Optional secrets
  perplexityApiKey: SecretRef.optional().describe("Perplexity AI API key. Research degrades gracefully if absent."),
  otelEndpoint: z.string().url().optional().describe("OTLP HTTP endpoint for OpenTelemetry traces."),
  domain: z.string().optional().describe("Public hostname for Telegram webhook registration."),

  // Server config
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  channel: z.enum(["stable", "beta", "dev"]).default("stable"),

  // AWS
  awsRegion: z.string().default("ap-southeast-1"),
});

export type SandraConfig = z.infer<typeof SandraConfigSchema>;

export interface ConfigValidationIssue {
  path: string;
  message: string;
  received?: unknown;
  allowedValues?: string[];
}

/**
 * Validate a raw config object against the Sandra config schema.
 * Returns an array of issues (empty = valid).
 */
export function validateConfig(input: unknown): ConfigValidationIssue[] {
  const result = SandraConfigSchema.safeParse(input);
  if (result.success) return [];

  return result.error.issues.map((issue) => {
    const allowedValues =
      issue.code === "invalid_enum_value"
        ? (issue as z.ZodInvalidEnumValueIssue).options?.map(String)
        : undefined;

    const item: ConfigValidationIssue = {
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    };
    if ("received" in issue) item.received = issue.received;
    if (allowedValues !== undefined) item.allowedValues = allowedValues;
    return item;
  });
}

/**
 * Parse and validate config. Throws with a formatted error message on failure.
 */
export function parseConfig(input: unknown): SandraConfig {
  const issues = validateConfig(input);
  if (issues.length > 0) {
    const lines = issues.map((i) => {
      let msg = `  • ${i.path}: ${i.message}`;
      if (i.allowedValues) msg += ` (allowed: ${i.allowedValues.join(", ")})`;
      return msg;
    });
    throw new Error(`Sandra config validation failed:\n${lines.join("\n")}`);
  }
  return SandraConfigSchema.parse(input);
}

/**
 * Build a SandraConfig from process.env after secrets are loaded.
 */
export function configFromEnv(): SandraConfig {
  return parseConfig({
    telegramBotToken:       process.env["TELEGRAM_BOT_TOKEN"],
    telegramWebhookSecret:  process.env["TELEGRAM_WEBHOOK_SECRET"],
    databaseUrl:            process.env["DATABASE_URL"],
    sqsQueueUrl:            process.env["SQS_QUEUE_URL"],
    lancedbPath:            process.env["LANCEDB_PATH"],
    perplexityApiKey:       process.env["PERPLEXITY_API_KEY"],
    otelEndpoint:           process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
    domain:                 process.env["DOMAIN"],
    port:                   process.env["PORT"],
    logLevel:               process.env["LOG_LEVEL"],
    channel:                process.env["CHANNEL"],
    awsRegion:              process.env["AWS_REGION"],
  });
}
