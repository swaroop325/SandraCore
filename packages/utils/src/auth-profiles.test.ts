import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProfileManager } from "./auth-profiles.js";
import type { ProfileManager } from "./auth-profiles.js";

describe("createProfileManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the first profile when pool has one entry", () => {
    const mgr = createProfileManager([{ id: "p1", name: "Profile 1", credential: "key-1" }]);
    const p = mgr.getNext();
    expect(p).not.toBeNull();
    expect(p?.id).toBe("p1");
  });

  it("returns null when pool is empty", () => {
    const mgr = createProfileManager([]);
    expect(mgr.getNext()).toBeNull();
  });

  it("round-robins through profiles in order", () => {
    const mgr = createProfileManager([
      { id: "p1", name: "Profile 1", credential: "key-1" },
      { id: "p2", name: "Profile 2", credential: "key-2" },
      { id: "p3", name: "Profile 3", credential: "key-3" },
    ]);
    expect(mgr.getNext()?.id).toBe("p1");
    expect(mgr.getNext()?.id).toBe("p2");
    expect(mgr.getNext()?.id).toBe("p3");
    // Wraps back to p1
    expect(mgr.getNext()?.id).toBe("p1");
  });

  it("skips profiles where active === false", () => {
    const mgr = createProfileManager([
      { id: "p1", name: "Profile 1", credential: "key-1" },
      { id: "p2", name: "Profile 2", credential: "key-2" },
    ]);
    const profiles = mgr.listProfiles();
    const p1 = profiles.find((p) => p.id === "p1")!;
    p1.active = false;

    expect(mgr.getNext()?.id).toBe("p2");
    expect(mgr.getNext()?.id).toBe("p2"); // only p2 available
  });

  it("returns null when all profiles are inactive", () => {
    const mgr = createProfileManager([
      { id: "p1", name: "Profile 1", credential: "key-1" },
    ]);
    mgr.listProfiles()[0]!.active = false;
    expect(mgr.getNext()).toBeNull();
  });

  describe("recordFailure / recordSuccess", () => {
    it("increments consecutiveFailures on recordFailure", () => {
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);
      mgr.recordFailure("p1");
      mgr.recordFailure("p1");
      const p = mgr.listProfiles()[0]!;
      expect(p.consecutiveFailures).toBe(2);
    });

    it("sets lastFailureAt on recordFailure", () => {
      vi.useFakeTimers();
      const now = new Date("2026-01-01T00:00:00Z");
      vi.setSystemTime(now);

      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);
      mgr.recordFailure("p1");

      const p = mgr.listProfiles()[0]!;
      expect(p.lastFailureAt).toEqual(now);
    });

    it("resets consecutiveFailures and lastFailureAt on recordSuccess", () => {
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);
      mgr.recordFailure("p1");
      mgr.recordFailure("p1");
      mgr.recordSuccess("p1");

      const p = mgr.listProfiles()[0]!;
      expect(p.consecutiveFailures).toBe(0);
      expect(p.lastFailureAt).toBeNull();
    });

    it("is a no-op for unknown profileId", () => {
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);
      expect(() => mgr.recordFailure("nonexistent")).not.toThrow();
      expect(() => mgr.recordSuccess("nonexistent")).not.toThrow();
    });
  });

  describe("cooldown behavior", () => {
    it("skips a profile that has reached maxConsecutiveFailures within cooldown window", () => {
      vi.useFakeTimers();
      const mgr = createProfileManager(
        [
          { id: "p1", name: "P1", credential: "k1" },
          { id: "p2", name: "P2", credential: "k2" },
        ],
        { cooldownMs: 60_000, maxConsecutiveFailures: 3 },
      );

      mgr.recordFailure("p1");
      mgr.recordFailure("p1");
      mgr.recordFailure("p1"); // 3 failures — should now be in cooldown

      // p1 is in cooldown, only p2 should be returned
      expect(mgr.getNext()?.id).toBe("p2");
      expect(mgr.getNext()?.id).toBe("p2");
    });

    it("recovers profile automatically after cooldown elapses", () => {
      vi.useFakeTimers();
      const mgr = createProfileManager(
        [{ id: "p1", name: "P1", credential: "k1" }],
        { cooldownMs: 60_000, maxConsecutiveFailures: 3 },
      );

      mgr.recordFailure("p1");
      mgr.recordFailure("p1");
      mgr.recordFailure("p1");

      expect(mgr.getNext()).toBeNull(); // in cooldown

      // Advance past cooldown
      vi.advanceTimersByTime(60_001);

      expect(mgr.getNext()?.id).toBe("p1"); // recovered
    });

    it("does not recover before cooldown elapses", () => {
      vi.useFakeTimers();
      const mgr = createProfileManager(
        [{ id: "p1", name: "P1", credential: "k1" }],
        { cooldownMs: 60_000, maxConsecutiveFailures: 2 },
      );

      mgr.recordFailure("p1");
      mgr.recordFailure("p1");

      vi.advanceTimersByTime(59_999);
      expect(mgr.getNext()).toBeNull(); // still in cooldown
    });

    it("returns null when pool has one profile and it is in cooldown", () => {
      vi.useFakeTimers();
      const mgr = createProfileManager(
        [{ id: "p1", name: "P1", credential: "k1" }],
        { cooldownMs: 30_000, maxConsecutiveFailures: 1 },
      );

      mgr.recordFailure("p1");
      expect(mgr.getNext()).toBeNull();
    });

    it("uses default cooldownMs of 60_000 when not specified", () => {
      vi.useFakeTimers();
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);

      for (let i = 0; i < 3; i++) mgr.recordFailure("p1");

      vi.advanceTimersByTime(59_999);
      expect(mgr.getNext()).toBeNull();

      vi.advanceTimersByTime(2);
      expect(mgr.getNext()?.id).toBe("p1");
    });

    it("uses default maxConsecutiveFailures of 3 when not specified", () => {
      vi.useFakeTimers();
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);

      mgr.recordFailure("p1");
      mgr.recordFailure("p1");
      expect(mgr.getNext()?.id).toBe("p1"); // still available at 2 failures

      mgr.recordFailure("p1");
      expect(mgr.getNext()).toBeNull(); // now in cooldown at 3 failures
    });
  });

  describe("addProfile / removeProfile", () => {
    it("addProfile adds a new profile to the pool", () => {
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);
      mgr.addProfile({ id: "p2", name: "P2", credential: "k2" });

      const profiles = mgr.listProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles.find((p) => p.id === "p2")).toBeDefined();
    });

    it("new profile starts active with zero failures", () => {
      const mgr = createProfileManager([]);
      mgr.addProfile({ id: "p1", name: "P1", credential: "k1" });

      const p = mgr.listProfiles()[0]!;
      expect(p.active).toBe(true);
      expect(p.consecutiveFailures).toBe(0);
      expect(p.lastFailureAt).toBeNull();
    });

    it("removeProfile removes a profile from the pool", () => {
      const mgr = createProfileManager([
        { id: "p1", name: "P1", credential: "k1" },
        { id: "p2", name: "P2", credential: "k2" },
      ]);
      mgr.removeProfile("p1");

      const profiles = mgr.listProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.id).toBe("p2");
    });

    it("removeProfile is a no-op for unknown id", () => {
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);
      expect(() => mgr.removeProfile("nonexistent")).not.toThrow();
      expect(mgr.listProfiles()).toHaveLength(1);
    });

    it("round-robin continues correctly after removeProfile", () => {
      const mgr = createProfileManager([
        { id: "p1", name: "P1", credential: "k1" },
        { id: "p2", name: "P2", credential: "k2" },
        { id: "p3", name: "P3", credential: "k3" },
      ]);

      mgr.getNext(); // consumes p1
      mgr.removeProfile("p2"); // remove p2

      // Next should be p3 (not crash)
      const next = mgr.getNext();
      expect(next).not.toBeNull();
      expect(["p1", "p3"]).toContain(next?.id);
    });

    it("getNext returns null after all profiles removed", () => {
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);
      mgr.removeProfile("p1");
      expect(mgr.getNext()).toBeNull();
    });
  });

  describe("listProfiles", () => {
    it("returns a copy — mutations do not affect internal state beyond object references", () => {
      const mgr = createProfileManager([{ id: "p1", name: "P1", credential: "k1" }]);
      const list = mgr.listProfiles();
      list.push({ id: "fake", name: "F", credential: "x", active: true, lastFailureAt: null, consecutiveFailures: 0 });
      expect(mgr.listProfiles()).toHaveLength(1);
    });
  });

  describe("failover scenario", () => {
    it("falls back to next available profile when primary is in cooldown", () => {
      vi.useFakeTimers();
      const mgr = createProfileManager(
        [
          { id: "primary", name: "Primary", credential: "key-primary" },
          { id: "fallback", name: "Fallback", credential: "key-fallback" },
        ],
        { cooldownMs: 30_000, maxConsecutiveFailures: 2 },
      );

      // Primary fails twice — enters cooldown
      mgr.recordFailure("primary");
      mgr.recordFailure("primary");

      // Should transparently serve fallback
      const p = mgr.getNext();
      expect(p?.id).toBe("fallback");

      // After cooldown, primary is available again
      vi.advanceTimersByTime(30_001);
      // Both are now available; round-robin from cursor
      const recovered = mgr.getNext();
      expect(recovered).not.toBeNull();
    });
  });
});
