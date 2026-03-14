import { createRequire } from "module";
import fs from "fs/promises";

const _require = createRequire(import.meta.url);

type PdfParseFunction = (
  buffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ text: string; numpages: number }>;

// Lazily loaded pdf-parse reference — exposed so tests can inject a mock.
let _pdfParse: PdfParseFunction | null = null;

/** @internal — allows tests to inject a mock pdf-parse implementation. */
export function _setPdfParse(fn: PdfParseFunction | null): void {
  _pdfParse = fn;
}

function getPdfParse(): PdfParseFunction {
  if (_pdfParse) return _pdfParse;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _pdfParse = _require("pdf-parse") as PdfParseFunction;
  return _pdfParse;
}

export interface PdfReadResult {
  text: string;
  pages: number;
  success: boolean;
  error?: string;
}

/**
 * Extract text content from a PDF buffer or file path.
 * Returns extracted text, page count, or error.
 */
export async function readPdf(source: string | Buffer): Promise<PdfReadResult> {
  try {
    let buffer: Buffer;

    if (typeof source === "string") {
      buffer = await fs.readFile(source);
    } else {
      buffer = source;
    }

    const pdfParse = getPdfParse();
    const result = await pdfParse(buffer);
    return {
      text: result.text.trim(),
      pages: result.numpages,
      success: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: "", pages: 0, success: false, error: message };
  }
}
