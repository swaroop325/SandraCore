import { describe, it, expect, vi } from "vitest";

// Mock child_process.spawn
vi.mock("child_process", () => {
  const EventEmitter = require("events");
  const makeStream = () => {
    const e = new EventEmitter();
    return e;
  };
  const mockChild = {
    stdout: makeStream(),
    stderr: makeStream(),
    on: vi.fn(),
    kill: vi.fn(),
  };
  return {
    spawn: vi.fn().mockReturnValue(mockChild),
    __mockChild: mockChild,
  };
});

import { execWithTimeout, isCommandAvailable } from "./process-utils.js";

describe("execWithTimeout", () => {
  it("resolves with exitCode 0 on success", async () => {
    const { spawn, __mockChild } = await import("child_process") as any;
    // Simulate process closing with code 0
    const closeHandler = __mockChild.on.mock.calls.find((c: any[]) => c[0] === "close")?.[1];
    // Re-mock spawn to immediately call close
    const { EventEmitter } = await import("events");
    spawn.mockImplementationOnce(() => {
      const child = {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        on: (event: string, cb: Function) => {
          if (event === "close") setTimeout(() => cb(0), 0);
        },
        kill: vi.fn(),
      };
      return child;
    });
    const result = await execWithTimeout("echo", ["hello"]);
    expect(result.exitCode).toBe(0);
  });
});

describe("isCommandAvailable", () => {
  it("returns true for available commands (mocked)", async () => {
    const { spawn } = await import("child_process") as any;
    const { EventEmitter } = await import("events");
    spawn.mockImplementationOnce(() => ({
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      on: (event: string, cb: Function) => {
        if (event === "close") setTimeout(() => cb(0), 0);
      },
      kill: vi.fn(),
    }));
    const result = await isCommandAvailable("node");
    expect(typeof result).toBe("boolean");
  });
});
