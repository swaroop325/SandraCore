import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getLinkPreview, extractUrls } from "./link-preview.js";

beforeEach(() => { vi.clearAllMocks(); });

describe("getLinkPreview", () => {
  it("extracts og:title and og:description", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "text/html" },
      text: () => Promise.resolve(`
        <html><head>
          <title>Page Title</title>
          <meta property="og:title" content="OG Title" />
          <meta property="og:description" content="OG Desc" />
        </head></html>
      `),
    });
    const result = await getLinkPreview("https://example.com");
    expect(result.title).toBe("OG Title");
    expect(result.description).toBe("OG Desc");
  });

  it("falls back to <title> tag", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "text/html" },
      text: () => Promise.resolve("<title>Fallback Title</title>"),
    });
    const result = await getLinkPreview("https://example.com");
    expect(result.title).toBe("Fallback Title");
  });

  it("blocks localhost", async () => {
    await expect(getLinkPreview("http://localhost:8080")).rejects.toThrow("not allowed");
  });

  it("blocks private IP", async () => {
    await expect(getLinkPreview("http://192.168.1.1")).rejects.toThrow("not allowed");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(getLinkPreview("https://example.com/missing")).rejects.toThrow("404");
  });
});

describe("extractUrls", () => {
  it("extracts URLs from text", () => {
    const urls = extractUrls("Check https://example.com and http://test.org/path");
    expect(urls).toContain("https://example.com");
    expect(urls).toContain("http://test.org/path");
  });

  it("deduplicates URLs", () => {
    const urls = extractUrls("https://x.com https://x.com");
    expect(urls).toHaveLength(1);
  });

  it("returns empty for no URLs", () => {
    expect(extractUrls("no urls here")).toEqual([]);
  });
});
