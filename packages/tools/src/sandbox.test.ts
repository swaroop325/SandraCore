import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so these mocks are available inside vi.mock() factory functions
const { mockIsCommandAvailable, mockExecWithTimeout, mockWriteFile, mockUnlink } = vi.hoisted(() => ({
  mockIsCommandAvailable: vi.fn(),
  mockExecWithTimeout: vi.fn(),
  mockWriteFile: vi.fn(),
  mockUnlink: vi.fn(),
}));

vi.mock("@sandra/utils", () => ({
  isCommandAvailable: mockIsCommandAvailable,
  execWithTimeout: mockExecWithTimeout,
}));

vi.mock("fs/promises", () => ({
  writeFile: mockWriteFile,
  unlink: mockUnlink,
}));

import { runInSandbox } from "./sandbox.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
});

describe("runInSandbox", () => {
  it("returns error result when Docker is not available", async () => {
    mockIsCommandAvailable.mockResolvedValue(false);

    const result = await runInSandbox({ language: "python", code: "print('hi')" });

    expect(result).toEqual({
      stdout: "",
      stderr: "Docker not available",
      exitCode: 1,
      timedOut: false,
    });
    expect(mockExecWithTimeout).not.toHaveBeenCalled();
  });

  it("constructs correct docker command for python", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "hello\n", stderr: "", exitCode: 0 });

    await runInSandbox({ language: "python", code: "print('hello')" });

    expect(mockExecWithTimeout).toHaveBeenCalledOnce();
    const [cmd, args] = mockExecWithTimeout.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe("docker");
    expect(args).toContain("python:3.12-alpine");
    expect(args).toContain("python");
    expect(args).toContain("/code/run.py");
    expect(args).toContain("--network");
    expect(args).toContain("none");
    expect(args).toContain("--read-only");
    expect(args).toContain("--pids-limit");
    expect(args).toContain("--rm");
  });

  it("constructs correct docker command for javascript", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "42\n", stderr: "", exitCode: 0 });

    await runInSandbox({ language: "javascript", code: "console.log(42)" });

    const [, args] = mockExecWithTimeout.mock.calls[0] as [string, string[], unknown];
    expect(args).toContain("node:22-alpine");
    expect(args).toContain("node");
    expect(args).toContain("/code/run.js");
  });

  it("constructs correct docker command for typescript", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await runInSandbox({ language: "typescript", code: "const x: number = 1; console.log(x)" });

    const [, args] = mockExecWithTimeout.mock.calls[0] as [string, string[], unknown];
    expect(args).toContain("node:22-alpine");
    expect(args).toContain("--experimental-strip-types");
    expect(args).toContain("/code/run.ts");
  });

  it("constructs correct docker command for bash", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "hello\n", stderr: "", exitCode: 0 });

    await runInSandbox({ language: "bash", code: "echo hello" });

    const [, args] = mockExecWithTimeout.mock.calls[0] as [string, string[], unknown];
    expect(args).toContain("alpine:latest");
    expect(args).toContain("sh");
    expect(args).toContain("/code/run.sh");
  });

  it("returns stdout and stderr from exec result", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({
      stdout: "output line\n",
      stderr: "warning: something\n",
      exitCode: 0,
    });

    const result = await runInSandbox({ language: "python", code: "print('output line')" });

    expect(result.stdout).toBe("output line\n");
    expect(result.stderr).toBe("warning: something\n");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("returns non-zero exit code from exec result", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({
      stdout: "",
      stderr: "SyntaxError: invalid syntax\n",
      exitCode: 1,
    });

    const result = await runInSandbox({ language: "python", code: "def bad syntax" });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SyntaxError");
    expect(result.timedOut).toBe(false);
  });

  it("marks result as timedOut when exitCode is -1 with empty output", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "", stderr: "", exitCode: -1 });

    const result = await runInSandbox({ language: "python", code: "while True: pass" });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
  });

  it("applies custom timeoutMs and memoryMb to docker command", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await runInSandbox({ language: "python", code: "pass", timeoutMs: 5000, memoryMb: 256 });

    const [, args, opts] = mockExecWithTimeout.mock.calls[0] as [string, string[], { timeoutMs: number }];
    expect(args).toContain("--memory=256m");
    expect(opts.timeoutMs).toBe(5000);
  });

  it("uses default memory of 128m when memoryMb not provided", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await runInSandbox({ language: "javascript", code: "console.log(1)" });

    const [, args] = mockExecWithTimeout.mock.calls[0] as [string, string[], unknown];
    expect(args).toContain("--memory=128m");
  });

  it("cleans up temp file after successful execution", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 });

    await runInSandbox({ language: "bash", code: "echo ok" });

    expect(mockUnlink).toHaveBeenCalledOnce();
  });

  it("cleans up temp file even when exec throws", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockRejectedValue(new Error("spawn error"));

    await expect(runInSandbox({ language: "python", code: "pass" })).rejects.toThrow("spawn error");

    expect(mockUnlink).toHaveBeenCalledOnce();
  });

  it("mounts temp file as read-only volume", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);
    mockExecWithTimeout.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    await runInSandbox({ language: "python", code: "pass" });

    const [, args] = mockExecWithTimeout.mock.calls[0] as [string, string[], unknown];
    const vIdx = args.indexOf("-v");
    expect(vIdx).toBeGreaterThan(-1);
    const mountArg = args[vIdx + 1];
    expect(mountArg).toMatch(/:/);
    expect(mountArg).toMatch(/:ro$/);
  });
});
