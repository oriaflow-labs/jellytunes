/**
 * Jellyfin auth header helpers (e2e-local copy).
 *
 * Mirrors `src/shared/auth-headers.ts` (ORAIN-0562). Duplicated here instead
 * of imported because the e2e support layer must not depend on renderer code
 * — keeping the boundary clean lets the same harness run against stand-alone
 * Docker containers without dragging the build pipeline.
 *
 * Jellyfin deprecates `X-Emby-Token` / `X-MediaBrowser-Token` and can disable
 * them server-side via `<EnableLegacyAuthorization>false</EnableLegacyAuthorization>`
 * in config/system.xml (Jellyfin 10.11+). The v12 e2e container ships with
 * that flag set, so every authenticated call must use the modern header:
 *   Authorization: MediaBrowser Token="...", Client="...", Device="...", DeviceId="...", Version="..."
 * Only `Token` is required; the rest identify the client on the server's
 * "Active devices" dashboard. `DeviceId` must be stable across launches.
 *
 * Reference: https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f
 */

/** Canonical client identifier used by the e2e harness. */
export const AUTH_CLIENT = 'jellytunes-e2e';
/** Canonical device label for the e2e harness (the CI runner). */
export const AUTH_DEVICE = 'ci';
/** Stable device id so re-provisions don't register a fresh phantom device. */
export const AUTH_DEVICE_ID = 'jellytunes-e2e';
/** Version reported to Jellyfin's dashboard. */
export const AUTH_VERSION = '1.0.0';

/**
 * Build a single `Authorization` header value for Jellyfin.
 *
 * Format: `MediaBrowser Token="<token>"[, Field="<value>"]...`
 * Fields with empty/omitted values are skipped — emitting `DeviceId=""` would
 * create a phantom device on the server's dashboard.
 *
 * `Token` is intentionally optional to support the pre-auth provisioning
 * wizard (`/Startup/*`), which runs before any token exists.
 *
 * @param {object} input
 * @param {string} [input.token]
 * @param {string} [input.client]
 * @param {string} [input.device]
 * @param {string} [input.deviceId]
 * @param {string} [input.version]
 * @returns {string}
 */
export function buildAuthHeader(input) {
  const parts = [];
  if (input.token) parts.push(`Token="${sanitizeValue(input.token)}"`);
  if (input.client) parts.push(`Client="${sanitizeValue(input.client)}"`);
  if (input.device) parts.push(`Device="${sanitizeValue(input.device)}"`);
  if (input.deviceId) parts.push(`DeviceId="${sanitizeValue(input.deviceId)}"`);
  if (input.version) parts.push(`Version="${sanitizeValue(input.version)}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

/**
 * Strip characters that would corrupt the header value:
 * - `"` would terminate the quoted field early.
 * - `\r` / `\n` would inject a new header line (CRLF injection).
 * - `\0` is never valid in a header value.
 *
 * @param {string} value
 * @returns {string}
 */
function sanitizeValue(value) {
  return value.replace(/[\r\n"\0]/g, '');
}
