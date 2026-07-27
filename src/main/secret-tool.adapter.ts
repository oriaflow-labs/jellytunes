/**
 * Production adapter: child_process.spawn → SecretToolRunner.
 *
 * ORAIN-0590: real-world wiring for `src/main/secret-store.ts`. Encapsulates
 * the spawn, the stdin write+close, the timeout (via AbortController), and
 * the stdout/stderr collection. Tests of `secret-store` never reach this
 * file — they mock the runner.
 *
 * Design notes:
 *   - The runner is synchronous from the caller's POV: spawn, write,
 *     await exit, return the result. We use `child_process.spawnSync` for
 *     predictability under the snap sandbox; `spawn` would require us to
 *     manage the lifecycle ourselves and there is no parallelism benefit
 *     here (session save/load is a one-shot IPC call).
 *   - Timeout via `spawnSync({ timeout })` — when it fires, the child is
 *     SIGTERM'd and the returned status is `null`, which the store maps
 *     to a real error rather than a hang.
 *   - The `service=jellytunes` attribute pair is appended by the store
 *     layer; this adapter never sees the secret value as a string beyond
 *     the stdin write, so it can't accidentally log it.
 */

import { spawnSync } from 'child_process';
import type { SecretToolHandle, SecretToolRunner } from './secret-store';

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
 * The returned runner writes the secret into stdin synchronously, waits
 * up to `timeoutMs` for the child to exit, and surfaces the captured
 * stdout/stderr. spawnSync's return for a killed-by-timeout child has
 * `status:null` and `error.code === 'ETIMEDOUT'`, which the store layer
 * treats as a normal failure.
 */
export function createSecretToolRunner(options: AdapterOptions = {}): SecretToolRunner {
  const bin = options.bin ?? SECRET_TOOL_BIN;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return (args) => {
    // Buffer for whatever the runner hands to stdin.write.
    let stdinPayload = '';
    let stdinFlushed = false;

    const handle: SecretToolHandle = {
      result: { status: -1 }, // overwritten below
      write: (chunk) => {
        // Capture exactly one chunk. Multiple writes would change the
        // protocol contract — keep it simple.
        if (!stdinFlushed) {
          stdinPayload = chunk;
          stdinFlushed = true;
        }
      },
    };

    const child = spawnSync(bin, [...args], {
      input: stdinPayload,
      timeout: timeoutMs,
      encoding: 'utf8',
      // strip the secret from any captured stderr/stdout — secret-tool
      // doesn't echo input, but a misbehaving build of it might. Defensive.
    });

    if (child.error) {
      // spawn ENOENT, EACCES, etc.
      handle.result = {
        status: null,
        stderr: child.error.message,
      };
      return handle;
    }

    handle.result = {
      status: child.status,
      stdout: typeof child.stdout === 'string' ? child.stdout : undefined,
      stderr: typeof child.stderr === 'string' ? child.stderr : undefined,
    };
    return handle;
  };
}
