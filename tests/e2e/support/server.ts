import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ServerConfig {
  url: string;
  apiKey: string;
  userId: string;
}

const CONFIG_PATH = join(__dirname, '..', '.server.json');

const REBUILD_HINT =
  'Run: bash tests/e2e/docker/rebuild.sh\n' +
  'Then: docker compose -f tests/e2e/docker-compose.yml up -d';

const STARTUP_HINT = 'Run: docker compose -f tests/e2e/docker-compose.yml up -d';

const STALE_MOUNT_HINT =
  'The server has library metadata but cannot read the audio files. This usually\n' +
  'means the container is stale — its ./fixtures/music bind mount points at a path\n' +
  'that no longer exists (e.g. a removed git worktree).\n' +
  'Run: docker compose -f tests/e2e/docker-compose.yml down\n' +
  'Then: docker compose -f tests/e2e/docker-compose.yml up -d';

export function readServerConfig(): ServerConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing ${CONFIG_PATH}. The test Jellyfin has never been provisioned.\n${REBUILD_HINT}`,
    );
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as ServerConfig;
}

export async function assertServerReachable(): Promise<void> {
  const { url, apiKey } = readServerConfig();
  let lastError = 'no attempt made';
  let containerNotRunning = false;

  // Poll for 60 seconds (comfortably exceeds Jellyfin's ~22s startup time)
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${url}/System/Info`, { headers: { 'X-Emby-Token': apiKey } });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        // Don't continue early, continue normally with sleep
      } else {
        // Verify response body is valid JSON (not the "Server is loading" placeholder)
        const text = await res.text();
        try {
          JSON.parse(text);
          // Successfully parsed JSON — server is ready
          return;
        } catch {
          // Server returned 200 but body is not JSON — still loading
          lastError = 'server booting (loading placeholder returned)';
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      // Detect if container is not running (connection refused)
      if (message.includes('ECONNREFUSED')) {
        containerNotRunning = true;
      }
    }
    // Sleep after each attempt (including the last one for consistency)
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Provide targeted error message based on failure type
  if (containerNotRunning) {
    throw new Error(`Test Jellyfin container is not running at ${url}.\n${STARTUP_HINT}`);
  }

  throw new Error(
    `Test Jellyfin did not become ready within 60s at ${url} (last error: ${lastError}).\n${REBUILD_HINT}`,
  );
}

/**
 * Verify the server can actually serve an audio file, not just its metadata.
 *
 * A stale container keeps all its library metadata (baked into the image) but
 * loses access to the music files when its bind mount source disappears. That
 * failure is invisible to `assertServerReachable` and surfaces later as every
 * sync scenario failing with "Download failed: 404 Not Found". This check turns
 * that into one actionable error at setup time.
 */
export async function assertMediaDownloadable(): Promise<void> {
  const { url, apiKey } = readServerConfig();
  const auth = { 'X-Emby-Token': apiKey };

  const listRes = await fetch(
    `${url}/Items?IncludeItemTypes=Audio&Recursive=true&Limit=1`,
    { headers: auth },
  );
  if (!listRes.ok) {
    throw new Error(`Could not list audio items (HTTP ${listRes.status}).\n${REBUILD_HINT}`);
  }
  const list = (await listRes.json()) as { Items?: Array<{ Id: string }> };
  const trackId = list.Items?.[0]?.Id;
  if (!trackId) {
    throw new Error(`Test Jellyfin has no audio items — library is empty.\n${REBUILD_HINT}`);
  }

  const dlRes = await fetch(`${url}/Items/${trackId}/Download`, {
    headers: { ...auth, Range: 'bytes=0-0' },
  });
  if (!dlRes.ok) {
    throw new Error(
      `Test Jellyfin returned HTTP ${dlRes.status} downloading track ${trackId}.\n${STALE_MOUNT_HINT}`,
    );
  }
  // Drain the (tiny) body so the socket is released.
  await dlRes.arrayBuffer().catch(() => undefined);
}
