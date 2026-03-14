import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("tts:elevenlabs");

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId?: string;   // default: "21m00Tcm4TlvDq8ikWAM" (Rachel)
  modelId?: string;   // default: "eleven_monolingual_v1"
  baseUrl?: string;   // default: "https://api.elevenlabs.io"
}

/**
 * Convert text to speech using ElevenLabs API.
 * Returns audio Buffer (mp3) on success, null on failure.
 */
export async function elevenlabsTts(
  text: string,
  options: ElevenLabsOptions
): Promise<Buffer | null> {
  const voiceId = options.voiceId ?? "21m00Tcm4TlvDq8ikWAM";
  const modelId = options.modelId ?? "eleven_monolingual_v1";
  const baseUrl = options.baseUrl ?? "https://api.elevenlabs.io";

  const url = `${baseUrl}/v1/text-to-speech/${voiceId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": options.apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      log.warn("ElevenLabs TTS returned non-2xx", { status: response.status });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    log.error("ElevenLabs TTS request failed", { err });
    return null;
  }
}
