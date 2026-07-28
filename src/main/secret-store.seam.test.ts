// src/main/secret-store.seam.test.ts
//
// ORAIN-0615 AC2 — the seam test.
//
// Every pre-existing suite mocks BOTH sides of the store↔adapter contract:
// `secret-store.test.ts` hands the store a fake runner whose `result` is a
// plain property, and `secret-tool.adapter.test.ts` calls `write('')` by
// hand before reading `result`. The contract between them — "does the real
// store drive the real adapter into an actual spawn?" — was therefore
// uncovered by construction, and 44/44 green tests hid a bug that made
// `lookup`/`clear`/`isAvailable` throw before ever spawning a subprocess.
//
// This file closes that hole: REAL `createSecretToolRunner` + REAL
// `createSecretStore`, with `child_process.spawnSync` as the ONLY mock.
// If it ever passes while the production paths are broken again, the mock
// has crept up the stack — keep it pinned at the process boundary.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SpawnSyncOptions } from 'child_process';

interface FakeChild {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}

const spawnSyncMock = vi.fn<(bin: string, args: string[], opts: SpawnSyncOptions) => FakeChild>();

// The ONLY mock in this file — the real process boundary.
vi.mock('child_process', () => ({
  spawnSync: (bin: string, args: string[], opts: SpawnSyncOptions) =>
    spawnSyncMock(bin, args, opts),
}));

// Imported AFTER vi.mock so the adapter's static `spawnSync` binding
// resolves to the mock (vitest hoists vi.mock, but keep the order explicit
// for readers).
import { createSecretToolRunner } from './secret-tool.adapter';
import { createSecretStore } from './secret-store';
import type { Logger } from './logger-types';

interface CapturedRecord {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  context?: unknown;
}

function makeCapturingLogger(): { logger: Logger; records: CapturedRecord[] } {
  const records: CapturedRecord[] = [];
  const at =
    (level: CapturedRecord['level']) =>
    (message: string, context?: unknown): void => {
      records.push({ level, message, context });
    };
  return {
    logger: { error: at('error'), warn: at('warn'), info: at('info'), debug: at('debug') },
    records,
  };
}

/**
 * Build the real store on top of the real adapter. Nothing between them
 * is faked — only `spawnSync` underneath.
 */
function buildRealStack(): {
  store: ReturnType<typeof createSecretStore>;
  records: CapturedRecord[];
} {
  const { logger, records } = makeCapturingLogger();
  const runner = createSecretToolRunner({ logger, env: { PATH: '/usr/bin:/bin' } });
  return { store: createSecretStore({ runner, logger }), records };
}

describe('secret-store ↔ secret-tool.adapter seam (ORAIN-0615 AC2)', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  describe('read-only operations reach the subprocess', () => {
    it('isAvailable() spawns exactly once and returns true on status 0', async () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: 'session-blob\n', stderr: '' });
      const { store } = buildRealStack();

      await expect(store.isAvailable()).resolves.toBe(true);
      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
      expect(spawnSyncMock.mock.calls[0][0]).toBe('secret-tool');
      expect(spawnSyncMock.mock.calls[0][1]).toEqual(['lookup', 'service', 'jellytunes']);
    });

    it('isAvailable() spawns exactly once and returns true on status 1 (no entry yet)', async () => {
      spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: 'No such secret' });
      const { store } = buildRealStack();

      await expect(store.isAvailable()).resolves.toBe(true);
      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    });

    it('lookup() spawns exactly once and returns the stripped secret', async () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: 'session-blob\n', stderr: '' });
      const { store } = buildRealStack();

      await expect(store.lookup()).resolves.toBe('session-blob');
      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    });

    it('clear() spawns exactly once', async () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '' });
      const { store } = buildRealStack();

      await expect(store.clear()).resolves.toBeUndefined();
      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
      expect(spawnSyncMock.mock.calls[0][1]).toEqual(['clear', 'service', 'jellytunes']);
    });
  });

  describe('store() still pipes the secret over stdin', () => {
    it('spawns once with the secret on stdin, never in argv', async () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '' });
      const { store } = buildRealStack();

      await store.store('super-secret-session');

      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
      const [, args, opts] = spawnSyncMock.mock.calls[0];
      expect(opts.input).toBe('super-secret-session');
      expect(args.join(' ')).not.toContain('super-secret-session');
    });
  });

  describe('failures surface through the real adapter logger', () => {
    it('lookup() with an unreachable binary logs a spawn_error and throws', async () => {
      spawnSyncMock.mockReturnValue({
        status: null,
        error: new Error('spawnSync secret-tool ENOENT'),
      });
      const { store, records } = buildRealStack();

      await expect(store.lookup()).rejects.toThrow(/secret-tool lookup failed/);
      expect(spawnSyncMock).toHaveBeenCalledTimes(1);
      const errors = records.filter((r) => r.level === 'error');
      expect(errors).toHaveLength(1);
      expect(errors[0].context).toMatchObject({
        operation: 'lookup',
        stderrClassification: 'spawn_error',
      });
    });

    it('never logs the plaintext returned by a successful lookup', async () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: 'TOP-SECRET-TOKEN\n', stderr: '' });
      const { store, records } = buildRealStack();

      await store.lookup();

      expect(JSON.stringify(records)).not.toContain('TOP-SECRET-TOKEN');
    });
  });
});
