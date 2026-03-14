import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted — use vi.hoisted() to define mocks referenced in the factory
const { mockReadFile } = vi.hoisted(() => {
  return { mockReadFile: vi.fn() };
});

vi.mock("fs/promises", () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile,
}));

// Import the module once — we will use _setPdfParse to inject mocks
import { readPdf, _setPdfParse } from "./pdf-tool.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the injected pdf-parse mock after each test
  _setPdfParse(null);
});

describe("readPdf", () => {
  it("success path — file path string: reads file and returns text + pages", async () => {
    const fakeBuffer = Buffer.from("fake pdf bytes");
    mockReadFile.mockResolvedValueOnce(fakeBuffer);

    const mockPdfParse = vi.fn().mockResolvedValueOnce({ text: "  Hello PDF world  ", numpages: 3 });
    _setPdfParse(mockPdfParse);

    const result = await readPdf("/tmp/test.pdf");

    expect(mockReadFile).toHaveBeenCalledWith("/tmp/test.pdf");
    expect(mockPdfParse).toHaveBeenCalledWith(fakeBuffer);
    expect(result).toEqual({ text: "Hello PDF world", pages: 3, success: true });
  });

  it("success path — Buffer input: uses buffer directly without file read", async () => {
    const buf = Buffer.from("pdf buffer data");

    const mockPdfParse = vi.fn().mockResolvedValueOnce({ text: "Extracted text", numpages: 1 });
    _setPdfParse(mockPdfParse);

    const result = await readPdf(buf);

    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockPdfParse).toHaveBeenCalledWith(buf);
    expect(result).toEqual({ text: "Extracted text", pages: 1, success: true });
  });

  it("error path — readFile throws: returns success false with error message", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT: no such file"));
    // No pdf-parse needed — readFile throws before it is called

    const result = await readPdf("/tmp/missing.pdf");

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(result.pages).toBe(0);
    expect(result.error).toContain("ENOENT");
  });

  it("error path — pdf-parse throws: returns success false with error message", async () => {
    const fakeBuffer = Buffer.from("bad pdf");
    mockReadFile.mockResolvedValueOnce(fakeBuffer);

    const mockPdfParse = vi.fn().mockRejectedValueOnce(new Error("Invalid PDF structure"));
    _setPdfParse(mockPdfParse);

    const result = await readPdf("/tmp/bad.pdf");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid PDF structure");
  });

  it("trims whitespace from extracted text", async () => {
    const buf = Buffer.from("data");

    const mockPdfParse = vi.fn().mockResolvedValueOnce({ text: "\n\n  content \n\n", numpages: 2 });
    _setPdfParse(mockPdfParse);

    const result = await readPdf(buf);

    expect(result.text).toBe("content");
    expect(result.pages).toBe(2);
    expect(result.success).toBe(true);
  });
});
