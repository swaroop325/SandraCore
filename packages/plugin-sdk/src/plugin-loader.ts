import { validateManifest } from "./index.js";
import type { PluginManifest } from "./index.js";

// ── Public interfaces ───────────────────────────────────────────────────────

export interface PluginToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(input: Record<string, unknown>, userId?: string): Promise<string>;
}

export interface PluginContext {
  log: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  tools: PluginToolDef[];
  deactivate(): Promise<void>;
}

// ── Internal shape of a plugin module ──────────────────────────────────────

interface PluginModule {
  manifest: unknown;
  tools?: unknown;
  activate?(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

// ── Logger factory ─────────────────────────────────────────────────────────

function makeContext(pluginName: string): PluginContext {
  const prefix = `[plugin:${pluginName}]`;
  return {
    log: {
      info:  (msg: string) => console.info(`${prefix} ${msg}`),
      warn:  (msg: string) => console.warn(`${prefix} ${msg}`),
      error: (msg: string) => console.error(`${prefix} ${msg}`),
    },
  };
}

// ── loadPlugin ─────────────────────────────────────────────────────────────

/**
 * Load a plugin from its module specifier (file path or package name).
 * Calls activate() if present. Returns a LoadedPlugin.
 *
 * Throws if the module does not export a valid PluginManifest or if the
 * tools export is not an array.
 */
export async function loadPlugin(specifier: string): Promise<LoadedPlugin> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(specifier)) as PluginModule;

  if (!validateManifest(mod.manifest)) {
    throw new Error(
      `Plugin at "${specifier}" does not export a valid manifest. ` +
        "Expected { name: string; version: string; description: string }."
    );
  }

  const manifest: PluginManifest = mod.manifest;

  if (!Array.isArray(mod.tools)) {
    throw new Error(
      `Plugin "${manifest.name}" does not export a tools array.`
    );
  }

  const tools = mod.tools as PluginToolDef[];
  const ctx = makeContext(manifest.name);

  if (typeof mod.activate === "function") {
    await mod.activate(ctx);
  }

  const rawDeactivate = mod.deactivate;
  const deactivate: () => Promise<void> =
    typeof rawDeactivate === "function"
      ? async () => { await rawDeactivate(); }
      : async () => { /* no-op */ };

  return { manifest, tools, deactivate };
}
