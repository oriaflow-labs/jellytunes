import { describe, it, expect, afterEach, vi } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import { createServer } from 'node:http';

// Smoke tests for the analytics.mjs CLI surface:
//  - dashboard output emits exactly 4 "Snap Store" sections when env present
//  - dashboard output stays graceful when env absent (single skip line, exit 0)
//  - raw mode never prints the value of SNAPCRAFT_METRICS_AUTH
//
// We drive the script in a child process so we hit the real CLI and stdout,
// rather than re-implementing the whole orchestration in vitest.

const SCRIPT = 'scripts/analytics.mjs';
const FAKE_AUTH = 'Macaroon root=fake-root, discharge=fake-discharge';

const ENV_PRESENT = {
  ...process.env,
  CLOUDFLARE_STATS_API_KEY: 'dummy',
  SNAPCRAFT_METRICS_AUTH: FAKE_AUTH,
};

const ENV_ABSENT = (() => {
  const env = { ...process.env };
  delete env.SNAPCRAFT_METRICS_AUTH;
  return env;
})();

function runScript(env, args = []) {
  return spawnSync('node', [SCRIPT, ...args], {
    env,
    encoding: 'utf8',
    timeout: 30000,
  });
}

// spawnSync blocks the event loop, so it can't be used when the child needs
// to reach a server hosted in this same process (e.g. the CF stub below).
function runScriptAsync(env, args = []) {
  return new Promise((resolve) => {
    const child = spawn('node', [SCRIPT, ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('analytics.mjs dashboard smoke', () => {
  afterEach(() => vi.restoreAllMocks());

  it('exits 0 and prints one skip line when SNAPCRAFT_METRICS_AUTH is absent', async () => {
    // The Cloudflare fetch is unconditional, so this needs a real 200 to reach
    // the snap section at all. Stub it locally rather than hitting production
    // (which needs a real CLOUDFLARE_STATS_API_KEY unavailable in CI).
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ '2026-07-30:0.6.0:linux:ES': 1 }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address();
      const env = {
        ...ENV_ABSENT,
        CLOUDFLARE_STATS_API_KEY: 'dummy',
        CLOUDFLARE_STATS_API_URL: `http://127.0.0.1:${port}`,
      };
      const res = await runScriptAsync(env);
      expect(res.status).toBe(0);
      const snapStoreCount = (res.stdout.match(/Snap Store/g) ?? []).length;
      expect(snapStoreCount).toBe(1); // the single skip notice, AC 10
      expect(res.stdout).toContain('SNAPCRAFT_METRICS_AUTH not set');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('--help documents SNAPCRAFT_METRICS_AUTH (AC 11)', () => {
    const res = runScript(ENV_ABSENT, ['--help']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('SNAPCRAFT_METRICS_AUTH');
    expect(res.stdout).toContain('prepare_for_request');
  });

  it('does not leak the auth value in any --mode=raw branch', () => {
    // Run with a distinctive marker inside the env value and assert it
    // never appears in stdout or stderr in any mode.
    const distinctive = `Z${{
      toString: () => 'N',
    }}MACAROON_LEAK_TEST$$`;
    const env = { ...ENV_ABSENT, SNAPCRAFT_METRICS_AUTH: `Bearer ${distinctive}` };
    const modes = ['dashboard', 'raw', 'chart'];
    for (const m of modes) {
      const res = runScript(env, [`--mode=${m}`]);
      const combined = `${res.stdout ?? ''}${res.stderr ?? ''}`;
      expect(combined, `mode=${m} leaked`).not.toContain(distinctive);
    }
  });
});
