import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sandra/media
vi.mock("@sandra/media", () => ({
  transcribeAudio: vi.fn(),
}));

// Mock @sandra/utils
vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { transcribeAudio } from "@sandra/media";
import { handleVoiceMessage } from "./voice.js";

const mockTranscribeAudio = vi.mocked(transcribeAudio);

function makeCtx(overrides: {
  voice?: { file_id: string } | null;
  audio?: { file_id: string; mime_type?: string } | null;
  getFilePath?: string | undefined;
  fetchStatus?: number;
}): unknown {
  const { voice, audio, getFilePath = "voice/abc123.oga", fetchStatus = 200 } = overrides;

  // Patch global fetch
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: fetchStatus >= 200 && fetchStatus < 300,
      status: fetchStatus,
      arrayBuffer: async () => Buffer.from("fake-audio").buffer,
    })
  );

  return {
    message: {
      voice: voice === null ? undefined : voice,
      audio: audio === null ? undefined : audio,
    },
    api: {
      getFile: vi.fn().mockResolvedValue({ file_path: getFilePath }),
    },
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockTranscribeAudio.mockReset();
  process.env["TELEGRAM_BOT_TOKEN"] = "test-token";
});

describe("handleVoiceMessage", () => {
  it("returns null when message has no voice or audio", async () => {
    const ctx = makeCtx({ voice: null, audio: null }) as Parameters<typeof handleVoiceMessage>[0];
    const result = await handleVoiceMessage(ctx, "user-1", "tg:111");
    expect(result).toBeNull();
  });

  it("returns transcript on success with voice message", async () => {
    mockTranscribeAudio.mockResolvedValueOnce("Hello Sandra");

    const ctx = makeCtx({
      voice: { file_id: "file-abc" },
      audio: null,
    }) as Parameters<typeof handleVoiceMessage>[0];

    const result = await handleVoiceMessage(ctx, "user-1", "tg:111");
    expect(result).toBe("Hello Sandra");
    expect(mockTranscribeAudio).toHaveBeenCalledWith(expect.any(Buffer), "audio/ogg");
  });

  it("returns transcript on success with audio message", async () => {
    mockTranscribeAudio.mockResolvedValueOnce("Play some music");

    const ctx = makeCtx({
      voice: null,
      audio: { file_id: "file-xyz", mime_type: "audio/mpeg" },
    }) as Parameters<typeof handleVoiceMessage>[0];

    const result = await handleVoiceMessage(ctx, "user-1", "tg:111");
    expect(result).toBe("Play some music");
    expect(mockTranscribeAudio).toHaveBeenCalledWith(expect.any(Buffer), "audio/mpeg");
  });

  it("returns fallback string when transcript is empty", async () => {
    mockTranscribeAudio.mockResolvedValueOnce("");

    const ctx = makeCtx({
      voice: { file_id: "file-abc" },
      audio: null,
    }) as Parameters<typeof handleVoiceMessage>[0];

    const result = await handleVoiceMessage(ctx, "user-1", "tg:111");
    expect(result).toBe("[Voice message — could not transcribe]");
  });
});
