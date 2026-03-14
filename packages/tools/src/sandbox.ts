import { execWithTimeout, isCommandAvailable } from "@sandra/utils";
import { randomBytes } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export interface SandboxOptions {
  language: "python" | "javascript" | "typescript" | "bash";
  code: string;
  timeoutMs?: number;
  memoryMb?: number;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const IMAGE_MAP: Record<SandboxOptions["language"], string> = {
  python: "python:3.12-alpine",
  javascript: "node:22-alpine",
  typescript: "node:22-alpine",
  bash: "alpine:latest",
};

const EXT_MAP: Record<SandboxOptions["language"], string> = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  bash: "sh",
};

const CMD_MAP: Record<SandboxOptions["language"], (mountPath: string) => string[]> = {
  python: (p) => ["python", p],
  javascript: (p) => ["node", p],
  typescript: (p) => ["node", "--experimental-strip-types", p],
  bash: (p) => ["sh", p],
};

/**
 * Execute code in an isolated Docker container.
 * Returns SandboxResult. Never throws — errors appear in stderr/exitCode.
 */
export async function runInSandbox(options: SandboxOptions): Promise<SandboxResult> {
  const { language, code, timeoutMs = 10_000, memoryMb = 128 } = options;

  const dockerAvailable = await isCommandAvailable("docker");
  if (!dockerAvailable) {
    return { stdout: "", stderr: "Docker not available", exitCode: 1, timedOut: false };
  }

  const ext = EXT_MAP[language];
  const tmpFile = join(tmpdir(), `sandbox-${randomBytes(8).toString("hex")}.${ext}`);
  const mountPath = `/code/run.${ext}`;

  try {
    await writeFile(tmpFile, code, "utf-8");

    const langCmd = CMD_MAP[language](mountPath);

    const dockerArgs = [
      "run",
      "--rm",
      "--network", "none",
      `--memory=${memoryMb}m`,
      "--cpus=0.5",
      "--pids-limit", "64",
      "--read-only",
      "--tmpfs", "/tmp:size=64m",
      "-v", `${tmpFile}:${mountPath}:ro`,
      IMAGE_MAP[language],
      ...langCmd,
    ];

    const execResult = await execWithTimeout("docker", dockerArgs, { timeoutMs });

    const timedOut = execResult.exitCode === -1 && execResult.stdout === "" && execResult.stderr === "";

    return {
      stdout: execResult.stdout,
      stderr: execResult.stderr,
      exitCode: execResult.exitCode,
      timedOut,
    };
  } finally {
    await unlink(tmpFile).catch(() => undefined);
  }
}
