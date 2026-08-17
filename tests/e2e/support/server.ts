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
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`${url}/System/Info`, { headers: { 'X-Emby-Token': apiKey } });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Test Jellyfin unreachable at ${url} (${lastError}).\n${REBUILD_HINT}`);
}
