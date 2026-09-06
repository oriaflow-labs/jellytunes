import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAuthHeader } from './auth-headers';

export interface ServerConfig {
  url: string;
  apiKey: string;
  userId: string;
}

const REBUILD_HINT =
  'Run: bash tests/e2e/docker/rebuild.sh\n' +
  'Then: docker compose -f tests/e2e/docker-compose.v11.yml up -d';

const STARTUP_HINT = 'Run: docker compose -f tests/e2e/docker-compose.yml up -d';

const STALE_MOUNT_HINT =
  'The server has library metadata but cannot read the audio files. This usually\n' +
  'means the container is stale — its ./fixtures/music bind mount points at a path\n' +
  'that no longer exists (e.g. a removed git worktree).\n' +
  'Run: docker compose -f tests/e2e/docker-compose.yml down\n' +
  'Then: docker compose -f tests/e2e/docker-compose.yml up -d';

function configPath(version?: string): string {
  const dir = process.env.E2E_CONFIG_DIR ?? join(__dirname, '..');
  const name = version ? `.server.${version}.json` : '.server.json';
  return join(dir, name);
}

export function readServerConfig(version?: string): ServerConfig {
  const path = configPath(version);
  if (!existsSync(path)) {
    const hint = version ? `Run: bash tests/e2e/docker/rebuild.sh ${version}` : REBUILD_HINT;
    throw new Error(`Missing ${path}. The test Jellyfin has never been provisioned.\n${hint}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as ServerConfig;
}

export async function assertServerReachable(version?: string): Promise<void> {
  const { url, apiKey } = readServerConfig(version);
  const auth = { Authorization: buildAuthHeader({ token: apiKey }) };
  let lastError = 'no attempt made';
  let containerNotRunning = false;

  // Poll for 60 seconds (comfortably exceeds Jellyfin's ~22s startup time)
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${url}/System/Info`, { headers: auth });
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
export async function assertMediaDownloadable(version?: string): Promise<void> {
  const { url, apiKey } = readServerConfig(version);
  const auth = { Authorization: buildAuthHeader({ token: apiKey }) };

  const listRes = await fetch(`${url}/Items?IncludeItemTypes=Audio&Recursive=true&Limit=1`, {
    headers: auth,
  });
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

export async function assertServerMajor(version: string, expected: number): Promise<void> {
  const { url, apiKey } = readServerConfig(version);
  const res = await fetch(`${url}/System/Info`, {
    headers: { Authorization: buildAuthHeader({ token: apiKey }) },
  });
  if (!res.ok) {
    throw new Error(`Could not read /System/Info (HTTP ${res.status}) at ${url}.`);
  }
  // Jellyfin 10.10.x ships the version as `Version`; older builds used
  // `ServerVersion`. Read whichever the server sends so we cover both.
  const info = (await res.json()) as { Version?: string; ServerVersion?: string };
  const majorStr = (info.Version ?? info.ServerVersion ?? '').split('.')[0];
  const major = Number.parseInt(majorStr, 10);
  if (!Number.isFinite(major) || major !== expected) {
    throw new Error(
      `Wrong Jellyfin major for project ${version}: expected ${expected}, got ${info.Version ?? info.ServerVersion ?? '(missing)'}. ` +
        `Did you edit docker-compose.${version}.yml to point at the wrong image?`,
    );
  }
}

/**
 * Resolve which Jellyfin version the runner is targeting.
 *
 * Reads `process.argv` for `--project=...` and looks the project up in
 * `config.projects`. Prefers the project's declared `use.jellyfinVersion`;
 * falls back to `process.env.JELLYFIN_VERSION` so manual debug runs (no
 * `--project` flag, env exported in the shell) keep working.
 *
 * Returns `null` when nothing can be determined — the caller can then decide
 * to skip the preflight (multi-project run) or refuse to proceed.
 */
export type ResolvedTarget = {
  version: 'v11' | 'v12';
  expectedMajor: number;
};

export function resolveProjectTarget(
  config: {
    projects: Array<{
      name: string;
      use?: { jellyfinVersion?: string; jellyfinExpectedMajor?: number };
    }>;
  },
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedTarget | null {
  const projectArgs = argv.filter((a) => a.startsWith('--project='));
  // Multiple --project flags means multi-project run; per-project preflight
  // happens lazily in each fixture, so globalSetup does nothing here.
  if (projectArgs.length === 0) {
    const v = env.JELLYFIN_VERSION;
    if (v === 'v11' || v === 'v12') {
      return {
        version: v,
        expectedMajor:
          Number.parseInt(env.JELLYFIN_EXPECTED_MAJOR ?? '', 10) || (v === 'v11' ? 10 : 12),
      };
    }
    return null;
  }
  if (projectArgs.length > 1) {
    return null;
  }
  const projectName = projectArgs[0].slice('--project='.length);
  const project = config.projects.find((p) => p.name === projectName);
  if (!project?.use?.jellyfinVersion) return null;
  const version = project.use.jellyfinVersion;
  if (version !== 'v11' && version !== 'v12') return null;
  return {
    version,
    expectedMajor: project.use.jellyfinExpectedMajor ?? (version === 'v11' ? 10 : 12),
  };
}
