import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockExecute } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock("./db.js", () => ({
  db: { query: mockQuery, execute: mockExecute },
}));

vi.mock("./logger.js", () => ({
  createSubsystemLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  getUserModelOverride,
  setUserModelOverride,
  parseModelPreference,
} from "./user-model.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// getUserModelOverride
// ---------------------------------------------------------------------------

describe("getUserModelOverride", () => {
  it("returns the mapped Bedrock model ID when override is set", async () => {
    mockQuery.mockResolvedValue({ rows: [{ model_override: "sonnet" }] });

    const result = await getUserModelOverride("user-1");

    expect(result).toBe("anthropic.claude-sonnet-4-6");
  });

  it("returns null when model_override is null in DB", async () => {
    mockQuery.mockResolvedValue({ rows: [{ model_override: null }] });

    const result = await getUserModelOverride("user-1");

    expect(result).toBeNull();
  });

  it("returns null when no row is returned", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getUserModelOverride("user-1");

    expect(result).toBeNull();
  });

  it("returns null for an unrecognised model_override value", async () => {
    mockQuery.mockResolvedValue({ rows: [{ model_override: "unknown-model" }] });

    const result = await getUserModelOverride("user-1");

    expect(result).toBeNull();
  });

  it("issues INSERT ... ON CONFLICT DO NOTHING to ensure row exists", async () => {
    mockQuery.mockResolvedValue({ rows: [{ model_override: "haiku" }] });

    await getUserModelOverride("user-42");

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT DO NOTHING"),
      ["user-42"]
    );
  });
});

// ---------------------------------------------------------------------------
// setUserModelOverride
// ---------------------------------------------------------------------------

describe("setUserModelOverride", () => {
  it("executes upsert with user id and preference", async () => {
    await setUserModelOverride("user-1", "opus");

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (user_id) DO UPDATE"),
      ["user-1", "opus"]
    );
  });

  it("passes null when clearing the override", async () => {
    await setUserModelOverride("user-1", null);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (user_id) DO UPDATE"),
      ["user-1", null]
    );
  });
});

// ---------------------------------------------------------------------------
// parseModelPreference
// ---------------------------------------------------------------------------

describe("parseModelPreference", () => {
  it.each([
    ["haiku", "haiku"],
    ["fast", "haiku"],
    ["cheap", "haiku"],
  ])('maps "%s" to haiku', (input, expected) => {
    expect(parseModelPreference(input)).toBe(expected);
  });

  it.each([
    ["sonnet", "sonnet"],
    ["normal", "sonnet"],
    ["default", "sonnet"],
  ])('maps "%s" to sonnet', (input, expected) => {
    expect(parseModelPreference(input)).toBe(expected);
  });

  it.each([
    ["opus", "opus"],
    ["deep", "opus"],
    ["smart", "opus"],
    ["best", "opus"],
  ])('maps "%s" to opus', (input, expected) => {
    expect(parseModelPreference(input)).toBe(expected);
  });

  it.each(["clear", "reset", "auto", "none"])(
    'maps "%s" to null',
    (input) => {
      expect(parseModelPreference(input)).toBeNull();
    }
  );

  it("returns undefined for an unknown keyword", () => {
    expect(parseModelPreference("turbo")).toBeUndefined();
    expect(parseModelPreference("gpt4")).toBeUndefined();
    expect(parseModelPreference("")).toBeUndefined();
  });

  it("handles input with surrounding whitespace", () => {
    expect(parseModelPreference("  haiku  ")).toBe("haiku");
  });

  it("handles mixed-case input", () => {
    expect(parseModelPreference("SONNET")).toBe("sonnet");
    expect(parseModelPreference("Opus")).toBe("opus");
  });
});
