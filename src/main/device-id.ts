/**
 * Stable per-installation DeviceId for Jellyfin auth.
 *
 * ORAIN-0562: Jellyfin's Authorization header wants `DeviceId="..."`. The id
 * MUST survive app restarts — regenerating on every boot registers a new
 * device on the user's Jellyfin dashboard ("Active devices" list fills up
 * with phantom JellyTunes sessions) and breaks per-device playback state.
 *
 * Persistence: a single `device-id.txt` inside Electron's `userData` dir.
 * Generation: UUIDv4 via Node's `crypto.randomUUID()` (RFC 4122 random).
 * Atomic write: write to a `.tmp` sibling then `fs.renameSync` so a crash
 * mid-write never leaves a corrupt/empty file.
 * File permissions: `0o600` so only the owning user can read the id.
 * No backup/replication — the file is local-only and a fresh id on reinstall
 * is acceptable (it would just look like a new device, which is what jellyfin
 * does anyway).
 */
import { app } from 'electron';
import { join } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const DEVICE_ID_FILENAME = 'device-id.txt';
const TMP_SUFFIX = '.tmp';

/** In-memory cache so we don't re-read the file on every fetch. */
let cached: string | null = null;

function deviceIdFilePath(): string {
  return join(app.getPath('userData'), DEVICE_ID_FILENAME);
}

function isLikelyUuid(value: string): boolean {
  // Loose UUID check — accepts v4 (and any future v where the first nibble of
  // the third group is `4`). Jellyfin treats this as opaque, so we only check
  // it's not empty junk.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Returns the stable DeviceId for this installation, generating and persisting
 * one on first call.
 */
export function getOrCreateDeviceId(): string {
  if (cached) return cached;

  const filePath = deviceIdFilePath();

  // Try to read the existing file. Use a single readFileSync in a try/catch
  // instead of existsSync + readFileSync (TOCTOU race + extra syscall).
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (raw && isLikelyUuid(raw)) {
      cached = raw;
      return raw;
    }
    // File exists but content is invalid (not a UUID) — fall through to regenerate.
  } catch (err: unknown) {
    // ENOENT (file missing) or any read error — fall through to generate.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[device-id] read failed, regenerating:', err);
    }
  }

  const fresh = randomUUID();
  // Atomic write: write to .tmp sibling then rename into place so a crash
  // mid-write never leaves a corrupt/empty device-id.txt.
  const tmpPath = filePath + TMP_SUFFIX;
  fs.writeFileSync(tmpPath, fresh, { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
  // Also set mode on the final file (some fs implementations may preserve
  // the tmp file's mode through rename, but be explicit).
  fs.chmodSync(filePath, 0o600);

  cached = fresh;
  return fresh;
}

/**
 * Test-only — clears the in-memory cache so we can simulate an app restart
 * without actually restarting the process. Never call from production code.
 */
export function resetDeviceIdCacheForTests(): void {
  cached = null;
}
