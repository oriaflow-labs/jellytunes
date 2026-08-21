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
 * a stable temporary id so the request is still valid — Jellyfin sees one
 * consistent temp device for the whole session until main finishes booting.
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
let tempContext: RenderAuthContext | null = null;

/**
 * Resolve deviceId + version once at boot. Safe to call before React mounts;
 * the returned promise is awaited at the top of `main.tsx` so subsequent calls
 * to `getRenderAuthContext()` always hit the cache.
 */
export async function primeRenderAuthContext(): Promise<void> {
  try {
    const [deviceId, version] = await Promise.all([
      window.api.getDeviceId(),
      window.api.getVersion(),
    ]);

    cachedContext = {
      deviceId,
      version,
      device: guessDeviceName(),
    };
    // Clear the temp fallback now that the real context is available.
    tempContext = null;
  } catch (err) {
    // IPC failed (main not ready, channel error, etc.). Log once and keep
    // using the stable temp fallback so requests stay valid.
    console.warn('[authContext] primeRenderAuthContext failed, using temp deviceId:', err);
    // tempContext is already set by getRenderAuthContext() if it was called early
  }
}

/** Test-only — clears the cache so tests can re-prime with mocked values. */
export function _resetRenderAuthContextForTests(): void {
  cachedContext = null;
  tempContext = null;
}

/** Returns the cached context, or a stable temporary fallback if prime hasn't run. */
export function getRenderAuthContext(): RenderAuthContext {
  if (cachedContext) return cachedContext;
  // Return a single stable temp context for the whole session (not a fresh
  // random id per call) so Jellyfin sees at most one temp device.
  tempContext ??= {
    deviceId: `${TEMP_DEVICE_PREFIX}${randomToken()}`,
    version: '0.0.0',
    device: guessDeviceName(),
  };
  return tempContext;
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
