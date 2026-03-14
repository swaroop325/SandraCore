import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock callAgent from ./acp.js using vi.hoisted so the factory can reference
// the mock function before imports are evaluated.
// ---------------------------------------------------------------------------

const { mockCallAgent } = vi.hoisted(() => {
  return { mockCallAgent: vi.fn() };
});

vi.mock("./acp.js", () => ({
  callAgent: mockCallAgent,
  _setHandleMessage: vi.fn(),
}));

import { runAgentsInParallel, runAgentsSequentially } from "./multi-agent.js";
import type { AcpResponse } from "./acp.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeResponse(agentName: string, result: string): AcpResponse {
  return { agentName, result, sessionId: `acp:${agentName}:abc123`, durationMs: 10 };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// runAgentsInParallel tests
// ---------------------------------------------------------------------------

describe("runAgentsInParallel", () => {
  it("returns results in the same order as input tasks", async () => {
    mockCallAgent
      .mockResolvedValueOnce(makeResponse("agent-a", "Result A"))
      .mockResolvedValueOnce(makeResponse("agent-b", "Result B"))
      .mockResolvedValueOnce(makeResponse("agent-c", "Result C"));

    const results = await runAgentsInParallel([
      { name: "agent-a", task: "Task A" },
      { name: "agent-b", task: "Task B" },
      { name: "agent-c", task: "Task C" },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]!.result).toBe("Result A");
    expect(results[1]!.result).toBe("Result B");
    expect(results[2]!.result).toBe("Result C");
  });

  it("calls callAgent for each task with correct agentName and task", async () => {
    mockCallAgent
      .mockResolvedValueOnce(makeResponse("r1", "r1"))
      .mockResolvedValueOnce(makeResponse("r2", "r2"));

    await runAgentsInParallel([
      { name: "r1", task: "Do R1" },
      { name: "r2", task: "Do R2" },
    ]);

    expect(mockCallAgent).toHaveBeenCalledTimes(2);
    expect(mockCallAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: "r1", task: "Do R1" })
    );
    expect(mockCallAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: "r2", task: "Do R2" })
    );
  });

  it("uses task-level userId when provided, falling back to the shared userId", async () => {
    mockCallAgent
      .mockResolvedValueOnce(makeResponse("a", "ok"))
      .mockResolvedValueOnce(makeResponse("b", "ok"));

    await runAgentsInParallel(
      [
        { name: "a", task: "Task A", userId: "task-user" },
        { name: "b", task: "Task B" },
      ],
      "shared-user"
    );

    expect(mockCallAgent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userId: "task-user" })
    );
    expect(mockCallAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId: "shared-user" })
    );
  });

  it("returns an empty array for empty input", async () => {
    const results = await runAgentsInParallel([]);
    expect(results).toEqual([]);
    expect(mockCallAgent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runAgentsSequentially tests
// ---------------------------------------------------------------------------

describe("runAgentsSequentially", () => {
  it("runs a single task and returns its result directly", async () => {
    mockCallAgent.mockResolvedValueOnce(makeResponse("solo", "Solo result"));

    const result = await runAgentsSequentially([{ name: "solo", task: "Solo task" }]);

    expect(result.result).toBe("Solo result");
    expect(mockCallAgent).toHaveBeenCalledTimes(1);
    expect(mockCallAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: "solo", task: "Solo task" })
    );
  });

  it("chains results: second task receives first result as context", async () => {
    mockCallAgent
      .mockResolvedValueOnce(makeResponse("step1", "Step 1 output"))
      .mockResolvedValueOnce(makeResponse("step2", "Step 2 output"));

    const result = await runAgentsSequentially([
      { name: "step1", task: "Do step 1" },
      { name: "step2", task: "Do step 2" },
    ]);

    expect(result.result).toBe("Step 2 output");
    expect(mockCallAgent).toHaveBeenCalledTimes(2);

    const secondCall = mockCallAgent.mock.calls[1]![0] as { task: string };
    expect(secondCall.task).toBe(
      "Previous result:\nStep 1 output\n\nTask: Do step 2"
    );
  });

  it("chains all tasks in a three-step sequence", async () => {
    mockCallAgent
      .mockResolvedValueOnce(makeResponse("a", "Output A"))
      .mockResolvedValueOnce(makeResponse("b", "Output B"))
      .mockResolvedValueOnce(makeResponse("c", "Output C"));

    const result = await runAgentsSequentially([
      { name: "a", task: "Task A" },
      { name: "b", task: "Task B" },
      { name: "c", task: "Task C" },
    ]);

    expect(result.result).toBe("Output C");

    // Step B gets Output A as context
    const callB = mockCallAgent.mock.calls[1]![0] as { task: string };
    expect(callB.task).toBe("Previous result:\nOutput A\n\nTask: Task B");

    // Step C gets Output B as context
    const callC = mockCallAgent.mock.calls[2]![0] as { task: string };
    expect(callC.task).toBe("Previous result:\nOutput B\n\nTask: Task C");
  });

  it("throws when given an empty task list", async () => {
    await expect(runAgentsSequentially([])).rejects.toThrow(
      "runAgentsSequentially requires at least one task"
    );
  });

  it("uses shared userId when task has no userId", async () => {
    mockCallAgent.mockResolvedValueOnce(makeResponse("x", "result"));

    await runAgentsSequentially([{ name: "x", task: "Task X" }], "shared-uid");

    expect(mockCallAgent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "shared-uid" })
    );
  });
});
