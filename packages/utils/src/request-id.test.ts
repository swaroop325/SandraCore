import { describe, it, expect } from "vitest";
import { generateRequestId, withRequestId, getRequestId, getOrGenerateRequestId } from "./request-id.js";

describe("generateRequestId", () => {
  it("generates a 12-char hex string", () => {
    const id = generateRequestId();
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, generateRequestId));
    expect(ids.size).toBe(100);
  });
});

describe("withRequestId / getRequestId", () => {
  it("returns the ID within the context", () => {
    let captured: string | undefined;
    withRequestId("test-id-123", () => {
      captured = getRequestId();
    });
    expect(captured).toBe("test-id-123");
  });

  it("returns undefined outside context", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("isolates nested contexts", () => {
    let inner: string | undefined;
    let outer: string | undefined;
    withRequestId("outer", () => {
      outer = getRequestId();
      withRequestId("inner", () => {
        inner = getRequestId();
      });
      // outer context still valid after inner exits
      expect(getRequestId()).toBe("outer");
    });
    expect(outer).toBe("outer");
    expect(inner).toBe("inner");
  });
});

describe("getOrGenerateRequestId", () => {
  it("returns current ID if in context", () => {
    withRequestId("ctx-id", () => {
      expect(getOrGenerateRequestId()).toBe("ctx-id");
    });
  });

  it("generates a new ID if no context", () => {
    const id = getOrGenerateRequestId();
    expect(id).toHaveLength(12);
  });
});
