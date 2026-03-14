import { createSubsystemLogger } from "@sandra/utils";
import { elevenlabsTts } from "./providers/elevenlabs.js";
import { openaiTts } from "./providers/openai.js";
import { edgeTts } from "./providers/edge.js";

const log = createSubsystemLogger("tts");

export type TtsProvider = "elevenlabs" | "openai" | "system";

export interface TtsOptions {
  text: string;
  /** Channel hint: affects output format. Telegram prefers OGG Opus (voice bubble); others get MP3. */
  channel?: string;
  provider?: TtsProvider;
  /** Voice name hint, passed to the provider if supported (edge-tts uses neural voice names). */
  voice?: string;
  /** Speech rate hint, e.g. "+10%", "-5%". Passed to edge provider. */
  rate?: string;
  /** Pitch hint, e.g. "+5Hz". Passed to edge provider. */
  pitch?: string;
}

export interface TtsResult {
  success: boolean;
  audio?: Buffer;
  mimeType?: string;         // "audio/mpeg" or "audio/ogg; codecs=opus"
  voiceCompatible?: boolean; // true if format is suitable for Telegram voice bubble
  error?: string;
}

/**
 * Convert text to speech. Provider selected by:
 * 1. options.provider if set
 * 2. ELEVENLABS_API_KEY env → elevenlabs
 * 3. OPENAI_API_KEY env → openai
 * 4. fallback → system (returns null)
 */
export async function textToSpeech(options: TtsOptions): Promise<TtsResult> {
  const { text, provider: explicitProvider } = options;

  const elevenLabsKey = process.env["ELEVENLABS_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];

  // Determine provider
  let provider: TtsProvider;
  if (explicitProvider !== undefined) {
    provider = explicitProvider;
  } else if (elevenLabsKey !== undefined) {
    provider = "elevenlabs";
  } else if (openaiKey !== undefined) {
    provider = "openai";
  } else {
    provider = "system";
  }

  log.debug("textToSpeech: selected provider", { provider, channel: options.channel });

  let audio: Buffer | null = null;

  if (provider === "elevenlabs") {
    if (elevenLabsKey === undefined) {
      return { success: false, error: "ELEVENLABS_API_KEY not set" };
    }
    // Note: ElevenLabs voice is controlled via ELEVENLABS_VOICE_ID env var in the provider.
    audio = await elevenlabsTts(text, { apiKey: elevenLabsKey });
  } else if (provider === "openai") {
    if (openaiKey === undefined) {
      return { success: false, error: "OPENAI_API_KEY not set" };
    }
    audio = await openaiTts(text, { apiKey: openaiKey });
  } else {
    // system / edge
    audio = await edgeTts(text, {
      voice: options.voice ?? "en-US-JennyNeural",
      rate: options.rate,
      pitch: options.pitch,
    });
  }

  if (audio === null) {
    return { success: false, error: "TTS provider returned no audio" };
  }

  // Determine mime type and voice compatibility
  // Currently all providers return MP3. OGG Opus conversion requires ffmpeg (deferred).
  // voiceCompatible is true only for OGG/Opus format (Telegram voice bubble requirement).
  const mimeType = "audio/mpeg";
  const voiceCompatible = false; // MP3 is not a Telegram voice bubble format

  return {
    success: true,
    audio,
    mimeType,
    voiceCompatible,
  };
}

// Re-export providers
export { elevenlabsTts } from "./providers/elevenlabs.js";
export type { ElevenLabsOptions } from "./providers/elevenlabs.js";
export { openaiTts } from "./providers/openai.js";
export type { OpenAITtsOptions } from "./providers/openai.js";
export { edgeTts } from "./providers/edge.js";
export type { EdgeTtsOptions } from "./providers/edge.js";

// Re-export directive parsing and auto-mode
export * from "./directives.js";
export * from "./auto-mode.js";
