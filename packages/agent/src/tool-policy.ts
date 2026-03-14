export type PolicyVerdict = "allow" | "deny" | "require_confirmation";

export interface ToolPolicyRule {
  /** Tool name pattern (exact match or "*" wildcard) */
  toolName: string;
  verdict: PolicyVerdict;
  /** Optional reason shown when denied */
  reason?: string;
}

export interface ToolPolicy {
  rules: ToolPolicyRule[];
  /** Default verdict if no rule matches */
  default: PolicyVerdict;
}

export interface PolicyCheckResult {
  verdict: PolicyVerdict;
  reason?: string;
}

/**
 * Check a tool call against a policy.
 * Returns the first matching rule's verdict, or the default.
 * Exact match wins over wildcard.
 */
export function checkToolPolicy(policy: ToolPolicy, toolName: string): PolicyCheckResult {
  // First pass: look for exact match
  for (const rule of policy.rules) {
    if (rule.toolName === toolName) {
      return {
        verdict: rule.verdict,
        ...(rule.reason !== undefined ? { reason: rule.reason } : {}),
      };
    }
  }

  // Second pass: look for wildcard match
  for (const rule of policy.rules) {
    if (rule.toolName === "*") {
      return {
        verdict: rule.verdict,
        ...(rule.reason !== undefined ? { reason: rule.reason } : {}),
      };
    }
  }

  // No rule matched — return default
  return { verdict: policy.default };
}

/** Global policy — starts as allow-all. Can be replaced at startup. */
export let globalToolPolicy: ToolPolicy = {
  rules: [],
  default: "allow",
};

export function setGlobalToolPolicy(policy: ToolPolicy): void {
  globalToolPolicy = policy;
}
