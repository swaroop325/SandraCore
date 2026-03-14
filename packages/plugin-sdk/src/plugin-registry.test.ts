import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPluginRegistry } from "./plugin-registry.js";
import type { LoadedPlugin, PluginToolDef } from "./plugin-loader.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTool(name: string): PluginToolDef {
  return {
    name,
    description: `${name} description`,
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" } },
    },
    execute: vi.fn(async (_input, _userId) => `${name} result`),
  };
}

function makePlugin(name: string, toolNames: string[] = []): LoadedPlugin {
  return {
    manifest: { name, version: "0.1.0", description: `Plugin ${name}` },
    tools: toolNames.map(makeTool),
    deactivate: vi.fn(async () => undefined),
  };
}

// ── createPluginRegistry ─────────────────────────────────────────────────────

describe("createPluginRegistry", () => {
  // We test all registry API surface using manually-built LoadedPlugin objects
  // by mocking the `loadPlugin` import that the registry uses internally.

  // Because loadPlugin is called via `await import(specifier)` inside
  // plugin-loader.ts we instead mock the entire plugin-loader module so that
  // `loadPlugin` returns our controlled stub.

  beforeEach(() => {
    vi.resetModules();
  });

  it("list() returns empty initially", async () => {
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();
    expect(registry.list()).toEqual([]);
  });

  it("load() registers a plugin and returns it", async () => {
    const plugin = makePlugin("hello", ["hello_greet"]);
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(async () => plugin),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    const result = await registry.load("./hello.js");
    expect(result).toBe(plugin);
    expect(registry.list()).toHaveLength(1);
    expect(registry.getPlugin("hello")).toBe(plugin);
  });

  it("load() with duplicate name throws", async () => {
    const plugin = makePlugin("dup", ["dup_tool"]);
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(async () => plugin),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    await registry.load("./dup.js");
    await expect(registry.load("./dup.js")).rejects.toThrow(/already loaded/);
  });

  it("getTools() flattens tools from all plugins", async () => {
    const pluginA = makePlugin("A", ["a1", "a2"]);
    const pluginB = makePlugin("B", ["b1"]);
    let callCount = 0;
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(async () => {
        return callCount++ === 0 ? pluginA : pluginB;
      }),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    await registry.load("./A.js");
    await registry.load("./B.js");

    const tools = registry.getTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name)).toEqual(["a1", "a2", "b1"]);
  });

  it("unload() calls deactivate and removes plugin", async () => {
    const plugin = makePlugin("removable", ["r_tool"]);
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(async () => plugin),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    await registry.load("./removable.js");
    await registry.unload("removable");

    expect(vi.mocked(plugin.deactivate)).toHaveBeenCalledOnce();
    expect(registry.list()).toHaveLength(0);
    expect(registry.getPlugin("removable")).toBeUndefined();
  });

  it("unload() removes the plugin's tools from getTools()", async () => {
    const pluginA = makePlugin("A", ["a_tool"]);
    const pluginB = makePlugin("B", ["b_tool"]);
    let callCount = 0;
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(async () => {
        return callCount++ === 0 ? pluginA : pluginB;
      }),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    await registry.load("./A.js");
    await registry.load("./B.js");
    await registry.unload("A");

    const tools = registry.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("b_tool");
  });

  it("unload() of non-existent plugin throws", async () => {
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    await expect(registry.unload("ghost")).rejects.toThrow(/not loaded/);
  });

  it("list() returns all currently loaded plugins", async () => {
    const p1 = makePlugin("p1");
    const p2 = makePlugin("p2");
    const p3 = makePlugin("p3");
    const stubs = [p1, p2, p3];
    let idx = 0;
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(async () => stubs[idx++]),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    await registry.load("./p1.js");
    await registry.load("./p2.js");
    await registry.load("./p3.js");

    const names = registry.list().map((p) => p.manifest.name);
    expect(names).toEqual(["p1", "p2", "p3"]);
  });

  it("getPlugin() returns undefined for unknown name", async () => {
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    expect(registry.getPlugin("mystery")).toBeUndefined();
  });

  it("re-registering after unload succeeds", async () => {
    const v1 = makePlugin("reloadable", ["v1_tool"]);
    const v2 = makePlugin("reloadable", ["v2_tool"]);
    let callCount = 0;
    vi.doMock("./plugin-loader.js", () => ({
      loadPlugin: vi.fn(async () => (callCount++ === 0 ? v1 : v2)),
    }));
    const { createPluginRegistry: createRegistry } = await import("./plugin-registry.js");
    const registry = createRegistry();

    await registry.load("./reloadable-v1.js");
    await registry.unload("reloadable");
    await registry.load("./reloadable-v2.js");

    expect(registry.getTools()[0]?.name).toBe("v2_tool");
  });
});
