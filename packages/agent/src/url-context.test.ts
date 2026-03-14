import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExtractUrls, mockWebFetch } = vi.hoisted(() => ({
  mockExtractUrls: vi.fn(),
  mockWebFetch: vi.fn(),
}));

vi.mock("@sandra/tools", () => ({
  extractUrls: mockExtractUrls,
  webFetch: mockWebFetch,
}));

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { buildUrlContext } from "./url-context.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildUrlContext", () => {
  it("returns null when no URLs in text", async () => {
    mockExtractUrls.mockReturnValue([]);
    const result = await buildUrlContext("Hello, no links here.");
    expect(result).toBeNull();
    expect(mockWebFetch).not.toHaveBeenCalled();
  });

  it("returns formatted context when webFetch succeeds", async () => {
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockWebFetch.mockResolvedValue({ success: true, text: "Page content here." });

    const result = await buildUrlContext("Check this: https://example.com");

    expect(result).toBe(
      "[Context from https://example.com]\nPage content here.\n[End context]"
    );
  });

  it("returns null when webFetch returns success: false", async () => {
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockWebFetch.mockResolvedValue({ success: false, error: "timeout" });

    const result = await buildUrlContext("https://example.com");
    expect(result).toBeNull();
  });

  it("returns null when webFetch returns no text", async () => {
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockWebFetch.mockResolvedValue({ success: true });

    const result = await buildUrlContext("https://example.com");
    expect(result).toBeNull();
  });

  it("trims content to MAX_CONTENT_CHARS (3000)", async () => {
    const longText = "x".repeat(5000);
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockWebFetch.mockResolvedValue({ success: true, text: longText });

    const result = await buildUrlContext("https://example.com");

    expect(result).not.toBeNull();
    // The trimmed content should be exactly 3000 chars
    const content = result!
      .replace("[Context from https://example.com]\n", "")
      .replace("\n[End context]", "");
    expect(content).toHaveLength(3000);
  });

  it("only processes the first URL, not multiple", async () => {
    mockExtractUrls.mockReturnValue([
      "https://first.com",
      "https://second.com",
    ]);
    mockWebFetch.mockResolvedValue({ success: true, text: "First page." });

    await buildUrlContext("https://first.com and https://second.com");

    expect(mockWebFetch).toHaveBeenCalledTimes(1);
    expect(mockWebFetch).toHaveBeenCalledWith("https://first.com");
  });

  it("returns null and logs when webFetch throws", async () => {
    mockExtractUrls.mockReturnValue(["https://example.com"]);
    mockWebFetch.mockRejectedValue(new Error("network error"));

    const result = await buildUrlContext("https://example.com");
    expect(result).toBeNull();
  });
});
