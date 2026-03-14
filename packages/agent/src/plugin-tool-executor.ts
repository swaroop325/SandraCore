import { createPluginRegistry } from "@sandra/plugin-sdk";

// ── Singleton registry ──────────────────────────────────────────────────────

/** Shared plugin registry for the agent process. */
export const pluginRegistry = createPluginRegistry();

// ── executePluginTool ───────────────────────────────────────────────────────

/**
 * Execute a plugin tool by name.
 * Returns the string result if a matching plugin tool is found,
 * or null if no plugin tool with that name is registered.
 *
 * Never throws — errors are returned as "Error: <message>" strings so the
 * model can observe failures and decide how to proceed.
 */
export async function executePluginTool(
  name: string,
  input: Record<string, unknown>,
  userId?: string
): Promise<string | null> {
  const tools = pluginRegistry.getTools();
  const tool = tools.find((t) => t.name === name);

  if (!tool) {
    return null;
  }

  try {
    return await tool.execute(input, userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}
