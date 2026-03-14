import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("parseSecretRef", () => {
  it("parses env: prefix", async () => {
    const { parseSecretRef } = await import("./secret-ref.js");
    expect(parseSecretRef("env:MY_VAR")).toEqual({ format: "env", target: "MY_VAR" });
  });

  it("parses file: prefix", async () => {
    const { parseSecretRef } = await import("./secret-ref.js");
    expect(parseSecretRef("file:/run/secrets/token")).toEqual({
      format: "file",
      target: "/run/secrets/token",
    });
  });

  it("treats bare string as inline", async () => {
    const { parseSecretRef } = await import("./secret-ref.js");
    expect(parseSecretRef("my-secret-value")).toEqual({
      format: "inline",
      target: "my-secret-value",
    });
  });
});

describe("resolveSecretRef", () => {
  beforeEach(() => {
    process.env["TEST_SECRET"] = "hello-world";
  });
  afterEach(() => {
    delete process.env["TEST_SECRET"];
  });

  it("resolves env: ref", async () => {
    const { resolveSecretRef } = await import("./secret-ref.js");
    const result = resolveSecretRef("env:TEST_SECRET");
    expect(result.value).toBe("hello-world");
    expect(result.format).toBe("env");
  });

  it("throws for missing env var", async () => {
    const { resolveSecretRef } = await import("./secret-ref.js");
    expect(() => resolveSecretRef("env:NONEXISTENT_VAR_XYZ")).toThrow(
      "is not set"
    );
  });

  it("resolves inline ref", async () => {
    const { resolveSecretRef } = await import("./secret-ref.js");
    const result = resolveSecretRef("my-api-key");
    expect(result.value).toBe("my-api-key");
    expect(result.format).toBe("inline");
  });

  it("rejects path traversal in file ref", async () => {
    const { resolveSecretRef } = await import("./secret-ref.js");
    expect(() => resolveSecretRef("file:../../etc/passwd")).toThrow(
      "path traversal"
    );
  });

  it("throws for empty inline value", async () => {
    const { resolveSecretRef } = await import("./secret-ref.js");
    expect(() => resolveSecretRef("  ")).toThrow();
  });
});

describe("resolveOptionalSecretRef", () => {
  it("returns undefined for undefined input", async () => {
    const { resolveOptionalSecretRef } = await import("./secret-ref.js");
    expect(resolveOptionalSecretRef(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", async () => {
    const { resolveOptionalSecretRef } = await import("./secret-ref.js");
    expect(resolveOptionalSecretRef("")).toBeUndefined();
  });

  it("returns resolved value for valid ref", async () => {
    process.env["OPT_SECRET"] = "opt-value";
    const { resolveOptionalSecretRef } = await import("./secret-ref.js");
    expect(resolveOptionalSecretRef("env:OPT_SECRET")).toBe("opt-value");
    delete process.env["OPT_SECRET"];
  });

  it("returns undefined (no throw) for invalid ref", async () => {
    const { resolveOptionalSecretRef } = await import("./secret-ref.js");
    expect(resolveOptionalSecretRef("env:TOTALLY_MISSING_XYZ")).toBeUndefined();
  });
});

describe("redactSecrets", () => {
  it("redacts secret values from message", async () => {
    const { redactSecrets } = await import("./secret-ref.js");
    const result = redactSecrets("Token is abc123xyz in the logs", ["abc123xyz"]);
    expect(result).toBe("Token is [REDACTED] in the logs");
  });

  it("skips secrets shorter than 4 chars", async () => {
    const { redactSecrets } = await import("./secret-ref.js");
    const result = redactSecrets("value is ok", ["ok"]);
    expect(result).toBe("value is ok");
  });

  it("redacts multiple occurrences", async () => {
    const { redactSecrets } = await import("./secret-ref.js");
    const result = redactSecrets("key=secret key=secret", ["secret"]);
    expect(result).toBe("key=[REDACTED] key=[REDACTED]");
  });
});
