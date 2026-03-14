import { checkDB } from "./db.js";
import { checkSQS } from "./sqs.js";
import { createSubsystemLogger } from "./logger.js";

const log = createSubsystemLogger("health");

export type HealthStatus = "ok" | "degraded" | "down";

export interface SubsystemHealth {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  channel: string;
  subsystems: {
    database: SubsystemHealth;
    sqs: SubsystemHealth;
    lancedb: SubsystemHealth;
    bedrock: SubsystemHealth;
  };
}

async function checkWithTiming(fn: () => Promise<boolean>): Promise<SubsystemHealth> {
  const start = Date.now();
  try {
    const ok = await fn();
    const latencyMs = Date.now() - start;
    return ok
      ? { status: "ok", latencyMs }
      : { status: "down", latencyMs, error: "Health probe returned false" };
  } catch (err: unknown) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkLanceDB(): Promise<SubsystemHealth> {
  const path = process.env["LANCEDB_PATH"];
  if (!path) return { status: "degraded", error: "LANCEDB_PATH not set" };
  const start = Date.now();
  try {
    const { access } = await import("fs/promises");
    await access(path);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err: unknown) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "LanceDB path not accessible",
    };
  }
}

async function checkBedrock(): Promise<SubsystemHealth> {
  const start = Date.now();
  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const { REGION, MODELS, BEDROCK_VERSION } = await import("@sandra/core");
    const client = new BedrockRuntimeClient({ region: REGION });
    const body = {
      anthropic_version: BEDROCK_VERSION,
      max_tokens: 1,
      messages: [{ role: "user", content: "." }],
    };
    await client.send(new InvokeModelCommand({
      modelId: MODELS.HAIKU,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    }));
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err: unknown) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Bedrock check failed",
    };
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  log.info("Running health check");

  const [database, sqs, lancedb, bedrock] = await Promise.all([
    checkWithTiming(checkDB),
    checkWithTiming(checkSQS),
    checkLanceDB(),
    checkBedrock(),
  ]);

  const subsystems = { database, sqs, lancedb, bedrock };
  const statuses = Object.values(subsystems).map((s) => s.status);

  const status: HealthStatus =
    statuses.every((s) => s === "ok")
      ? "ok"
      : statuses.some((s) => s === "down")
      ? "degraded"
      : "degraded";

  const report: HealthReport = {
    status,
    timestamp: new Date().toISOString(),
    channel: process.env["CHANNEL"] ?? "unknown",
    subsystems,
  };

  log.info("Health check complete", { status });

  return report;
}
