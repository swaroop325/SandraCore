export * from "./plugin-loader.js";
export * from "./plugin-registry.js";

import { randomBytes } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { mkdir, writeFile, unlink } from "fs/promises";

// ── Temp file management ───────────────────────────────────────────────────

export interface TempFile {
  path: string;
  cleanup(): Promise<void>;
}

/** Create a temp file with optional content. Auto-cleans on process exit. */
export async function createTempFile(ext = ".tmp", content?: string): Promise<TempFile> {
  const name = randomBytes(8).toString("hex") + ext;
  const path = join(tmpdir(), name);
  await mkdir(tmpdir(), { recursive: true });
  if (content !== undefined) await writeFile(path, content, "utf-8");
  return {
    path,
    async cleanup() {
      try { await unlink(path); } catch { /* already deleted */ }
    },
  };
}

// ── Text chunking ──────────────────────────────────────────────────────────

/** Split text into chunks of maxLen, respecting word/sentence boundaries */
export function chunkText(text: string, maxLen: number): string[] {
  if (maxLen <= 0 || text.length <= maxLen) return text ? [text] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (i + maxLen >= text.length) { chunks.push(text.slice(i)); break; }
    let end = i + maxLen;
    // Back up to last space
    while (end > i && text[end] !== " " && text[end] !== "\n") end--;
    if (end === i) end = i + maxLen; // no space found, hard cut
    chunks.push(text.slice(i, end).trim());
    i = end + 1;
  }
  return chunks.filter(Boolean);
}

// ── Status helpers ─────────────────────────────────────────────────────────

export type StatusLevel = "info" | "success" | "warning" | "error";

export function statusEmoji(level: StatusLevel): string {
  const map: Record<StatusLevel, string> = {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "❌",
  };
  return map[level];
}

export function formatStatus(level: StatusLevel, message: string): string {
  return `${statusEmoji(level)} ${message}`;
}

// ── Plugin manifest ────────────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  channels?: string[];
  permissions?: ("read_messages" | "send_messages" | "read_files" | "execute_commands")[];
}

export function validateManifest(manifest: unknown): manifest is PluginManifest {
  if (typeof manifest !== "object" || manifest === null) return false;
  const m = manifest as Record<string, unknown>;
  return typeof m["name"] === "string" && typeof m["version"] === "string" && typeof m["description"] === "string";
}

// ── File lock ──────────────────────────────────────────────────────────────

const _locks = new Set<string>();

/** Acquire a named lock. Returns false if already held. */
export function acquireLock(name: string): boolean {
  if (_locks.has(name)) return false;
  _locks.add(name);
  return true;
}

/** Release a named lock. */
export function releaseLock(name: string): void {
  _locks.delete(name);
}
