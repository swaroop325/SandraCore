import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sandra/core before importing the module under test
vi.mock("@sandra/core", () => ({
  REGION: "ap-southeast-1",
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

// Mock TranscribeStreamingClient
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock("@aws-sdk/client-transcribe-streaming", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-transcribe-streaming")>();
  return {
    ...actual,
    TranscribeStreamingClient: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    StartStreamTranscriptionCommand: vi.fn().mockImplementation((input) => input),
  };
});

import { transcribeAudio } from "./transcribe.js";

function makeTranscriptStream(
  events: Array<{
    transcript: string;
    isPartial: boolean;
  }>
): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield {
          TranscriptEvent: {
            Transcript: {
              Results: [
                {
                  IsPartial: event.isPartial,
                  Alternatives: [{ Transcript: event.transcript }],
                },
              ],
            },
          },
        };
      }
    },
  };
}

beforeEach(() => {
  mockSend.mockReset();
});

describe("transcribeAudio", () => {
  it("returns transcript from non-partial TranscriptEvent results", async () => {
    mockSend.mockResolvedValueOnce({
      TranscriptResultStream: makeTranscriptStream([
        { transcript: "Hello world", isPartial: false },
        { transcript: "How are you", isPartial: false },
      ]),
    });

    const buffer = Buffer.from("fake-audio-data");
    const result = await transcribeAudio(buffer, "audio/ogg");

    expect(result).toBe("Hello world How are you");
  });

  it("filters out partial results (IsPartial=true)", async () => {
    mockSend.mockResolvedValueOnce({
      TranscriptResultStream: makeTranscriptStream([
        { transcript: "Hello wor", isPartial: true },
        { transcript: "Hello world", isPartial: false },
      ]),
    });

    const buffer = Buffer.from("fake-audio-data");
    const result = await transcribeAudio(buffer, "audio/ogg");

    expect(result).toBe("Hello world");
  });

  it("returns empty string when no results", async () => {
    mockSend.mockResolvedValueOnce({
      TranscriptResultStream: {
        [Symbol.asyncIterator]: async function* () {
          // no events
        },
      },
    });

    const buffer = Buffer.from("fake-audio-data");
    const result = await transcribeAudio(buffer, "audio/ogg");

    expect(result).toBe("");
  });

  it("handles error gracefully and returns empty string", async () => {
    mockSend.mockRejectedValueOnce(new Error("Transcribe service error"));

    const buffer = Buffer.from("fake-audio-data");
    const result = await transcribeAudio(buffer, "audio/ogg");

    expect(result).toBe("");
  });

  it("defaults mimeType to audio/ogg when not provided", async () => {
    mockSend.mockResolvedValueOnce({
      TranscriptResultStream: makeTranscriptStream([
        { transcript: "Default mime", isPartial: false },
      ]),
    });

    const buffer = Buffer.from("fake-audio-data");
    const result = await transcribeAudio(buffer);

    expect(result).toBe("Default mime");
  });
});
