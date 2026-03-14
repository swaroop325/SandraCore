/**
 * TTS directives: inline tags in text that control TTS behavior.
 *
 * Supported tags:
 *   [[tts:skip]]          — skip TTS for this message entirely
 *   [[tts:voice:NAME]]    — use specific voice (e.g. [[tts:voice:en-GB-SoniaNeural]])
 *   [[tts:rate:+20%]]     — set speech rate
 *   [[tts:pitch:+5Hz]]    — set pitch
 *   [[tts:lang:es]]       — set language hint
 */

export interface TtsDirectives {
  skip: boolean;
  voice?: string;
  rate?: string;
  pitch?: string;
  lang?: string;
}

/** Regex to match [[tts:...]] directives */
const DIRECTIVE_REGEX = /\[\[tts:([^\]]+)\]\]/gi;

/**
 * Parse TTS directives from text.
 * Returns the cleaned text (directives removed) and parsed directives.
 */
export function parseTtsDirectives(text: string): {
  cleanText: string;
  directives: TtsDirectives;
} {
  const directives: TtsDirectives = { skip: false };

  const cleanText = text
    .replace(DIRECTIVE_REGEX, (_match, content: string) => {
      const parts = content.split(":").map((s) => s.trim());
      const cmd = parts[0]!.toLowerCase();
      const arg = parts[1];

      switch (cmd) {
        case "skip":
          directives.skip = true;
          break;
        case "voice":
          // Preserve original case for voice names (e.g. "en-GB-SoniaNeural")
          if (arg !== undefined) {
            directives.voice = parts.slice(1).join(":");
          }
          break;
        case "rate":
          if (arg !== undefined) directives.rate = arg;
          break;
        case "pitch":
          if (arg !== undefined) directives.pitch = arg;
          break;
        case "lang":
          if (arg !== undefined) directives.lang = arg;
          break;
      }

      return ""; // Remove directive from text
    })
    .replace(/\s+/g, " ")
    .trim();

  return { cleanText, directives };
}
