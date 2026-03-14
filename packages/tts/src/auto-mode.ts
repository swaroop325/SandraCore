import { textToSpeech, type TtsOptions } from "./index.js";
import { parseTtsDirectives } from "./directives.js";

/**
 * TTS auto-mode controls when TTS is automatically applied.
 *
 * - "off"     — never apply TTS automatically
 * - "always"  — always apply TTS to every outgoing message
 * - "inbound" — only apply TTS to messages received (not sent)
 * - "tagged"  — only apply TTS when a [[tts:...]] directive is present
 */
export type TtsAutoMode = "off" | "always" | "inbound" | "tagged";

export interface TtsAutoConfig {
  mode: TtsAutoMode;
  defaultVoice?: string;
  defaultRate?: string;
  defaultPitch?: string;
  /** Channels where TTS is enabled. If empty/omitted, all channels are enabled. */
  enabledChannels?: string[];
  /** Max text length before TTS is skipped (too long). Default: 500 chars. */
  maxLength?: number;
}

let _autoConfig: TtsAutoConfig = { mode: "off" };

export function setTtsAutoConfig(config: TtsAutoConfig): void {
  _autoConfig = config;
}

export function getTtsAutoConfig(): TtsAutoConfig {
  return _autoConfig;
}

/**
 * Apply TTS to a message payload based on auto-mode config.
 *
 * Strips [[tts:...]] directives from the text in all cases.
 * Returns the audio buffer if TTS was applied, null otherwise.
 */
export async function maybeApplyTtsToPayload(opts: {
  text: string;
  channel?: string;
  direction?: "inbound" | "outbound";
}): Promise<{ cleanText: string; audio: Buffer | null; mimeType: string | null }> {
  const { cleanText, directives } = parseTtsDirectives(opts.text);

  // [[tts:skip]] always suppresses TTS regardless of mode
  if (directives.skip) {
    return { cleanText, audio: null, mimeType: null };
  }

  const config = _autoConfig;

  // Check if the channel is in the enabled list (if a list is configured)
  if (
    config.enabledChannels !== undefined &&
    config.enabledChannels.length > 0 &&
    opts.channel !== undefined &&
    !config.enabledChannels.includes(opts.channel)
  ) {
    return { cleanText, audio: null, mimeType: null };
  }

  // Skip if text exceeds max length
  const maxLen = config.maxLength ?? 500;
  if (cleanText.length > maxLen) {
    return { cleanText, audio: null, mimeType: null };
  }

  // Decide whether to apply TTS based on mode
  let shouldApply = false;
  switch (config.mode) {
    case "always":
      shouldApply = true;
      break;
    case "inbound":
      shouldApply = opts.direction === "inbound";
      break;
    case "tagged":
      // Apply if any non-skip directive was found in the text
      shouldApply =
        directives.voice !== undefined ||
        directives.rate !== undefined ||
        directives.pitch !== undefined ||
        directives.lang !== undefined;
      break;
    case "off":
    default:
      shouldApply = false;
  }

  if (!shouldApply) {
    return { cleanText, audio: null, mimeType: null };
  }

  // Build TTS options, directive values override config defaults
  const resolvedVoice = directives.voice ?? config.defaultVoice;
  const resolvedRate = directives.rate ?? config.defaultRate;
  const resolvedPitch = directives.pitch ?? config.defaultPitch;
  const ttsOptions: TtsOptions = {
    text: cleanText,
    ...(opts.channel !== undefined && { channel: opts.channel }),
    ...(resolvedVoice !== undefined && { voice: resolvedVoice }),
    ...(resolvedRate !== undefined && { rate: resolvedRate }),
    ...(resolvedPitch !== undefined && { pitch: resolvedPitch }),
  };

  const result = await textToSpeech(ttsOptions);

  if (!result.success || result.audio === undefined) {
    return { cleanText, audio: null, mimeType: null };
  }

  return {
    cleanText,
    audio: result.audio,
    mimeType: result.mimeType ?? "audio/mpeg",
  };
}
