import { loadPlugin } from "./plugin-loader.js";
import type { LoadedPlugin, PluginToolDef } from "./plugin-loader.js";

// ── Public interface ────────────────────────────────────────────────────────

export interface PluginRegistry {
  /** Load a plugin from a module specifier and register it. */
  load(specifier: string): Promise<LoadedPlugin>;
  /** Deactivate and remove a plugin by its manifest name. */
  unload(pluginName: string): Promise<void>;
  /** Return all tools from all currently-loaded plugins (flattened). */
  getTools(): PluginToolDef[];
  /** Look up a loaded plugin by its manifest name. */
  getPlugin(name: string): LoadedPlugin | undefined;
  /** Return all loaded plugins. */
  list(): LoadedPlugin[];
}

// ── createPluginRegistry ───────────────────────────────────────────────────

export function createPluginRegistry(): PluginRegistry {
  const plugins = new Map<string, LoadedPlugin>();

  return {
    async load(specifier: string): Promise<LoadedPlugin> {
      const loaded = await loadPlugin(specifier);
      const { name } = loaded.manifest;

      if (plugins.has(name)) {
        throw new Error(
          `Plugin "${name}" is already loaded. Unload it first before reloading.`
        );
      }

      plugins.set(name, loaded);
      return loaded;
    },

    async unload(pluginName: string): Promise<void> {
      const plugin = plugins.get(pluginName);
      if (!plugin) {
        throw new Error(`Plugin "${pluginName}" is not loaded.`);
      }
      await plugin.deactivate();
      plugins.delete(pluginName);
    },

    getTools(): PluginToolDef[] {
      const tools: PluginToolDef[] = [];
      for (const plugin of plugins.values()) {
        tools.push(...plugin.tools);
      }
      return tools;
    },

    getPlugin(name: string): LoadedPlugin | undefined {
      return plugins.get(name);
    },

    list(): LoadedPlugin[] {
      return Array.from(plugins.values());
    },
  };
}
