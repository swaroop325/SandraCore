export interface AuthProfile {
  id: string;
  name: string;
  /** API key or credential (can be a reference to a secret) */
  credential: string;
  /** Whether this profile is currently active */
  active: boolean;
  /** Timestamp of last failure, or null if healthy */
  lastFailureAt: Date | null;
  /** Number of consecutive failures */
  consecutiveFailures: number;
}

export interface ProfileManagerOptions {
  /** How long after a failure before retrying this profile (ms). Default: 60_000 */
  cooldownMs?: number;
  /** How many consecutive failures before marking profile as failed. Default: 3 */
  maxConsecutiveFailures?: number;
}

export interface ProfileManager {
  /** Get the next available profile using round-robin, skipping profiles in cooldown */
  getNext(): AuthProfile | null;
  /** Mark a profile as failed */
  recordFailure(profileId: string): void;
  /** Mark a profile as succeeded (resets consecutive failure count) */
  recordSuccess(profileId: string): void;
  /** Add a profile to the pool */
  addProfile(profile: Omit<AuthProfile, "consecutiveFailures" | "lastFailureAt" | "active">): void;
  /** Remove a profile from the pool */
  removeProfile(profileId: string): void;
  /** Get all profiles (including failed/cooling-down ones) */
  listProfiles(): AuthProfile[];
}

const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

export function createProfileManager(
  initialProfiles: Array<Omit<AuthProfile, "consecutiveFailures" | "lastFailureAt" | "active">>,
  options?: ProfileManagerOptions,
): ProfileManager {
  const cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const maxConsecutiveFailures = options?.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;

  const profiles: AuthProfile[] = initialProfiles.map((p) => ({
    ...p,
    active: true,
    lastFailureAt: null,
    consecutiveFailures: 0,
  }));

  // Round-robin cursor: index into profiles array
  let cursor = 0;

  function isAvailable(profile: AuthProfile): boolean {
    if (!profile.active) return false;
    if (profile.consecutiveFailures >= maxConsecutiveFailures) {
      // Allow recovery after cooldown period
      if (profile.lastFailureAt !== null) {
        const elapsed = Date.now() - profile.lastFailureAt.getTime();
        if (elapsed < cooldownMs) return false;
      }
    }
    return true;
  }

  function getNext(): AuthProfile | null {
    if (profiles.length === 0) return null;

    // Try all profiles starting from cursor using round-robin
    for (let i = 0; i < profiles.length; i++) {
      const idx = (cursor + i) % profiles.length;
      const profile = profiles[idx];
      if (profile !== undefined && isAvailable(profile)) {
        // Advance cursor past the one we just returned
        cursor = (idx + 1) % profiles.length;
        return profile;
      }
    }

    return null;
  }

  function recordFailure(profileId: string): void {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    profile.consecutiveFailures += 1;
    profile.lastFailureAt = new Date();
  }

  function recordSuccess(profileId: string): void {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;
    profile.consecutiveFailures = 0;
    profile.lastFailureAt = null;
  }

  function addProfile(
    p: Omit<AuthProfile, "consecutiveFailures" | "lastFailureAt" | "active">,
  ): void {
    profiles.push({
      ...p,
      active: true,
      lastFailureAt: null,
      consecutiveFailures: 0,
    });
  }

  function removeProfile(profileId: string): void {
    const idx = profiles.findIndex((p) => p.id === profileId);
    if (idx === -1) return;
    profiles.splice(idx, 1);
    // Clamp cursor so it doesn't go out of bounds
    if (profiles.length > 0) {
      cursor = cursor % profiles.length;
    } else {
      cursor = 0;
    }
  }

  function listProfiles(): AuthProfile[] {
    return [...profiles];
  }

  return { getNext, recordFailure, recordSuccess, addProfile, removeProfile, listProfiles };
}
