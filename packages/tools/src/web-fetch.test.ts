import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  process.env["PERPLEXITY_API_KEY"] = "test-key";
  vi.clearAllMocks();
});

describe("webFetch", () => {
  it("returns readable content from HTML", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "text/html" },
      text: async () => "<html><head><title>Test Page</title></head><body><p>Hello world</p></body></html>",
    });
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("https://example.com");
    expect(result.success).toBe(true);
    expect(result.title).toBe("Test Page");
    expect(result.text).toContain("Hello world");
    expect(result.text).not.toContain("<");
  });

  it("strips script and style tags", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "text/html" },
      text: async () => "<html><script>evil()</script><style>.foo{}</style><p>clean</p></html>",
    });
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("https://example.com/page");
    expect(result.success).toBe(true);
    expect(result.text).not.toContain("evil()");
    expect(result.text).not.toContain(".foo");
    expect(result.text).toContain("clean");
  });

  it("returns error for invalid URL", async () => {
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("not-a-url");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  it("returns error for non-http protocol", async () => {
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("ftp://example.com");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("returns error on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => "text/html" } });
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("https://example.com/missing");
    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 404");
  });

  it("blocks localhost URLs", async () => {
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("http://localhost:8080/secret");
    expect(result.success).toBe(false);
    expect(result.error).toContain("localhost");
  });

  it("blocks private network URLs", async () => {
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("http://192.168.1.1/admin");
    expect(result.success).toBe(false);
  });

  it("blocks cloud metadata endpoint", async () => {
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("http://169.254.169.254/latest/meta-data");
    expect(result.success).toBe(false);
  });

  it("blocks file:// protocol", async () => {
    const { webFetch } = await import("./web-fetch.js");
    const result = await webFetch("file:///etc/passwd");
    expect(result.success).toBe(false);
  });
});
