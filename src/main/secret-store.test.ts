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
import {
  createSecretStore,
  MAX_SECRET_BYTES,
  type SecretToolHandle,
  type SecretToolRunner,
} from './secret-store';
import type { Logger } from './logger-types';

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

      expect(runner).toHaveBeenCalledWith({
        args: ['store', '--label=jellytunes-session', 'service', 'jellytunes'],
        operationHint: 'store',
      });
    });

    it('sends the secret over stdin, never as an argv element', async () => {
      // CRITICAL: argv would expose the secret to any process on the host
      // via /proc/<pid>/cmdline. secret-tool reads it from stdin.
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner });

      await store.store('super-secret-api-key');

      const call = runner.mock.calls[0]![0];
      const args: readonly string[] = Array.isArray(call)
        ? (call as readonly string[])
        : (call as { args: readonly string[] }).args;
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

    it('rejects oversized secrets (defence-in-depth cap)', async () => {
      // MAX_SECRET_BYTES is 64 KB. Anything above should throw *before* the
      // runner is called — a malformed renderer must not be able to push
      // multi-MB through `secret-tool store` stdin.
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner });
      const oversized = 'x'.repeat(MAX_SECRET_BYTES + 1);

      await expect(store.store(oversized)).rejects.toThrow(/too large/);
      expect(runner).not.toHaveBeenCalled();
    });

    it('accepts a secret at exactly the cap', async () => {
      // Boundary check — the cap is inclusive, not exclusive.
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner });
      const at = 'x'.repeat(MAX_SECRET_BYTES);

      await expect(store.store(at)).resolves.toBeUndefined();
      expect(runner).toHaveBeenCalledTimes(1);
    });

    it('measures the secret in UTF-8 bytes, not JS code units', async () => {
      // A 4-byte CJK char repeated `MAX_SECRET_BYTES/2` times is 2× the
      // cap in bytes but only half in `.length`. We must measure bytes.
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner });
      const cjk = '日'.repeat(MAX_SECRET_BYTES / 2 + 1); // > MAX_SECRET_BYTES bytes

      await expect(store.store(cjk)).rejects.toThrow(/too large/);
      expect(runner).not.toHaveBeenCalled();
    });

    it('invokes runner before reading result (lazy stdin population)', async () => {
      // Smoke check that the production-shaped protocol still holds:
      // runner is constructed, write(secret) populates the handle, then
      // the store reads result. The test mocks just simulate both steps.
      const captured: string[] = [];
      const order: string[] = [];
      const runner: SecretToolRunner = (call) => {
        const argv: readonly string[] = Array.isArray(call)
          ? (call as readonly string[])
          : (call as { args: readonly string[] }).args;
        order.push(`runner(${argv.join(' ')})`);
        return {
          get result(): SecretToolHandle['result'] {
            order.push('read result');
            return { status: 0 };
          },
          write: (chunk) => {
            order.push(`write(${chunk})`);
            captured.push(chunk);
          },
        };
      };
      const store = createSecretStore({ runner });

      await store.store('lazy-test-secret');

      expect(order[0]).toBe('runner(store --label=jellytunes-session service jellytunes)');
      expect(order).toContain('write(lazy-test-secret)');
      expect(order[order.length - 1]).toBe('read result');
      expect(captured.join('')).toBe('lazy-test-secret');
    });
  });

  describe('lookup', () => {
    it('calls secret-tool lookup with the matching service attribute', async () => {
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok('recovered')));
      const store = createSecretStore({ runner });

      const result = await store.lookup();

      expect(runner).toHaveBeenCalledWith({
        args: ['lookup', 'service', 'jellytunes'],
        operationHint: 'lookup',
      });
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

      expect(runner).toHaveBeenCalledWith({
        args: ['clear', 'service', 'jellytunes'],
        operationHint: 'clear',
      });
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
        const raw = call[0];
        const args: readonly string[] = Array.isArray(raw)
          ? (raw as readonly string[])
          : (raw as { args: readonly string[] }).args;
        expect(args).toContain('service');
        expect(args).toContain('jellytunes');
      }
    });
  });

  describe('isAvailable() diagnostics (ORAIN-0615 AC3)', () => {
    interface Captured {
      level: string;
      message: string;
      context?: unknown;
    }

    function makeCapturingLogger(): { logger: Logger; records: Captured[] } {
      const records: Captured[] = [];
      const at =
        (level: string) =>
        (message: string, context?: unknown): void => {
          records.push({ level, message, context });
        };
      return {
        logger: { error: at('error'), warn: at('warn'), info: at('info'), debug: at('debug') },
        records,
      };
    }

    it('emits exactly one record when the runner throws, then returns false', async () => {
      const { logger, records } = makeCapturingLogger();
      const runner: SecretToolRunner = () => {
        throw new Error('secret-tool handle: read result before write(secret)');
      };
      const store = createSecretStore({ runner, logger });

      await expect(store.isAvailable()).resolves.toBe(false);

      expect(records).toHaveLength(1);
      expect(records[0].level).toBe('error');
      expect(records[0].context).toMatchObject({ operation: 'isAvailable' });
    });

    it('truncates the error message at the 200-char cap', async () => {
      const { logger, records } = makeCapturingLogger();
      const runner: SecretToolRunner = () => {
        throw new Error('E'.repeat(500));
      };
      const store = createSecretStore({ runner, logger });

      await store.isAvailable();

      const ctx = records[0].context as { errorMessage: string };
      expect(ctx.errorMessage.length).toBeLessThanOrEqual(200);
      expect(ctx.errorMessage).toMatch(/truncated/);
    });

    it('never records the secret returned by the underlying lookup', async () => {
      const { logger, records } = makeCapturingLogger();
      const runner: SecretToolRunner = () => ({
        write: () => {},
        get result(): SecretToolHandle['result'] {
          // A throw AFTER the plaintext is in hand — the worst case for a
          // logger that reaches for whatever context is nearby.
          const err = new Error('boom') as Error & { stdout?: string };
          err.stdout = 'TOP-SECRET-SESSION';
          throw err;
        },
      });
      const store = createSecretStore({ runner, logger });

      await store.isAvailable();

      expect(JSON.stringify(records)).not.toContain('TOP-SECRET-SESSION');
    });

    it('stays silent and returns true on the normal reachable path', async () => {
      const { logger, records } = makeCapturingLogger();
      const runner = vi.fn<SecretToolRunner>().mockReturnValue(makeHandle(ok()));
      const store = createSecretStore({ runner, logger });

      await expect(store.isAvailable()).resolves.toBe(true);
      expect(records).toHaveLength(0);
    });
  });
});
