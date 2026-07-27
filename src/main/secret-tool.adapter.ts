/**
 * Production adapter: child_process.spawn → SecretToolRunner.
 *
 * ORAIN-0590: real-world wiring for `src/main/secret-store.ts`. Encapsulates
 * the spawn, the stdin write, the timeout, and the stdout/stderr collection.
 * Tests of `secret-store` never reach this file — they mock the runner.
 *
 * Design notes:
 *   - The runner contract gives the store layer a `handle` whose `write`
 *     method pipes the secret into the child's stdin BEFORE the result is
 *     consulted. We model that with a lazy `result` getter: `spawnSync` is
 *     deferred until the store first reads `handle.result`, by which time
 *     it has already called `handle.write(secret)`. Without this, spawnSync
 *     would receive an empty stdin buffer, the child would see EOF, and
 *     `secret-tool store` would never record the secret.
 *   - We use `child_process.spawnSync` for predictability under the snap
 *     sandbox; `spawn` would require us to manage the lifecycle ourselves
 *     and there is no parallelism benefit here (session save/load is a
 *     one-shot IPC call).
 *   - Timeout via `spawnSync({ timeout })` — when it fires, the child is
 *     SIGTERM'd and the returned status is `null`, which the store maps
 *     to a real error rather than a hang.
 *   - The `service=jellytunes` attribute pair is appended by the store
 *     layer; this adapter never sees the secret value as a string beyond
 *     the stdin write, so it can't accidentally log it.
 */

import { spawnSync } from 'child_process';
import type { SecretToolHandle, SecretToolResult, SecretToolRunner } from './secret-store';

const SECRET_TOOL_BIN = 'secret-tool';
const DEFAULT_TIMEOUT_MS = 2000;

export interface AdapterOptions {
  /** Override the binary path (defaults to `secret-tool` from PATH). */
  bin?: string;
  /** Per-call timeout in ms. The runner returns `status:null` on timeout. */
  timeoutMs?: number;
}

/**
 * Build a `SecretToolRunner` backed by `child_process.spawnSync`.
 *
 * Returns a function that yields a `SecretToolHandle` whose `result` is
 * resolved lazily on first read — by which point the store must have
 * called `write(secret)`. See the file header for why ordering matters.
 */
export function createSecretToolRunner(options: AdapterOptions = {}): SecretToolRunner {
  const bin = options.bin ?? SECRET_TOOL_BIN;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return (args) => {
    // Buffer for whatever the runner hands to stdin.write. Must be settled
    // BEFORE spawnSync runs, so spawnSync is deferred until the store reads
    // `handle.result` (at which point it has already invoked `write`).
    let stdinPayload = '';
    let stdinFlushed = false;

    const handle: SecretToolHandle = {
      write: (chunk) => {
        // Capture exactly one chunk. Multiple writes would change the
        // protocol contract — keep it simple.
        if (!stdinFlushed) {
          stdinPayload = chunk;
          stdinFlushed = true;
        }
      },
      get result(): SecretToolResult {
        if (!stdinFlushed) {
          // Defence-in-depth: protect any future caller that reads `result`
          // before `write`. We don't want to spawn with an empty buffer
          // because that is the exact bug this module exists to avoid.
          throw new Error('secret-tool handle: read result before write(secret)');
        }
        const child = spawnSync(bin, [...args], {
          input: stdinPayload,
          timeout: timeoutMs,
          encoding: 'utf8',
        });

        if (child.error) {
          // spawn ENOENT, EACCES, etc.
          return {
            status: null,
            stderr: child.error.message,
          };
        }

        return {
          status: child.status,
          stdout: typeof child.stdout === 'string' ? child.stdout : undefined,
          stderr: typeof child.stderr === 'string' ? child.stderr : undefined,
        };
      },
    };

    return handle;
  };
}
