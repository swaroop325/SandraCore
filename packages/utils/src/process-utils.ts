import { spawn, type SpawnOptions } from "child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  /** Timeout in ms. Default: 30_000 */
  timeoutMs?: number;
  /** Working directory */
  cwd?: string;
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;
  /** Kill signal on timeout. Default: "SIGTERM" */
  killSignal?: NodeJS.Signals;
}

/**
 * Execute a shell command with timeout support.
 * Resolves with stdout/stderr/exitCode — never rejects on non-zero exit.
 */
export function execWithTimeout(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { timeoutMs = 30_000, cwd, env, killSignal = "SIGTERM" } = options;

  return new Promise((resolve) => {
    const spawnOpts: SpawnOptions = {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    };

    const child = spawn(command, args, spawnOpts);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill(killSignal);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: timedOut ? -1 : (code ?? -1),
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: -1 });
    });
  });
}

/**
 * Kill a process tree (parent + all children) on supported platforms.
 * On Linux/macOS uses kill(-pid) to kill the process group.
 */
export function killTree(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  try {
    // Negative PID kills the process group on Unix
    process.kill(-pid, signal);
  } catch {
    // If process group kill fails, try direct kill
    try { process.kill(pid, signal); } catch { /* already dead */ }
  }
}

/**
 * Check if a command is available on PATH.
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  const checkCmd = process.platform === "win32" ? "where" : "which";
  const result = await execWithTimeout(checkCmd, [command], { timeoutMs: 5_000 });
  return result.exitCode === 0;
}
