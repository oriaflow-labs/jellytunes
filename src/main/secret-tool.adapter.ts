/**
 * Production adapter: child_process.spawn → SecretToolRunner.
 *
 * ORAIN-0590: real-world wiring for `src/main/secret-store.ts`. Encapsulates
 * the spawn, the stdin write, the timeout, and the stdout/stderr collection.
 * Tests of `secret-store` never reach this file — they mock the runner.
 *
 * ORAIN-0601 (regression): this adapter must log every failure of
 * store/lookup/isAvailable through a structured logger so we can
 * reproduce the banner regression from inside a clean VM install.
 * The log record NEVER includes the stdout of a `lookup` call — that
 * channel carries the plaintext session in memory.
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
 *   - The logger is dependency-injected via `AdapterOptions.logger`. Tests
 *     pass a capturing fake; production wires `createElectronLogger()`.
 *     We never reach for `console.*` directly.
 *   - `lookup` success is silent (no noise in the normal path). Any
 *     non-zero status, any status:null, or any spawn error produces
 *     exactly one `error`-level log record carrying:
 *       * `operation`        — store | lookup | clear | isAvailable
 *       * `status`           — the raw exit code or null
 *       * `errorMessage`     — child.error.message if the process never ran
 *       * `stderrClassification` — sanitised category (timeout |
 *                                 spawn_error | non_zero_exit)
 *       * `stderrTruncated`  — first N chars of stderr, hard-capped
 *       * `parentEnv`        — truncated copies of PATH /
 *                                 DBUS_SESSION_BUS_ADDRESS / XDG_RUNTIME_DIR
 *                                 observed by the parent process at the
 *                                 moment the runner was constructed
 */

import { spawnSync } from 'child_process';
import type { SecretToolHandle, SecretToolResult, SecretToolRunner } from './secret-store';
import type { Logger } from './logger-types';

const SECRET_TOOL_BIN = 'secret-tool';
const DEFAULT_TIMEOUT_MS = 2000;

/** Hard cap on how much stderr we will surface. Keeps the log bounded. */
const STDERR_LOG_CAP = 200;

/** Hard cap on each captured parent-process env var value. */
const ENV_VALUE_LOG_CAP = 120;

/** Keys we capture from the parent process env for the diagnostic record. */
const DIAGNOSTIC_ENV_KEYS = ['PATH', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'] as const;

export interface AdapterOptions {
  /** Override the binary path (defaults to `secret-tool` from PATH). */
  bin?: string;
  /** Per-call timeout in ms. The runner returns `status:null` on timeout. */
  timeoutMs?: number;
  /**
   * Structured logger. If omitted, the adapter falls back to a no-op
   * logger so the silent-success path stays quiet under any wiring.
   * Never reach for `console` directly — production code goes through
   * the injected logger (ORAIN-0601 AC1).
   */
  logger?: Logger;
  /** Override the parent-process env (tests only — defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
}

const NOOP_LOGGER: Logger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};

/**
 * Truncate a string to at most `cap` characters total. We surface only
 * the leading slice — the most diagnostic part — and append an explicit
 * `[truncated]` marker so anyone reading the log knows the value was
 * longer. The total length NEVER exceeds `cap` so log readers can
 * rely on the bound.
 */
function truncate(value: string, cap: number): string {
  if (value.length <= cap) return value;
  // Reserve room for the marker.
  const marker = '…[truncated]';
  const sliceCap = Math.max(0, cap - marker.length);
  return `${value.slice(0, sliceCap)}${marker}`;
}

function classifyStderr(
  status: number | null,
  stderr: string | undefined,
  errorMessage: string | undefined,
): string {
  if (status === null) {
    return errorMessage ? 'spawn_error' : 'timeout';
  }
  if (status === 0) return 'success';
  if (!stderr || stderr.trim().length === 0) return 'non_zero_exit_silent';
  // Look at first line to bucket the failure mode.
  const head = stderr.split(/\r?\n/)[0]?.toLowerCase() ?? '';
  if (head.includes('portal')) return 'non_zero_exit_portal';
  if (head.includes('no such')) return 'non_zero_exit_missing';
  if (head.includes('locked') || head.includes('busy')) return 'non_zero_exit_locked';
  if (head.includes('permission') || head.includes('access denied'))
    return 'non_zero_exit_permission';
  return 'non_zero_exit_other';
}

/**
 * Snapshot the diagnostic env keys at the moment of construction so
 * every log record carries the values the parent process actually
 * had when the runner ran — not whatever is set later in the test.
 */
function captureParentEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of DIAGNOSTIC_ENV_KEYS) {
    const raw = env[key];
    if (typeof raw !== 'string' || raw.length === 0) {
      out[`${key}_UNSET`] = 'true';
      continue;
    }
    out[key] = truncate(raw, ENV_VALUE_LOG_CAP);
  }
  return out;
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
  const logger: Logger = options.logger ?? NOOP_LOGGER;
  const parentEnvSnapshot = captureParentEnv(options.env ?? process.env);

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

        // ORAIN-0601 AC1: log every non-success path through the injected
        // logger. We intentionally do NOT log stdout — for `lookup`, that
        // channel carries the plaintext session, and we never want a log
        // dump to leak the secret.
        const operation =
          args[0] === 'store' || args[0] === 'lookup' || args[0] === 'clear' ? args[0] : 'unknown';

        if (child.error) {
          // spawn ENOENT, EACCES, etc.
          const result: SecretToolResult = {
            status: null,
            stderr: child.error.message,
          };
          logger.error('secret-tool spawn failed', {
            operation,
            status: result.status,
            errorMessage: truncate(child.error.message, STDERR_LOG_CAP),
            stderrClassification: classifyStderr(result.status, result.stderr, child.error.message),
            stderrTruncated: result.stderr ? truncate(result.stderr, STDERR_LOG_CAP) : undefined,
            parentEnv: parentEnvSnapshot,
          });
          return result;
        }

        const result: SecretToolResult = {
          status: child.status,
          stdout: typeof child.stdout === 'string' ? child.stdout : undefined,
          stderr: typeof child.stderr === 'string' ? child.stderr : undefined,
        };

        // success: never log. non-zero or null: log once.
        if (result.status !== 0) {
          logger.error('secret-tool call failed', {
            operation,
            status: result.status,
            stderrClassification: classifyStderr(result.status, result.stderr, undefined),
            stderrTruncated: result.stderr ? truncate(result.stderr, STDERR_LOG_CAP) : undefined,
            parentEnv: parentEnvSnapshot,
          });
        }
        return result;
      },
    };

    return handle;
  };
}
