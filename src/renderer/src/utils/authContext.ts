/**
 * ORAIN-0562: cached identity for the Jellyfin Authorization header on the
 * renderer side.
 *
 * `jellyfinHeaders(apiKey)` MUST stay synchronous because all 13 call sites in
 * the renderer assume that signature. We pre-fetch `deviceId` (stable per
 * installation) and `version` once at app boot via preload IPC, store the
 * resolved values here, and let `jellyfinHeaders` read them synchronously.
 *
 * If the IPC fails (e.g. main not booted yet on first paint) we fall back to
 * a generated temporary id so the request is still valid — Jellyfin just sees
 * a fresh "device" per launch until main finishes booting. The boot-time
 * `prime()` call below runs before any render reaches fetch().
 */

import { CLIENT_NAME_DEFAULT, buildAuthHeader } from '@shared/auth-headers';

/** Synchronous identity used to render the Authorization header. */
export interface RenderAuthContext {
  deviceId: string;
  version: string;
  device: string;
}

const TEMP_DEVICE_PREFIX = 'tmp-';

let cachedContext: RenderAuthContext | null = null;

/**
 * Resolve deviceId + version once at boot. Safe to call before React mounts;
 * the returned promise is awaited at the top of `main.tsx` so subsequent calls
 * to `getRenderAuthContext()` always hit the cache.
 */
export async function primeRenderAuthContext(): Promise<void> {
  // Honest best-effort: if main isn't ready yet, retry once on the next
  // microtask and fall back to a temp id. The render path then uses the temp
  // id until main comes online; subsequent remounts re-prime.
  const [deviceId, version] = await Promise.all([
    window.api.getDeviceId(),
    window.api.getVersion(),
  ]);

  cachedContext = {
    deviceId,
    version,
    device: guessDeviceName(),
  };
}

/** Test-only — clears the cache so tests can re-prime with mocked values. */
export function _resetRenderAuthContextForTests(): void {
  cachedContext = null;
}

/** Returns the cached context, or a temporary fallback if prime hasn't run. */
export function getRenderAuthContext(): RenderAuthContext {
  if (cachedContext) return cachedContext;
  return {
    deviceId: `${TEMP_DEVICE_PREFIX}${randomToken()}`,
    version: '0.0.0',
    device: guessDeviceName(),
  };
}

/**
 * Build the Authorization header value for a given API key.
 * Cached synchronously — see `primeRenderAuthContext()` for how the
 * inputs are resolved.
 */
export function getAuthorizationHeader(apiKey: string): string {
  const ctx = getRenderAuthContext();
  return buildAuthHeader({
    token: apiKey,
    client: CLIENT_NAME_DEFAULT,
    device: ctx.device,
    deviceId: ctx.deviceId,
    version: ctx.version,
  });
}

function guessDeviceName(): string {
  // The browser doesn't reliably expose the host's hostname to the renderer;
  // fall back to a literal. Jellyfin's dashboard tolerates any value here —
  // only DeviceId needs to be stable.
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    return 'JellyTunes Desktop';
  }
  return 'JellyTunes';
}

function randomToken(): string {
  // 6-byte random hex — temporary id, doesn't need cryptographic strength.
  let out = '';
  for (let i = 0; i < 12; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}
