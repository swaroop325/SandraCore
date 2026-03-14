import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("tts:openai");

export interface OpenAITtsOptions {
  apiKey: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"; // default: "nova"
  model?: string;   // default: "tts-1"
  baseUrl?: string; // default: "https://api.openai.com/v1"
  speed?: number;   // 0.25-4.0, default: 1.0
}

/**
 * Convert text to speech using OpenAI TTS API.
 * Returns audio Buffer (mp3) on success, null on failure.
 */
export async function openaiTts(
  text: string,
  options: OpenAITtsOptions
): Promise<Buffer | null> {
  const model = options.model ?? "tts-1";
  const voice = options.voice ?? "nova";
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const speed = options.speed ?? 1.0;

  const url = `${baseUrl}/audio/speech`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        speed,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      log.warn("OpenAI TTS returned non-2xx", { status: response.status });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    log.error("OpenAI TTS request failed", { err });
    return null;
  }
}
