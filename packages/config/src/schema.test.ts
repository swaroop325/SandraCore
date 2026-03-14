import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateConfig, parseConfig, configFromEnv } from "./schema.js";

const validBase = {
  telegramBotToken: "123456:ABC",
  telegramWebhookSecret: "my-secret",
  databaseUrl: "postgres://user:pass@localhost:5432/sandra",
  sqsQueueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/queue",
  lancedbPath: "/var/sandra/lancedb",
};

describe("validateConfig", () => {
  it("returns empty array for valid config", () => {
    expect(validateConfig(validBase)).toEqual([]);
  });

  it("reports missing required fields", () => {
    const issues = validateConfig({});
    const paths = issues.map((i) => i.path);
    expect(paths).toContain("telegramBotToken");
    expect(paths).toContain("databaseUrl");
  });

  it("reports invalid enum for logLevel", () => {
    const issues = validateConfig({ ...validBase, logLevel: "verbose" });
    const logIssue = issues.find((i) => i.path === "logLevel");
    expect(logIssue).toBeDefined();
    expect(logIssue?.allowedValues).toContain("debug");
  });

  it("reports invalid URL for sqsQueueUrl", () => {
    const issues = validateConfig({ ...validBase, sqsQueueUrl: "not-a-url" });
    expect(issues.some((i) => i.path === "sqsQueueUrl")).toBe(true);
  });

  it("coerces port string to number", () => {
    const issues = validateConfig({ ...validBase, port: "3001" });
    expect(issues).toEqual([]);
  });

  it("applies defaults for optional fields", () => {
    const config = parseConfig(validBase);
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe("info");
    expect(config.channel).toBe("stable");
  });
});

describe("parseConfig", () => {
  it("throws on invalid config with formatted message", () => {
    expect(() => parseConfig({})).toThrow("config validation failed");
  });

  it("returns parsed config for valid input", () => {
    const config = parseConfig(validBase);
    expect(config.telegramBotToken).toBe("123456:ABC");
    expect(config.awsRegion).toBe("ap-southeast-1");
  });
});

describe("configFromEnv", () => {
  const envBackup: Record<string, string | undefined> = {};
  const envKeys = [
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "DATABASE_URL",
    "SQS_QUEUE_URL", "LANCEDB_PATH",
  ];

  beforeEach(() => {
    for (const k of envKeys) envBackup[k] = process.env[k];
    process.env["TELEGRAM_BOT_TOKEN"] = "123456:ABC";
    process.env["TELEGRAM_WEBHOOK_SECRET"] = "secret";
    process.env["DATABASE_URL"] = "postgres://localhost/test";
    process.env["SQS_QUEUE_URL"] = "https://sqs.ap-southeast-1.amazonaws.com/123/q";
    process.env["LANCEDB_PATH"] = "/tmp/lancedb";
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
  });

  it("builds config from process.env", () => {
    const config = configFromEnv();
    expect(config.telegramBotToken).toBe("123456:ABC");
    expect(config.lancedbPath).toBe("/tmp/lancedb");
  });
});
