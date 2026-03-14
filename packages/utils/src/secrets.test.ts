import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      SecretString: JSON.stringify({ PERPLEXITY_API_KEY: "test-key", DATABASE_URL: "postgres://test" }),
    }),
  })),
  GetSecretValueCommand: vi.fn(),
}));

beforeEach(async () => {
  const { _resetSecretsLoader } = await import("./secrets.js");
  _resetSecretsLoader();
  delete process.env["PERPLEXITY_API_KEY"];
  delete process.env["DATABASE_URL"];
});

describe("loadSecrets", () => {
  it("loads secrets into process.env", async () => {
    const { loadSecrets } = await import("./secrets.js");
    await loadSecrets();
    expect(process.env["PERPLEXITY_API_KEY"]).toBe("test-key");
    expect(process.env["DATABASE_URL"]).toBe("postgres://test");
  });

  it("is idempotent — only calls AWS once", async () => {
    const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
    const { loadSecrets } = await import("./secrets.js");
    await loadSecrets();
    await loadSecrets();
    const instance = (SecretsManagerClient as any).mock.results[0].value;
    expect(instance.send).toHaveBeenCalledTimes(1);
  });
});
