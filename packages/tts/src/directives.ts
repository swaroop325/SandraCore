/**
 * TTS directives: inline tags in text that control TTS behavior.
 *
 * Supported tags:
 *   [[tts:skip]]                    — skip TTS for this message entirely
 *   [[tts:voice:NAME]]              — use specific voice (e.g. [[tts:voice:en-GB-SoniaNeural]])
 *   [[tts:rate:+20%]]               — set speech rate
 *   [[tts:pitch:+5Hz]]              — set pitch
 *   [[tts:lang:es]]                 — set language hint
 *   [[tts:stability:0.7]]           — ElevenLabs voice stability (0.0–1.0)
 *   [[tts:similarity_boost:0.8]]    — ElevenLabs similarity boost (0.0–1.0)
 *   [[tts:style:0.3]]               — ElevenLabs style exaggeration (0.0–1.0)
 *   [[tts:speed:1.1]]               — ElevenLabs speaking speed multiplier (0.7–1.2)
 *   [[tts:use_speaker_boost:true]]  — ElevenLabs speaker boost toggle
 *   [[tts:seed:42]]                 — ElevenLabs deterministic seed
 */

export interface TtsDirectives {
  skip: boolean;
  voice?: string;
  rate?: string;
  pitch?: string;
  lang?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  useSpeakerBoost?: boolean;
  seed?: number;
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
        case "stability": {
          const v = parseFloat(arg ?? "");
          if (!isNaN(v)) directives.stability = v;
          break;
        }
        case "similarity_boost": {
          const v = parseFloat(arg ?? "");
          if (!isNaN(v)) directives.similarityBoost = v;
          break;
        }
        case "style": {
          const v = parseFloat(arg ?? "");
          if (!isNaN(v)) directives.style = v;
          break;
        }
        case "speed": {
          const v = parseFloat(arg ?? "");
          if (!isNaN(v)) directives.speed = v;
          break;
        }
        case "use_speaker_boost":
          if (arg !== undefined) directives.useSpeakerBoost = arg.toLowerCase() === "true";
          break;
        case "seed": {
          const v = parseInt(arg ?? "", 10);
          if (!isNaN(v)) directives.seed = v;
          break;
        }
      }

      return ""; // Remove directive from text
    })
    .replace(/\s+/g, " ")
    .trim();

  return { cleanText, directives };
}
