import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode,
  MediaEncoding,
  type TranscriptResultStream,
} from "@aws-sdk/client-transcribe-streaming";
import { REGION } from "@sandra/core";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("media");

export interface TranscriptionResult {
  text: string;
  language: string;
}

// AWS Transcribe Streaming supports: pcm, ogg-opus, flac, mulaw
function getMimeEncoding(mimeType: string): MediaEncoding {
  switch (mimeType) {
    case "audio/ogg":
    case "audio/ogg; codecs=opus":
      return MediaEncoding.OGG_OPUS;
    case "audio/flac":
      return MediaEncoding.FLAC;
    default:
      return MediaEncoding.OGG_OPUS;
  }
}

async function* audioChunkGenerator(
  buffer: Buffer,
  chunkSize = 8192
): AsyncGenerator<{ AudioEvent: { AudioChunk: Uint8Array } }> {
  let offset = 0;
  while (offset < buffer.length) {
    const end = Math.min(offset + chunkSize, buffer.length);
    yield { AudioEvent: { AudioChunk: buffer.subarray(offset, end) } };
    offset = end;
  }
}

/**
 * Transcribe an audio buffer using AWS Transcribe Streaming.
 * Returns the transcript text, or empty string if nothing was transcribed.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType = "audio/ogg"
): Promise<string> {
  const languageCode = process.env["TRANSCRIBE_LANGUAGE"] ?? "en-US";
  const mediaEncoding = getMimeEncoding(mimeType);

  const client = new TranscribeStreamingClient({ region: REGION });

  try {
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: (languageCode as LanguageCode),
      MediaEncoding: mediaEncoding,
      MediaSampleRateHertz: 16000,
      AudioStream: audioChunkGenerator(audioBuffer) as never,
    });

    const response = await client.send(command);

    const transcripts: string[] = [];

    if (response.TranscriptResultStream) {
      for await (const event of response.TranscriptResultStream as AsyncIterable<TranscriptResultStream>) {
        if ("TranscriptEvent" in event && event.TranscriptEvent) {
          const results = event.TranscriptEvent.Transcript?.Results ?? [];
          for (const result of results) {
            if (result.IsPartial === false) {
              const transcript = result.Alternatives?.[0]?.Transcript;
              if (transcript) {
                transcripts.push(transcript);
              }
            }
          }
        }
      }
    }

    return transcripts.join(" ").trim();
  } catch (err) {
    log.error("Failed to transcribe audio", { err, mimeType });
    return "";
  }
}
