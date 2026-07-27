// src/main/secret-store.test.ts
// Unit tests for the secret-tool wrapper.
//
// ORAIN-0590: replace `safeStorage` (broken under Snap strict confinement)
// with the libsecret CLI (`secret-tool`), which routes through the Secret
// portal even inside the confinement. The wrapper must:
//   1. Send the secret over stdin, never as argv (avoids /proc/<pid>/cmdline
//      exposure — any process on the host can read it).
//   2. Use a fixed `service=jellytunes` attribute so multiple installations
//      (dev + prod) don't collide on the same keyring slot.
//   3. Time out promptly on a hung `secret-tool` and surface that as a
//      regular failure (not a hang).
//
// Process execution is injected — tests don't touch the real keyring.
//
// Runner contract: `runner(args)` returns `{ result, write }`. The test
// wires `write` to a string buffer to assert exactly what was sent to
// stdin. The production adapter (`src/main/secret-tool.adapter.ts`)
// wires `write` to `child.stdin.write(chunk)` and closes the stream.

import { describe, it, expect, vi } from 'vitest';
import { createSecretStore, type SecretToolHandle, type SecretToolRunner } from './secret-store';

function makeHandle(result: SecretToolHandle['result'], captured: string[] = []): SecretToolHandle {
  return {
    result,
    write: (chunk) => {
      captured.push(chunk);
    },
  };
}

function ok(stdout = 'secret-value'): SecretToolHandle['result'] {
  return { status: 0, stdout };
}
function failed(status: number, stderr = 'boom'): SecretToolHandle['result'] {
  return { status, stderr };
}

describe('createSecretStore', () => {
  describe('store', () => {
    it('passes service=jellytunes to secret-tool store', async () => {
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner });

      await store.store('my-secret');

      expect(runner).toHaveBeenCalledWith([
        'store',
        '--label=jellytunes-session',
        'service',
        'jellytunes',
      ]);
    });

    it('sends the secret over stdin, never as an argv element', async () => {
      // CRITICAL: argv would expose the secret to any process on the host
      // via /proc/<pid>/cmdline. secret-tool reads it from stdin.
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner });

      await store.store('super-secret-api-key');

      const args = runner.mock.calls[0]![0];
      expect(args).not.toContain('super-secret-api-key');
      expect(args).not.toContain('super-secret');
      // Every part of argv must be a literal — no dynamic interpolation
      // with the secret.
      for (const arg of args) {
        expect(arg).not.toMatch(/super-secret/);
      }
    });

    it('writes the full secret to stdin', async () => {
      const captured: string[] = [];
      const runner: SecretToolRunner = () => makeHandle(ok(), captured);
      const store = createSecretStore({ runner });

      await store.store('hello-world');

      expect(captured.join('')).toBe('hello-world');
    });

    it('throws on non-zero exit code', async () => {
      const runner = vi
        .fn<SecretToolRunner>()
        .mockReturnValue(makeHandle(failed(1, 'keyring locked')));
      const store = createSecretStore({ runner });

      await expect(store.store('x')).rejects.toThrow(/keyring locked/);
    });
  });

  describe('lookup', () => {
    it('calls secret-tool lookup with the matching service attribute', async () => {
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok('recovered')));
      const store = createSecretStore({ runner });

      const result = await store.lookup();

      expect(runner).toHaveBeenCalledWith(['lookup', 'service', 'jellytunes']);
      expect(result).toBe('recovered');
    });

    it('returns null when the entry does not exist (exit code 1)', async () => {
      // secret-tool exits 1 when no entry matches — the absence of a
      // saved session is a normal state, not an error.
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(failed(1, '')));
      const store = createSecretStore({ runner });

      await expect(store.lookup()).resolves.toBeNull();
    });

    it('throws on unexpected exit codes with stderr attached', async () => {
      const runner = vi
        .fn<SecretToolRunner>()
        .mockReturnValue(makeHandle(failed(2, 'portal died')));
      const store = createSecretStore({ runner });

      await expect(store.lookup()).rejects.toThrow(/portal died/);
    });

    it('trims trailing newline that secret-tool appends', async () => {
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok('value\n')));
      const store = createSecretStore({ runner });

      await expect(store.lookup()).resolves.toBe('value');
    });
  });

  describe('clear', () => {
    it('calls secret-tool clear with the service attribute', async () => {
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner });

      await store.clear();

      expect(runner).toHaveBeenCalledWith(['clear', 'service', 'jellytunes']);
    });

    it('does not throw when there is nothing to clear (exit code 1)', async () => {
      // Clearing a non-existent entry is idempotent — clear is best-effort.
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(failed(1, '')));
      const store = createSecretStore({ runner });

      await expect(store.clear()).resolves.toBeUndefined();
    });
  });

  describe('availability probe', () => {
    it('reports available when secret-tool runs and answers a lookup', async () => {
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok('ok')));
      const store = createSecretStore({ runner });

      await expect(store.isAvailable()).resolves.toBe(true);
    });

    it('reports available when secret-tool exits 1 on lookup (no entry yet)', async () => {
      // Exit 1 means "no entry" — but the binary itself responded, so the
      // service is reachable. This is the cold-start path under snap.
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(failed(1, '')));
      const store = createSecretStore({ runner });

      await expect(store.isAvailable()).resolves.toBe(true);
    });

    it('reports unavailable when secret-tool exits 127 (not installed)', async () => {
      const runner = vi
        .fn<SecretToolRunner>()
        .mockReturnValue(makeHandle(failed(127, 'command not found')));
      const store = createSecretStore({ runner });

      await expect(store.isAvailable()).resolves.toBe(false);
    });

    it('reports unavailable when the runner throws (ENOENT)', async () => {
      const runner: SecretToolRunner = () => {
        throw new Error('ENOENT');
      };
      const store = createSecretStore({ runner });

      await expect(store.isAvailable()).resolves.toBe(false);
    });
  });

  describe('timeout handling', () => {
    it('treats a null status as timeout (not a hang)', async () => {
      // The runner is responsible for applying the timeout; when it can't
      // produce a result in time, it returns status:null. The store must
      // surface that as a normal failure rather than letting the await
      // hang indefinitely.
      const runner: SecretToolRunner = () => makeHandle({ status: null, stderr: 'timed out' });
      const store = createSecretStore({ runner, timeoutMs: 50 });

      // isAvailable must return false (not throw) on timeout — that is
      // what lets the selector fall back to safeStorage instead of
      // hanging the login screen.
      await expect(store.isAvailable()).resolves.toBe(false);
    });

    it('store rejects with a timeout-shaped error on status:null', async () => {
      const runner: SecretToolRunner = () => makeHandle({ status: null, stderr: 'killed' });
      const store = createSecretStore({ runner, timeoutMs: 50 });

      await expect(store.store('x')).rejects.toThrow(/timed out|killed|null/i);
    });
  });

  describe('attribute scope (multi-install collision)', () => {
    it('always uses the literal service=jellytunes attribute pair', async () => {
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner });

      await store.store('x');
      await store.lookup();
      await store.clear();

      for (const call of runner.mock.calls) {
        const args = call[0];
        expect(args).toContain('service');
        expect(args).toContain('jellytunes');
      }
    });
  });
});
