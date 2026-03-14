import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("tts:elevenlabs");

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId?: string;           // default: "21m00Tcm4TlvDq8ikWAM" (Rachel)
  modelId?: string;           // default: "eleven_monolingual_v1"
  baseUrl?: string;           // default: "https://api.elevenlabs.io"
  /** Voice stability (0.0–1.0). Higher = more consistent; lower = more expressive. */
  stability?: number;         // default: 0.5
  /** Similarity boost (0.0–1.0). How closely to match the original voice. */
  similarityBoost?: number;   // default: 0.75
  /** Style exaggeration (0.0–1.0). Only available on v2+ models. */
  style?: number;             // default: 0
  /** Speaking speed multiplier (0.7–1.2). Only on v3 models. */
  speed?: number;
  /** Use speaker boost (improves clarity for cloned voices). */
  useSpeakerBoost?: boolean;  // default: false
  /** Seed for deterministic generation. */
  seed?: number;
}

/**
 * Convert text to speech using ElevenLabs API.
 * Returns audio Buffer (mp3) on success, null on failure.
 */
export async function elevenlabsTts(
  text: string,
  options: ElevenLabsOptions
): Promise<Buffer | null> {
  const voiceId = options.voiceId ?? process.env["ELEVENLABS_VOICE_ID"] ?? "21m00Tcm4TlvDq8ikWAM";
  const modelId = options.modelId ?? process.env["ELEVENLABS_MODEL_ID"] ?? "eleven_monolingual_v1";
  const baseUrl = options.baseUrl ?? "https://api.elevenlabs.io";

  const url = `${baseUrl}/v1/text-to-speech/${voiceId}`;

  const voiceSettings: Record<string, unknown> = {
    stability: options.stability ?? 0.5,
    similarity_boost: options.similarityBoost ?? 0.75,
    style: options.style ?? 0,
    use_speaker_boost: options.useSpeakerBoost ?? false,
  };

  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
    voice_settings: voiceSettings,
  };

  if (options.speed !== undefined) {
    // Speed is passed in voice_settings for turbo/v3 models
    voiceSettings["speed"] = options.speed;
  }

  if (options.seed !== undefined) {
    body["seed"] = options.seed;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": options.apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.warn("ElevenLabs TTS returned non-2xx", { status: response.status, body: errText.slice(0, 200) });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    log.error("ElevenLabs TTS request failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
