import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('login()', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'jellytunes-e2e-test-'));
    writeFileSync(
      join(tmp, '.server.v11.json'),
      JSON.stringify({ url: 'http://v11:8096', apiKey: 'k11', userId: 'u11' }),
    );
    writeFileSync(
      join(tmp, '.server.v12.json'),
      JSON.stringify({ url: 'http://v12:8097', apiKey: 'k12', userId: 'u12' }),
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  it('fills the auth form with the v11 per-version server config', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const fills: Array<{ testId: string; value: string }> = [];
    const page = {
      getByTestId: (testId: string) => ({
        waitFor: () => Promise.resolve(),
        fill: (value: string) => {
          fills.push({ testId, value });
          return Promise.resolve();
        },
        click: () => Promise.resolve(),
        first: () => ({
          click: () => Promise.resolve(),
        }),
      }),
    };

    const { login } = await import('./app');
    const { readServerConfig } = await import('./server');
    await login(page as never, readServerConfig('v11'));

    expect(fills).toContainEqual({ testId: 'server-url-input', value: 'http://v11:8096' });
    expect(fills).toContainEqual({ testId: 'api-key-input', value: 'k11' });
  });
});
