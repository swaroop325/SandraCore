/**
 * Detects nested repetition in regex patterns that cause catastrophic backtracking.
 * Examples of dangerous patterns: (a+)+  (a|a)*  (a*)*
 */

type TokenType =
  | "char"
  | "quantifier"  // * + ? {n,m}
  | "open_group"  // (
  | "close_group" // )
  | "alternation" // |
  | "char_class"  // [...]
  | "anchor";     // ^ $

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

function tokenize(pattern: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i]!;

    if (ch === "(") {
      // Skip non-capturing group prefix (?:, (?=, (?!, etc.)
      tokens.push({ type: "open_group", value: ch, position: i });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "close_group", value: ch, position: i });
      i++;
    } else if (ch === "*" || ch === "+") {
      const greedy = pattern[i + 1] !== "?";
      tokens.push({ type: "quantifier", value: greedy ? ch : ch + "?", position: i });
      i += greedy ? 1 : 2;
    } else if (ch === "?") {
      tokens.push({ type: "quantifier", value: ch, position: i });
      i++;
    } else if (ch === "{") {
      const end = pattern.indexOf("}", i);
      if (end === -1) {
        tokens.push({ type: "char", value: ch, position: i });
        i++;
      } else {
        tokens.push({ type: "quantifier", value: pattern.slice(i, end + 1), position: i });
        i = end + 1;
      }
    } else if (ch === "[") {
      // Scan to matching ]
      let j = i + 1;
      if (pattern[j] === "^") j++;
      if (pattern[j] === "]") j++; // ] as first char is literal
      while (j < pattern.length && pattern[j] !== "]") {
        if (pattern[j] === "\\") j++; // skip escaped char
        j++;
      }
      tokens.push({ type: "char_class", value: pattern.slice(i, j + 1), position: i });
      i = j + 1;
    } else if (ch === "|") {
      tokens.push({ type: "alternation", value: ch, position: i });
      i++;
    } else if (ch === "^" || ch === "$") {
      tokens.push({ type: "anchor", value: ch, position: i });
      i++;
    } else if (ch === "\\") {
      tokens.push({ type: "char", value: pattern.slice(i, i + 2), position: i });
      i += 2;
    } else {
      tokens.push({ type: "char", value: ch, position: i });
      i++;
    }
  }

  return tokens;
}

function hasNestedRepetition(tokens: Token[]): boolean {
  // Check if any group has a quantifier AND itself contains a quantifier
  // Stack-based group analysis
  const stack: { hasQuantifier: boolean; startIdx: number }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;

    if (tok.type === "open_group") {
      stack.push({ hasQuantifier: false, startIdx: i });
    } else if (tok.type === "close_group") {
      const frame = stack.pop();
      if (!frame) continue;

      // Check if the token AFTER the ) is a quantifier
      const next = tokens[i + 1];
      if (next?.type === "quantifier" && (next.value === "*" || next.value === "+" || next.value.startsWith("{"))) {
        // This group has an outer quantifier. Does it have an inner quantifier?
        if (frame.hasQuantifier) {
          return true; // Nested repetition found
        }
      }

      // Propagate: if this group is inside another group, the outer group now
      // contains content (the group itself may act as a repeating unit)
      if (stack.length > 0) {
        stack[stack.length - 1]!.hasQuantifier =
          stack[stack.length - 1]!.hasQuantifier ||
          frame.hasQuantifier;
      }
    } else if (tok.type === "quantifier") {
      // Mark current group as having a quantifier
      if (stack.length > 0) {
        stack[stack.length - 1]!.hasQuantifier = true;
      }
    }
  }

  return false;
}

export interface SafeRegexResult {
  safe: boolean;
  reason?: string;
}

/**
 * Check if a regex pattern is safe to compile (no ReDoS risk).
 * Returns { safe: true } if OK, { safe: false, reason } if dangerous.
 */
export function checkRegexSafety(pattern: string): SafeRegexResult {
  // First try to compile — catches syntax errors
  try {
    new RegExp(pattern);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { safe: false, reason: `Invalid regex syntax: ${msg}` };
  }

  const tokens = tokenize(pattern);

  if (hasNestedRepetition(tokens)) {
    return {
      safe: false,
      reason: `Nested repetition detected (e.g. (a+)+) — catastrophic backtracking risk`,
    };
  }

  return { safe: true };
}

/**
 * Compile a regex only if it passes safety checks.
 * Returns null if unsafe or invalid. Throws never.
 */
export function compileSafeRegex(
  source: string,
  flags?: string
): RegExp | null {
  const check = checkRegexSafety(source);
  if (!check.safe) return null;
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}
