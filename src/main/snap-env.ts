/**
 * Snap environment detection (ORAIN-0573).
 *
 * Snap-managed apps have `SNAP` set to the snap mount path and `SNAP_NAME`
 * set to the snap's registered name (see https://snapcraft.io/docs/environment-variables).
 * Inside snap, `snapd` performs refreshes transparently, so the in-app update
 * banner should be suppressed — but the periodic ping to the stats/updates
 * endpoint must remain so we keep collecting anonymous usage data.
 */

export interface SnapEnv {
  /** True if both SNAP and SNAP_NAME are set (canonical snap runtime markers). */
  isSnap: boolean;
  /** Mount path of the running snap, or null when not running under snap. */
  snapPath: string | null;
  /** Registered snap name, or null when not running under snap. */
  snapName: string | null;
}

export interface SnapEnvSource {
  SNAP?: string | undefined;
  SNAP_NAME?: string | undefined;
}

/**
 * Pure function — decides whether the current process looks like a snap
 * runtime. Safe to unit-test by injecting an env-shaped object.
 *
 * We require both `SNAP` and `SNAP_NAME` because snapd always sets them
 * together; requiring both makes accidental matches (e.g. a process that
 * happens to export a `SNAP` var in CI) less likely.
 */
export function detectSnapEnv(env: SnapEnvSource): SnapEnv {
  const snapPath = typeof env.SNAP === 'string' && env.SNAP.length > 0 ? env.SNAP : null;
  const snapName =
    typeof env.SNAP_NAME === 'string' && env.SNAP_NAME.length > 0 ? env.SNAP_NAME : null;
  return {
    isSnap: snapPath !== null && snapName !== null,
    snapPath,
    snapName,
  };
}
