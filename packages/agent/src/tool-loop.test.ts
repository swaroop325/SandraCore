import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing the module under test so that
// vi.mock hoisting can replace the modules before reason.ts is evaluated.
// ---------------------------------------------------------------------------

vi.mock("@aws-sdk/client-bedrock-runtime", () => {
  const send = vi.fn();
  const InvokeModelCommand = vi.fn((args: unknown) => args);
  const BedrockRuntimeClient = vi.fn(() => ({ send }));
  return { BedrockRuntimeClient, InvokeModelCommand, __send: send };
});

vi.mock("@sandra/tools", () => ({
  webSearch: vi.fn(),
  webFetch: vi.fn(),
  getLinkPreview: vi.fn(),
}));

vi.mock("@sandra/tasks", () => ({
  createTask: vi.fn(),
  scheduleReminder: vi.fn(),
}));

vi.mock("@sandra/media", () => ({
  analyzeImage: vi.fn(),
  analyzeImageFromUrl: vi.fn(),
}));

vi.mock("@sandra/plugin-sdk", () => ({
  createPluginRegistry: vi.fn(() => ({
    load: vi.fn(),
    unload: vi.fn(),
    getTools: vi.fn(() => []),
    getPlugin: vi.fn(() => undefined),
    list: vi.fn(() => []),
  })),
}));

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  db: { execute: vi.fn(), query: vi.fn().mockResolvedValue({ rows: [] }) },
  looksLikeSecret: vi.fn(() => false),
  auditLog: vi.fn(),
}));

vi.mock("@sandra/memory", () => ({
  recallMemory: vi.fn().mockResolvedValue([]),
  writeMemory: vi.fn().mockResolvedValue(undefined),
  forgetMemory: vi.fn().mockResolvedValue(undefined),
  forgetAllMemories: vi.fn().mockResolvedValue(undefined),
  loadHistory: vi.fn().mockResolvedValue([]),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  appendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sandra/cron", () => ({
  createDbCronStore: vi.fn(() => ({
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue("job-id"),
    delete: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn().mockResolvedValue(undefined),
    enable: vi.fn().mockResolvedValue(undefined),
  })),
  normalizeSchedule: vi.fn((s: unknown) => s),
  nextOccurrenceForSchedule: vi.fn(() => new Date()),
}));

vi.mock("@sandra/browser", () => ({
  browserAction: vi.fn().mockResolvedValue({ success: true, data: "mock" }),
}));

vi.mock("./soul.js", () => ({
  getSoul: vi.fn(() => "You are Sandra."),
}));

vi.mock("./bedrock-client.js", async () => {
  // Reuse the same mock send from the bedrock-runtime mock so we can control
  // responses per-test via the shared reference.
  const mod = await import("@aws-sdk/client-bedrock-runtime");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = (mod as any).__send as ReturnType<typeof vi.fn>;
  return { bedrock: { send } };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { type MockInstance } from "vitest";
import * as bedrockRuntime from "@aws-sdk/client-bedrock-runtime";
import * as toolsModule from "@sandra/tools";
import * as tasksModule from "@sandra/tasks";

// Obtain the shared `send` spy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSend = (): MockInstance => (bedrockRuntime as any).__send as MockInstance;

function makeBedrockResponse(stop_reason: string, content: unknown[]): { body: Uint8Array } {
  return {
    body: Buffer.from(JSON.stringify({ stop_reason, content })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reason() — agentic tool loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text directly when model responds with end_turn and no tool calls", async () => {
    const { reason } = await import("./reason.js");
    const send = getSend();

    send.mockResolvedValueOnce(
      makeBedrockResponse("end_turn", [{ type: "text", text: "Hello! How can I help?" }])
    );

    const result = await reason([], "Hi there", [], "test-model-id");

    expect(result).toBe("Hello! How can I help?");
    expect(send).toHaveBeenCalledTimes(1);

    // Verify tools were included in the request body.
    const callArg = send.mock.calls[0]?.[0] as { body: string };
    const body = JSON.parse(callArg.body as string);
    expect(body).toHaveProperty("tools");
    expect(body).toHaveProperty("tool_choice");
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
  });

  it("executes a single tool call and returns the final text response", async () => {
    const { reason } = await import("./reason.js");
    const send = getSend();

    const webSearch = vi.mocked(toolsModule.webSearch);
    webSearch.mockResolvedValueOnce({
      answer: "The latest LTS is Node 22.",
      citations: ["https://nodejs.org"],
      query: "latest nodejs lts",
      searchedAt: "2026-03-14T00:00:00.000Z",
    });

    // First call: model requests web_search.
    send.mockResolvedValueOnce(
      makeBedrockResponse("tool_use", [
        {
          type: "tool_use",
          id: "toolu_01",
          name: "web_search",
          input: { query: "latest nodejs lts" },
        },
      ])
    );

    // Second call: model returns final answer.
    send.mockResolvedValueOnce(
      makeBedrockResponse("end_turn", [
        { type: "text", text: "The latest Node.js LTS version is Node 22." },
      ])
    );

    const result = await reason([], "What is the latest Node.js LTS?", [], "test-model-id", "user-1");

    expect(result).toBe("The latest Node.js LTS version is Node 22.");
    expect(send).toHaveBeenCalledTimes(2);
    expect(webSearch).toHaveBeenCalledWith("latest nodejs lts");

    // Verify the second Bedrock call included the tool result in messages.
    const secondCallArg = send.mock.calls[1]?.[0] as { body: string };
    const secondBody = JSON.parse(secondCallArg.body as string);
    const msgs: unknown[] = secondBody.messages;

    // messages should be: [user, assistant(tool_use), user(tool_result)]
    expect(msgs).toHaveLength(3);
    const lastMsg = msgs[2] as { role: string; content: unknown[] };
    expect(lastMsg.role).toBe("user");
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const toolResult = lastMsg.content[0] as { type: string; tool_use_id: string };
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.tool_use_id).toBe("toolu_01");
  });

  it("forces a final text-only call when MAX_TOOL_TURNS is exceeded", async () => {
    const { reason } = await import("./reason.js");
    const send = getSend();

    // Mock executeTool side: web_search always succeeds trivially.
    const webSearch = vi.mocked(toolsModule.webSearch);
    webSearch.mockResolvedValue({
      answer: "Some result.",
      citations: [],
      query: "q",
      searchedAt: "2026-03-14T00:00:00.000Z",
    });

    // The model keeps requesting a tool for MAX_TOOL_TURNS (5) rounds, then
    // the forced final call returns text.
    const toolUseResponse = makeBedrockResponse("tool_use", [
      {
        type: "tool_use",
        id: "toolu_loop",
        name: "web_search",
        input: { query: "q" },
      },
    ]);

    // 5 tool_use responses (MAX_TOOL_TURNS = 5)
    send
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(toolUseResponse)
      // 6th call: forced final call without tools
      .mockResolvedValueOnce(
        makeBedrockResponse("end_turn", [
          { type: "text", text: "Here is a summary after many searches." },
        ])
      );

    const result = await reason([], "Keep searching", [], "test-model-id");

    expect(result).toBe("Here is a summary after many searches.");
    // 5 tool loops + 1 forced final = 6 total Bedrock calls.
    expect(send).toHaveBeenCalledTimes(6);

    // The forced final call must NOT include a `tools` key.
    const finalCallArg = send.mock.calls[5]?.[0] as { body: string };
    const finalBody = JSON.parse(finalCallArg.body as string);
    expect(finalBody).not.toHaveProperty("tools");
    expect(finalBody).not.toHaveProperty("tool_choice");
  });

  it("handles tool execution errors gracefully — loop continues with error string", async () => {
    const { reason } = await import("./reason.js");
    const send = getSend();

    // createTask throws an error.
    const createTask = vi.mocked(tasksModule.createTask);
    createTask.mockRejectedValueOnce(new Error("DB connection refused"));

    // First call: model requests create_task.
    send.mockResolvedValueOnce(
      makeBedrockResponse("tool_use", [
        {
          type: "tool_use",
          id: "toolu_err",
          name: "create_task",
          input: { description: "Buy milk" },
        },
      ])
    );

    // Second call: model sees the error and responds gracefully.
    send.mockResolvedValueOnce(
      makeBedrockResponse("end_turn", [
        {
          type: "text",
          text: "I was unable to create the task due to a database error.",
        },
      ])
    );

    const result = await reason([], "Create a task: buy milk", [], "test-model-id", "user-2");

    expect(result).toBe("I was unable to create the task due to a database error.");
    expect(send).toHaveBeenCalledTimes(2);

    // Verify the error string was passed back to the model as a tool_result.
    const secondCallArg = send.mock.calls[1]?.[0] as { body: string };
    const secondBody = JSON.parse(secondCallArg.body as string);
    const msgs: unknown[] = secondBody.messages;
    const toolResultMsg = msgs[msgs.length - 1] as { role: string; content: unknown[] };
    const toolResult = toolResultMsg.content[0] as { type: string; content: string };
    expect(toolResult.content).toContain("Error: DB connection refused");
  });
});
