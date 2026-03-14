import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({ checkDB: vi.fn().mockResolvedValue(true), db: { query: vi.fn(), execute: vi.fn() } }));
vi.mock("./sqs.js", () => ({ checkSQS: vi.fn().mockResolvedValue(true), sqsClient: {} }));
vi.mock("fs/promises", () => ({ access: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ body: Buffer.from("{}") }),
  })),
  InvokeModelCommand: vi.fn().mockImplementation((p) => p),
}));
vi.mock("@sandra/core", () => ({
  REGION: "ap-southeast-1",
  MODELS: { HAIKU: "anthropic.claude-haiku-4-5-20251001" },
  BEDROCK_VERSION: "bedrock-2023-05-31",
}));

describe("getHealthReport", () => {
  beforeEach(() => {
    process.env["LANCEDB_PATH"] = "/tmp/lancedb";
  });

  it("returns ok when all subsystems healthy", async () => {
    const { getHealthReport } = await import("./health.js");
    const report = await getHealthReport();
    expect(report.status).toBe("ok");
    expect(report.subsystems.database.status).toBe("ok");
    expect(report.subsystems.sqs.status).toBe("ok");
  });

  it("includes timestamp and channel", async () => {
    const { getHealthReport } = await import("./health.js");
    const report = await getHealthReport();
    expect(report.timestamp).toBeTruthy();
    expect(typeof report.channel).toBe("string");
  });

  it("returns degraded when database is down", async () => {
    const { checkDB } = await import("./db.js");
    (checkDB as any).mockResolvedValueOnce(false);
    const { getHealthReport } = await import("./health.js");
    const report = await getHealthReport();
    expect(["degraded", "down"]).toContain(report.status);
  });

  it("lancedb shows degraded when LANCEDB_PATH not set", async () => {
    delete process.env["LANCEDB_PATH"];
    const { getHealthReport } = await import("./health.js");
    const report = await getHealthReport();
    expect(report.subsystems.lancedb.status).toBe("degraded");
  });
});
