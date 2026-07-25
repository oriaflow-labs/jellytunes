/**
 * Update checker payload type shared between main and renderer.
 * ORAIN-0573: extend with `managedBySnap` so the renderer can choose the
 * right UI without doing its own snap detection.
 */
export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion: string;
  releaseUrl: string;
  /**
   * True when running under snap. The periodic ping still happens for
   * anonymous stats, but `updateAvailable` is forced to false because
   * snapd handles the refresh.
   */
  managedBySnap: boolean;
}

/**
 * Pure helper that decides what to return to the renderer given the raw
 * server response and a snap-runtime flag. Extracted so we can unit-test
 * the snap-suppression logic without faking electron's `net.fetch`.
 *
 * - If `managedBySnap` is true → force `updateAvailable = false`. We still
 *   surface `latestVersion` and `releaseUrl` for diagnostics (e.g. About
 *   modal copy), but the renderer MUST NOT show the update banner.
 * - Otherwise → behave exactly as before.
 */
export function buildUpdateCheckResult(
  raw: { latestVersion: string; releaseUrl: string; currentVersion: string },
  managedBySnap: boolean,
): UpdateCheckResult {
  const { latestVersion, releaseUrl, currentVersion } = raw;
  const realUpdateAvailable = latestVersion !== '' && latestVersion !== currentVersion;
  return {
    updateAvailable: managedBySnap ? false : realUpdateAvailable,
    latestVersion,
    releaseUrl,
    managedBySnap,
  };
}
