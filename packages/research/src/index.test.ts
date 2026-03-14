import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  process.env["PERPLEXITY_API_KEY"] = "test-key";
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: "Test research result" } }],
    }),
  });
});

describe("research()", () => {
  it("returns content from Perplexity", async () => {
    const { research } = await import("./index.js");
    const result = await research("What is the capital of France?");
    expect(result).toBe("Test research result");
  });

  it("calls correct Perplexity endpoint", async () => {
    const { research } = await import("./index.js");
    await research("test query");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.perplexity.ai/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws when API returns error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    const { research } = await import("./index.js");
    await expect(research("test")).rejects.toThrow();
  });
});
