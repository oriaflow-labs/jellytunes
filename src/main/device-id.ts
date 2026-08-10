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
 * No backup/replication — the file is local-only and a fresh id on reinstall
 * is acceptable (it would just look like a new device, which is what jellyfin
 * does anyway).
 */
import { app } from 'electron';
import { join } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const DEVICE_ID_FILENAME = 'device-id.txt';

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

  // Read first, only write if missing/invalid. This keeps behaviour identical
  // across restart boundaries: first run of a fresh install = write; every
  // later run = reuse.
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8').trim();
      if (raw && isLikelyUuid(raw)) {
        cached = raw;
        return raw;
      }
    } catch {
      // Fall through to generate a fresh id below.
    }
  }

  // Ensure the parent dir exists (userData is normally there, but defensive).
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const fresh = randomUUID();
  fs.writeFileSync(filePath, fresh, 'utf-8');
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
