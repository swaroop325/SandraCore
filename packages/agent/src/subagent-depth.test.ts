import { describe, it, expect } from "vitest";
import {
  MAX_SUBAGENT_DEPTH,
  getCurrentDepth,
  runWithDepth,
  incrementDepth,
} from "./subagent-depth.js";

describe("MAX_SUBAGENT_DEPTH", () => {
  it("equals 3", () => {
    expect(MAX_SUBAGENT_DEPTH).toBe(3);
  });
});

describe("getCurrentDepth", () => {
  it("returns 0 outside any runWithDepth context", async () => {
    // Run in a fresh async context to ensure no leaked depth from other tests
    const depth = await Promise.resolve(getCurrentDepth());
    expect(depth).toBe(0);
  });
});

describe("runWithDepth", () => {
  it("exposes the provided depth inside the callback", async () => {
    let inner = -1;
    await runWithDepth(1, async () => {
      inner = getCurrentDepth();
    });
    expect(inner).toBe(1);
  });

  it("restores outer depth after the callback completes", async () => {
    let innerDepth = -1;
    let afterDepth = -1;
    await runWithDepth(2, async () => {
      innerDepth = getCurrentDepth();
    });
    afterDepth = getCurrentDepth();
    expect(innerDepth).toBe(2);
    expect(afterDepth).toBe(0);
  });

  it("supports nested runWithDepth calls", async () => {
    const depths: number[] = [];
    await runWithDepth(1, async () => {
      depths.push(getCurrentDepth()); // 1
      await runWithDepth(2, async () => {
        depths.push(getCurrentDepth()); // 2
        await runWithDepth(3, async () => {
          depths.push(getCurrentDepth()); // 3
        });
        depths.push(getCurrentDepth()); // back to 2
      });
      depths.push(getCurrentDepth()); // back to 1
    });
    expect(depths).toEqual([1, 2, 3, 2, 1]);
  });

  it("returns the value produced by the callback", async () => {
    const result = await runWithDepth(1, async () => "hello");
    expect(result).toBe("hello");
  });
});

describe("incrementDepth", () => {
  it("returns 1 when outside any depth context (current=0)", () => {
    expect(incrementDepth()).toBe(1);
  });

  it("returns current+1 inside a runWithDepth context", async () => {
    let next = -1;
    await runWithDepth(2, async () => {
      next = incrementDepth();
    });
    expect(next).toBe(3);
  });

  it("does not mutate the current context — subsequent calls still return current+1", async () => {
    let first = -1;
    let second = -1;
    await runWithDepth(1, async () => {
      first = incrementDepth();
      second = incrementDepth();
    });
    // Both should return 2 since incrementDepth does not update the store
    expect(first).toBe(2);
    expect(second).toBe(2);
  });
});
