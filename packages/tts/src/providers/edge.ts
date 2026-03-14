import { createSubsystemLogger } from "@sandra/utils";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const log = createSubsystemLogger("tts:edge");
const execAsync = promisify(exec);

export interface EdgeTtsOptions {
  voice?: string;  // default: "en-US-JennyNeural"
  rate?: string;   // e.g. "+10%", "-5%", default "+0%"
  pitch?: string;  // e.g. "+5Hz", default "+0Hz"
}

/**
 * Edge TTS via Microsoft's free neural TTS service.
 *
 * Primary strategy: use the `edge-tts` npm package (v3) ttsChunks API.
 * Fallback strategy: use the `edge-tts` CLI (Python package) if the npm
 * package is unavailable or its API differs from what is expected.
 *
 * Returns MP3 audio as a Buffer on success, null on failure.
 */
export async function edgeTts(
  text: string,
  options?: EdgeTtsOptions
): Promise<Buffer | null> {
  const voice = options?.voice ?? "en-US-JennyNeural";
  const rate = options?.rate ?? "+0%";
  const pitch = options?.pitch ?? "+0Hz";

  // Try npm edge-tts package first (v1.x tts() function API)
  try {
    const { tts } = await import("edge-tts");
    const audio = await tts(text, { voice, rate, pitch });
    log.debug("edgeTts (npm): success", { voice, bytes: audio.length });
    return audio;
  } catch (npmErr) {
    log.debug("edgeTts (npm) unavailable or failed, trying CLI fallback", {
      error: npmErr instanceof Error ? npmErr.message : String(npmErr),
    });
  }

  // Fallback: edge-tts CLI (Python package `pip install edge-tts`)
  const tmpFile = join(tmpdir(), `edge-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);

  try {
    // Escape text for shell: write to a temp file to avoid shell injection issues
    const tmpInput = join(tmpdir(), `edge-tts-input-${Date.now()}.txt`);
    await writeFile(tmpInput, text, "utf-8");

    await execAsync(
      `edge-tts --voice "${voice}" --rate "${rate}" --pitch "${pitch}" --text "${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" --write-media "${tmpFile}"`
    );

    // Clean up input temp file (best-effort)
    unlink(tmpInput).catch(() => { /* ignore */ });

    const audio = await readFile(tmpFile);
    log.debug("edgeTts (CLI): success", { voice, bytes: audio.length });
    return audio;
  } catch (cliErr) {
    log.error("edgeTts: all strategies failed", {
      error: cliErr instanceof Error ? cliErr.message : String(cliErr),
      voice,
    });
    return null;
  } finally {
    unlink(tmpFile).catch(() => { /* ignore */ });
  }
}
