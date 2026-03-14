import type { Context } from "grammy";
import { transcribeAudio } from "@sandra/media";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("telegram");

/**
 * Handle a voice or audio message from Telegram.
 * Downloads the file, transcribes it, and returns the transcript text.
 * Returns null if the message has no voice/audio.
 * Returns a fallback string if transcription yields no text.
 */
export async function handleVoiceMessage(
  ctx: Context,
  userId: string,
  sessionId: string
): Promise<string | null> {
  const voice = ctx.message?.voice;
  const audio = ctx.message?.audio;

  if (!voice && !audio) {
    return null;
  }

  const fileId = voice ? voice.file_id : audio!.file_id;
  const mimeType: string = voice
    ? "audio/ogg"
    : (audio!.mime_type ?? "audio/mpeg");

  log.debug("Handling voice message", { userId, sessionId, mimeType });

  const fileInfo = await ctx.api.getFile(fileId);
  const filePath = fileInfo.file_path;

  if (!filePath) {
    log.warn("No file_path returned from Telegram for voice message", { userId, fileId });
    return "[Voice message — could not transcribe]";
  }

  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    log.warn("Failed to download voice file from Telegram", {
      userId,
      status: response.status,
    });
    return "[Voice message — could not transcribe]";
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const transcript = await transcribeAudio(buffer, mimeType);

  if (transcript === "") {
    return "[Voice message — could not transcribe]";
  }

  return transcript;
}
