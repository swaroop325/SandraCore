import { readFileSync } from "fs";
import { resolve } from "path";

export type SecretRefFormat = "env" | "file" | "inline";

export interface ResolvedSecret {
  value: string;
  format: SecretRefFormat;
  ref: string;
}

/**
 * Parse a secret ref string into its format and target.
 * Formats:
 *   env:VAR_NAME    → read from process.env.VAR_NAME
 *   file:/path      → read from filesystem (trimmed)
 *   anything else   → treat as inline value
 */
export function parseSecretRef(input: string): { format: SecretRefFormat; target: string } {
  if (input.startsWith("env:")) {
    return { format: "env", target: input.slice(4) };
  }
  if (input.startsWith("file:")) {
    return { format: "file", target: input.slice(5) };
  }
  return { format: "inline", target: input };
}

/**
 * Resolve a secret ref string to its value.
 * Throws a descriptive error if the secret cannot be resolved.
 */
export function resolveSecretRef(input: string): ResolvedSecret {
  const { format, target } = parseSecretRef(input);

  switch (format) {
    case "env": {
      const val = process.env[target];
      if (val === undefined) {
        throw new Error(`Secret ref 'env:${target}' — environment variable ${target} is not set`);
      }
      return { value: val, format, ref: `env:${target}` };
    }
    case "file": {
      // Reject any path containing ".." before resolving
      if (target.includes("..")) {
        throw new Error(`Secret ref 'file:${target}' — path traversal detected`);
      }
      // Resolve to an absolute path and verify it lives under the allowed base
      const safeBase = process.env["SECRETS_DIR"] ?? "/run/secrets";
      const resolved = resolve(target);
      if (!resolved.startsWith(safeBase + "/") && resolved !== safeBase) {
        throw new Error(
          `Secret ref 'file:${target}' — resolved path '${resolved}' is outside allowed directory '${safeBase}'`
        );
      }
      try {
        const val = readFileSync(resolved, "utf-8").trim();
        if (!val) throw new Error(`file is empty`);
        return { value: val, format, ref: `file:${target}` };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Secret ref 'file:${target}' — ${msg}`);
      }
    }
    case "inline": {
      if (!input.trim()) {
        throw new Error(`Secret ref is an empty inline value`);
      }
      return { value: input, format, ref: "(inline)" };
    }
  }
}

/**
 * Resolve a secret ref or return undefined if the input is undefined/null/empty.
 * Useful for optional secrets.
 */
export function resolveOptionalSecretRef(
  input: string | undefined | null
): string | undefined {
  if (!input) return undefined;
  try {
    return resolveSecretRef(input).value;
  } catch {
    return undefined;
  }
}

/**
 * Redact secret values from log strings.
 * Replace resolved secret values with [REDACTED].
 */
export function redactSecrets(
  message: string,
  secrets: string[]
): string {
  let result = message;
  for (const secret of secrets) {
    if (secret.length < 4) continue; // don't redact very short values
    result = result.replaceAll(secret, "[REDACTED]");
  }
  return result;
}
