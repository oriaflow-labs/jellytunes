import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('readServerConfig', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'jellytunes-e2e-test-'));
    writeFileSync(
      join(tmp, '.server.json'),
      JSON.stringify({ url: 'http://default:8096', apiKey: 'k', userId: 'u' }),
    );
    writeFileSync(
      join(tmp, '.server.v11.json'),
      JSON.stringify({ url: 'http://v11:8096', apiKey: 'k11', userId: 'u11' }),
    );
    writeFileSync(
      join(tmp, '.server.v12.json'),
      JSON.stringify({ url: 'http://v12:8097', apiKey: 'k12', userId: 'u12' }),
    );
  });

  afterEach(() => rmSync(tmp, { recursive: true }));

  it('reads .server.json when no version given (backward compat)', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const { readServerConfig } = await import('./server');
    const cfg = readServerConfig();
    expect(cfg.url).toBe('http://default:8096');
  });

  it('reads .server.v11.json when version="v11"', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const { readServerConfig } = await import('./server');
    const cfg = readServerConfig('v11');
    expect(cfg.url).toBe('http://v11:8096');
  });

  it('reads .server.v12.json when version="v12"', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const { readServerConfig } = await import('./server');
    const cfg = readServerConfig('v12');
    expect(cfg.url).toBe('http://v12:8097');
  });

  it('throws with rebuild hint when per-version config missing', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    rmSync(join(tmp, '.server.v11.json'));
    const { readServerConfig } = await import('./server');
    expect(() => readServerConfig('v11')).toThrow(/rebuild\.sh v11/);
  });
});

describe('assertServerMajor', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'jellytunes-e2e-test-'));
    writeFileSync(
      join(tmp, '.server.json'),
      JSON.stringify({ url: 'http://default:8096', apiKey: 'k', userId: 'u' }),
    );
    writeFileSync(
      join(tmp, '.server.v11.json'),
      JSON.stringify({ url: 'http://v11:8096', apiKey: 'k11', userId: 'u11' }),
    );
    writeFileSync(
      join(tmp, '.server.v12.json'),
      JSON.stringify({ url: 'http://v12:8097', apiKey: 'k12', userId: 'u12' }),
    );
  });

  afterEach(() => rmSync(tmp, { recursive: true }));

  it('does not throw when major matches', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ServerVersion: '10.10.3' }), { status: 200 })) as typeof fetch;
    try {
      const { assertServerMajor } = await import('./server');
      await expect(assertServerMajor('v11', 10)).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('throws when major mismatches', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ServerVersion: '10.10.3' }), { status: 200 })) as typeof fetch;
    try {
      const { assertServerMajor } = await import('./server');
      await expect(assertServerMajor('v12', 12)).rejects.toThrow(/expected 12, got 10/);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('accepts Version field (real Jellyfin 10.10.3 returns Version, not ServerVersion)', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ Version: '10.10.3' }), { status: 200 })) as typeof fetch;
    try {
      const { assertServerMajor } = await import('./server');
      await expect(assertServerMajor('v11', 10)).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('authenticated requests use MediaBrowser auth header', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'jellytunes-e2e-test-'));
    writeFileSync(
      join(tmp, '.server.v11.json'),
      JSON.stringify({ url: 'http://v11:8096', apiKey: 'k11', userId: 'u11' }),
    );
  });

  afterEach(() => rmSync(tmp, { recursive: true }));

  it('assertServerReachable sends Authorization: MediaBrowser Token="<apiKey>"', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const origFetch = globalThis.fetch;
    let seenAuthHeader: string | undefined;
    let seenLegacyHeader: string | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seenAuthHeader = headers.get('Authorization') ?? undefined;
      seenLegacyHeader = headers.get('X-Emby-Token');
      return new Response(JSON.stringify({ Version: '10.10.3' }), { status: 200 });
    }) as typeof fetch;
    try {
      const { assertServerReachable } = await import('./server');
      await assertServerReachable('v11');
      expect(seenAuthHeader).toBe('MediaBrowser Token="k11"');
      expect(seenLegacyHeader).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('assertMediaDownloadable sends Authorization: MediaBrowser Token="<apiKey>"', async () => {
    process.env.E2E_CONFIG_DIR = tmp;
    const origFetch = globalThis.fetch;
    const seenHeaders: Array<string | null> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      seenHeaders.push(headers.get('Authorization'));
      if (url.includes('/Items?IncludeItemTypes=Audio')) {
        return new Response(JSON.stringify({ Items: [{ Id: 'track1' }] }), { status: 200 });
      }
      // /Items/track1/Download — return 200 with empty body
      return new Response('', { status: 200 });
    }) as typeof fetch;
    try {
      const { assertMediaDownloadable } = await import('./server');
      await assertMediaDownloadable('v11');
      // Both the list and the download calls must use the modern header
      expect(seenHeaders).toEqual(['MediaBrowser Token="k11"', 'MediaBrowser Token="k11"']);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
