import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { webSearch } from "./web-search.js";

beforeEach(() => {
  process.env["PERPLEXITY_API_KEY"] = "test-key";
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env["PERPLEXITY_API_KEY"];
});

describe("webSearch", () => {
  it("returns answer and citations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "The answer is 42." } }],
        citations: ["https://example.com/source"],
      }),
    });

    const result = await webSearch("What is the meaning of life?");
    expect(result.answer).toBe("The answer is 42.");
    expect(result.citations).toEqual(["https://example.com/source"]);
    expect(result.query).toBe("What is the meaning of life?");
  });

  it("throws when API key not set", async () => {
    delete process.env["PERPLEXITY_API_KEY"];
    await expect(webSearch("test")).rejects.toThrow("PERPLEXITY_API_KEY");
  });

  it("throws on empty query", async () => {
    await expect(webSearch("   ")).rejects.toThrow("empty");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(webSearch("test query")).rejects.toThrow("429");
  });
});
