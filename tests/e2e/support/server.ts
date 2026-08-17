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
