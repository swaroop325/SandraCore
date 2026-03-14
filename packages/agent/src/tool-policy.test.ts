import { describe, it, expect, beforeEach } from "vitest";
import {
  checkToolPolicy,
  setGlobalToolPolicy,
  globalToolPolicy,
} from "./tool-policy.js";
import type { ToolPolicy } from "./tool-policy.js";

describe("checkToolPolicy", () => {
  it("returns the default verdict when no rules match", () => {
    const policy: ToolPolicy = { rules: [], default: "allow" };
    expect(checkToolPolicy(policy, "web_search")).toEqual({ verdict: "allow" });
  });

  it("returns deny default when configured", () => {
    const policy: ToolPolicy = { rules: [], default: "deny" };
    expect(checkToolPolicy(policy, "any_tool")).toEqual({ verdict: "deny" });
  });

  it("matches an exact rule and returns its verdict", () => {
    const policy: ToolPolicy = {
      rules: [{ toolName: "run_code", verdict: "deny", reason: "Not allowed in prod" }],
      default: "allow",
    };
    const result = checkToolPolicy(policy, "run_code");
    expect(result.verdict).toBe("deny");
    expect(result.reason).toBe("Not allowed in prod");
  });

  it("returns allow for a non-matching tool when only exact rules exist", () => {
    const policy: ToolPolicy = {
      rules: [{ toolName: "run_code", verdict: "deny" }],
      default: "allow",
    };
    expect(checkToolPolicy(policy, "web_search")).toEqual({ verdict: "allow" });
  });

  it("matches wildcard rule when no exact match found", () => {
    const policy: ToolPolicy = {
      rules: [{ toolName: "*", verdict: "require_confirmation", reason: "All tools need approval" }],
      default: "allow",
    };
    const result = checkToolPolicy(policy, "web_search");
    expect(result.verdict).toBe("require_confirmation");
    expect(result.reason).toBe("All tools need approval");
  });

  it("exact match wins over wildcard", () => {
    const policy: ToolPolicy = {
      rules: [
        { toolName: "*", verdict: "require_confirmation" },
        { toolName: "web_search", verdict: "allow" },
      ],
      default: "deny",
    };
    // web_search has explicit allow — should win over wildcard require_confirmation
    expect(checkToolPolicy(policy, "web_search")).toEqual({ verdict: "allow" });
    // other tools fall through to wildcard
    expect(checkToolPolicy(policy, "run_code")).toEqual({
      verdict: "require_confirmation",
    });
  });

  it("exact match wins over wildcard regardless of rule order", () => {
    const policy: ToolPolicy = {
      rules: [
        { toolName: "run_code", verdict: "deny", reason: "Sandboxing off" },
        { toolName: "*", verdict: "allow" },
      ],
      default: "allow",
    };
    expect(checkToolPolicy(policy, "run_code").verdict).toBe("deny");
    expect(checkToolPolicy(policy, "web_fetch").verdict).toBe("allow");
  });

  it("result has no reason key when rule has no reason", () => {
    const policy: ToolPolicy = {
      rules: [{ toolName: "web_search", verdict: "allow" }],
      default: "allow",
    };
    const result = checkToolPolicy(policy, "web_search");
    expect(result.verdict).toBe("allow");
    expect("reason" in result).toBe(false);
  });

  it("default verdict has no reason key", () => {
    const policy: ToolPolicy = { rules: [], default: "require_confirmation" };
    const result = checkToolPolicy(policy, "anything");
    expect(result.verdict).toBe("require_confirmation");
    expect("reason" in result).toBe(false);
  });
});

describe("setGlobalToolPolicy", () => {
  it("replaces the global policy", () => {
    const newPolicy: ToolPolicy = {
      rules: [{ toolName: "run_code", verdict: "deny" }],
      default: "allow",
    };
    setGlobalToolPolicy(newPolicy);
    expect(globalToolPolicy).toBe(newPolicy);
  });

  it("starts as allow-all with no rules", () => {
    // Reset to original allow-all state
    setGlobalToolPolicy({ rules: [], default: "allow" });
    expect(globalToolPolicy.default).toBe("allow");
    expect(globalToolPolicy.rules).toHaveLength(0);
  });
});
