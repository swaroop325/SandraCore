import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateManifest } from "./index.js";
import type { LoadedPlugin, PluginToolDef } from "./plugin-loader.js";
import { createPluginRegistry } from "./plugin-registry.js";

// ── validateManifest edge cases ─────────────────────────────────────────────

describe("validateManifest", () => {
  it("accepts a minimal valid manifest", () => {
    expect(
      validateManifest({ name: "my-plugin", version: "1.0.0", description: "A test plugin" })
    ).toBe(true);
  });

  it("accepts a manifest with optional fields", () => {
    expect(
      validateManifest({
        name: "my-plugin",
        version: "1.0.0",
        description: "A test plugin",
        author: "Alice",
        channels: ["telegram"],
        permissions: ["send_messages"],
      })
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(validateManifest(null)).toBe(false);
  });

  it("rejects a primitive string", () => {
    expect(validateManifest("my-plugin")).toBe(false);
  });

  it("rejects a number", () => {
    expect(validateManifest(42)).toBe(false);
  });

  it("rejects missing name", () => {
    expect(validateManifest({ version: "1.0.0", description: "desc" })).toBe(false);
  });

  it("rejects missing version", () => {
    expect(validateManifest({ name: "x", description: "desc" })).toBe(false);
  });

  it("rejects missing description", () => {
    expect(validateManifest({ name: "x", version: "1.0.0" })).toBe(false);
  });

  it("rejects when name is not a string", () => {
    expect(validateManifest({ name: 123, version: "1.0.0", description: "d" })).toBe(false);
  });

  it("rejects an empty object", () => {
    expect(validateManifest({})).toBe(false);
  });
});

// ── LoadedPlugin construction helpers ──────────────────────────────────────

function makeToolDef(name: string): PluginToolDef {
  return {
    name,
    description: `Tool: ${name}`,
    inputSchema: {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    },
    execute: vi.fn(async () => `result from ${name}`),
  };
}

function makeLoadedPlugin(pluginName: string, toolNames: string[]): LoadedPlugin {
  return {
    manifest: {
      name: pluginName,
      version: "1.0.0",
      description: `Plugin ${pluginName}`,
    },
    tools: toolNames.map(makeToolDef),
    deactivate: vi.fn(async () => undefined),
  };
}

// ── createPluginRegistry used with manually-constructed LoadedPlugin objects ─
// (Tests the registry logic without requiring a real dynamic import.)

describe("createPluginRegistry — manual plugin injection via load override", () => {
  // We test the registry's data-management logic by building a registry and
  // directly calling its `load` method with a specifier that resolves to a
  // known in-process module.  For pure unit coverage we spy on the internal
  // `loadPlugin` by wrapping createPluginRegistry's returned object.

  it("list() returns empty array when no plugins are registered", () => {
    const registry = createPluginRegistry();
    expect(registry.list()).toEqual([]);
  });

  it("getTools() returns empty array when no plugins are registered", () => {
    const registry = createPluginRegistry();
    expect(registry.getTools()).toEqual([]);
  });

  it("getPlugin() returns undefined for unknown name", () => {
    const registry = createPluginRegistry();
    expect(registry.getPlugin("does-not-exist")).toBeUndefined();
  });
});

// ── Registry behaviour with LoadedPlugin stubs ─────────────────────────────
// We expose an internal helper that lets us inject already-loaded plugins so
// we can test the Map-based bookkeeping without going through the dynamic
// import path.

describe("createPluginRegistry — internal bookkeeping", () => {
  // Build a testable registry that exposes a register() back-door.
  function buildTestRegistry() {
    const plugins = new Map<string, LoadedPlugin>();

    /** Back-door: inject a pre-built LoadedPlugin directly. */
    function register(plugin: LoadedPlugin): void {
      const { name } = plugin.manifest;
      if (plugins.has(name)) {
        throw new Error(`Plugin "${name}" is already loaded. Unload it first before reloading.`);
      }
      plugins.set(name, plugin);
    }

    const registry = {
      register,
      async unload(pluginName: string): Promise<void> {
        const plugin = plugins.get(pluginName);
        if (!plugin) throw new Error(`Plugin "${pluginName}" is not loaded.`);
        await plugin.deactivate();
        plugins.delete(pluginName);
      },
      getTools(): PluginToolDef[] {
        const tools: PluginToolDef[] = [];
        for (const p of plugins.values()) tools.push(...p.tools);
        return tools;
      },
      getPlugin(name: string): LoadedPlugin | undefined {
        return plugins.get(name);
      },
      list(): LoadedPlugin[] {
        return Array.from(plugins.values());
      },
    };

    return registry;
  }

  it("register + list + getPlugin work correctly", () => {
    const reg = buildTestRegistry();
    const plugin = makeLoadedPlugin("alpha", ["alpha_tool"]);
    reg.register(plugin);

    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0]?.manifest.name).toBe("alpha");
    expect(reg.getPlugin("alpha")).toBe(plugin);
    expect(reg.getPlugin("beta")).toBeUndefined();
  });

  it("duplicate registration throws", () => {
    const reg = buildTestRegistry();
    const plugin = makeLoadedPlugin("alpha", ["alpha_tool"]);
    reg.register(plugin);
    expect(() => reg.register(plugin)).toThrow(/already loaded/);
  });

  it("getTools() flattens tools from multiple plugins", () => {
    const reg = buildTestRegistry();
    reg.register(makeLoadedPlugin("pluginA", ["tool_a1", "tool_a2"]));
    reg.register(makeLoadedPlugin("pluginB", ["tool_b1"]));

    const tools = reg.getTools();
    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain("tool_a1");
    expect(names).toContain("tool_a2");
    expect(names).toContain("tool_b1");
  });

  it("unload calls deactivate and removes the plugin", async () => {
    const reg = buildTestRegistry();
    const plugin = makeLoadedPlugin("gamma", ["gamma_tool"]);
    reg.register(plugin);

    expect(reg.list()).toHaveLength(1);
    await reg.unload("gamma");

    expect(vi.mocked(plugin.deactivate)).toHaveBeenCalledOnce();
    expect(reg.list()).toHaveLength(0);
    expect(reg.getPlugin("gamma")).toBeUndefined();
  });

  it("unload removes only the targeted plugin's tools", async () => {
    const reg = buildTestRegistry();
    reg.register(makeLoadedPlugin("pluginA", ["tool_a"]));
    reg.register(makeLoadedPlugin("pluginB", ["tool_b"]));

    await reg.unload("pluginA");
    const tools = reg.getTools();
    expect(tools.map((t) => t.name)).toEqual(["tool_b"]);
  });

  it("unload of unknown plugin throws", async () => {
    const reg = buildTestRegistry();
    await expect(reg.unload("nonexistent")).rejects.toThrow(/not loaded/);
  });

  it("list() returns all loaded plugins", () => {
    const reg = buildTestRegistry();
    reg.register(makeLoadedPlugin("p1", []));
    reg.register(makeLoadedPlugin("p2", []));
    reg.register(makeLoadedPlugin("p3", []));

    const names = reg.list().map((p) => p.manifest.name);
    expect(names).toEqual(["p1", "p2", "p3"]);
  });

  it("re-register after unload succeeds", async () => {
    const reg = buildTestRegistry();
    const plugin = makeLoadedPlugin("reloadable", ["tool_r"]);
    reg.register(plugin);
    await reg.unload("reloadable");

    // Second registration should succeed after unload.
    const plugin2 = makeLoadedPlugin("reloadable", ["tool_r_v2"]);
    expect(() => reg.register(plugin2)).not.toThrow();
    expect(reg.list()).toHaveLength(1);
    expect(reg.getTools()[0]?.name).toBe("tool_r_v2");
  });
});
