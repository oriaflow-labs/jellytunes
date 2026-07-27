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

import { spawnSync, type SpawnSyncOptions } from 'child_process';
import type {
  RunnerInvocation,
  SecretToolHandle,
  SecretToolResult,
  SecretToolRunner,
} from './secret-store';
import type { Logger } from './logger-types';

const SECRET_TOOL_BIN = 'secret-tool';
const DEFAULT_TIMEOUT_MS = 2000;

/** Hard cap on how much stderr we will surface. Keeps the log bounded. */
const STDERR_LOG_CAP = 200;

/** Hard cap on each captured parent-process env var value. */
const ENV_VALUE_LOG_CAP = 120;

/**
 * Hard cap on the AGGREGATE size of the captured parent-env record. Each
 * captured value is also capped individually, but the sum (keys + values
 * + separators) must stay bounded so a pathologically long env record
 * never explodes the log. (ORAIN-0601 review — MEDIUM finding.)
 */
const PARENT_ENV_RECORD_CAP = 600;

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
  /**
   * Override `child_process.spawnSync`. Tests use this to drive the
   * timeout / spawn-error branches deterministically without racing
   * wall-clock `timeoutMs:1` (ORAIN-0601 review — LOW finding).
   */
  spawn?: (
    bin: string,
    args: readonly string[],
    opts: SpawnSyncOptions,
  ) => {
    status: number | null;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    error?: Error;
  };
}

const NOOP_LOGGER: Logger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};

/**
 * One-shot guard so we only emit the fallback warning once per process.
 * Production code wires `createElectronLogger()` through `initSecureStorageProvider`;
 * a missing logger indicates a wiring mistake that the AC1 diagnostic
 * channel would silently swallow. (ORAIN-0601 review — LOW finding.)
 */
let warnedAboutNoopLogger = false;

/**
 * Truncate a string so the TOTAL returned length never exceeds `cap`
 * characters. We surface only the leading slice — the most diagnostic
 * part — and append an explicit `[truncated]` marker when needed so
 * anyone reading the log knows the value was longer.
 *
 * Because the marker is appended on top of the slice, the *meaningful
 * content* length is at most `cap - TRUNCATE_MARKER.length` (currently
 * `cap - 12`). (ORAIN-0601 review — MEDIUM finding.)
 */
const TRUNCATE_MARKER = '…[truncated]';

function truncate(value: string, cap: number): string {
  if (value.length <= cap) return value;
  const sliceCap = Math.max(0, cap - TRUNCATE_MARKER.length);
  return `${value.slice(0, sliceCap)}${TRUNCATE_MARKER}`;
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
 * DBUS_SESSION_BUS_ADDRESS sometimes carries an opaque auth nonce appended
 * to the bus path (e.g. `unix:path=/run/user/1000/bus,guid=abcd1234…`).
 * Truncation alone leaves the nonce partially visible. We surface ONLY a
 * structural fingerprint of the address — the bus type and path — and
 * strip any tail values that could carry secret material. (ORAIN-0601
 * review — MEDIUM finding: defensive, not a known regression.)
 */
function sanitiseDbusAddress(raw: string): string {
  // Keep only the leading scheme and path. Drop anything after `,` which
  // may be a guid/nonce.
  const head = raw.split(',')[0]?.trim() ?? '';
  return head;
}

/**
 * Snapshot the diagnostic env keys at the moment of construction so
 * every log record carries the values the parent process actually
 * had when the runner ran — not whatever is set later in the test.
 *
 * Each captured value is bounded by `ENV_VALUE_LOG_CAP`, and the
 * aggregate record is bounded by `PARENT_ENV_RECORD_CAP` so the log
 * entry stays predictable.
 */
function captureParentEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of DIAGNOSTIC_ENV_KEYS) {
    const raw = env[key];
    if (typeof raw !== 'string' || raw.length === 0) {
      out[`${key}_UNSET`] = 'true';
      continue;
    }
    const cleaned = key === 'DBUS_SESSION_BUS_ADDRESS' ? sanitiseDbusAddress(raw) : raw;
    out[key] = truncate(cleaned, ENV_VALUE_LOG_CAP);
  }
  // Apply aggregate cap: walk entries in declaration order, drop trailing
  // ones once the running total would exceed the budget. The total
  // includes the JSON-like key/value pair length (keys + values + `:` + `, `).
  let used = 0;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(out)) {
    const entrySize = k.length + v.length + 4; // ~ "k": "v", "
    if (used + entrySize > PARENT_ENV_RECORD_CAP) {
      result[`${k}_TRUNCATED`] = 'true';
      continue;
    }
    result[k] = v;
    used += entrySize;
  }
  return result;
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
  if (options.logger === undefined) {
    // One-time warning so a misconfigured wiring does not silently
    // swallow every future secret-tool failure. Routed through the
    // (fallback) logger itself — production code never reaches for
    // `console.*` directly. When the fallback is the no-op logger, the
    // warning is silenced, which is exactly the misconfigured state
    // this branch is meant to flag: if a real logger is wired, the
    // signal is preserved. (ORAIN-0601 review — HIGH finding.)
    if (!warnedAboutNoopLogger) {
      warnedAboutNoopLogger = true;
      logger.warn(
        '[secret-tool.adapter] no logger injected — secret-tool failures will be silenced. Wire createElectronLogger() in src/main/index.ts.',
      );
    }
  }
  const parentEnvSnapshot = captureParentEnv(options.env ?? process.env);
  const exec = options.spawn ?? spawnSync;

  return (call) => {
    // Normalise both shapes of the runner contract:
    //   - string[] (legacy/test) — `args[0]` is the operation
    //   - RunnerInvocation — caller-provided `operationHint` wins, so the
    //     diagnostic log can distinguish `isAvailable()` (boot-time probe)
    //     from a real `lookup` (session restore). See ORAIN-0601 review.
    // The string[] shape has no `args` field, so we narrow on that.
    const isInvocationShape = !Array.isArray(call) && typeof call === 'object' && 'args' in call;
    const invocation: RunnerInvocation = isInvocationShape
      ? call
      : { args: call as readonly string[] };
    const args: readonly string[] = invocation.args;
    const operationHint = invocation.operationHint;
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
        const child = exec(bin, [...args], {
          input: stdinPayload,
          timeout: timeoutMs,
          encoding: 'utf8',
        });

        // ORAIN-0601 AC1: log every non-success path through the injected
        // logger. We intentionally do NOT log stdout — for `lookup`, that
        // channel carries the plaintext session, and we never want a log
        // dump to leak the secret.
        //
        // ORAIN-0601 (review): the boot-time availability probe
        // (`secretStore.isAvailable()`) executes `lookup` underneath — but
        // for AC1's diagnostic value we MUST keep those distinct from a real
        // session restore, otherwise the log cannot tell a first-launch
        // banner from a session-restore failure. The store layer tags the
        // probe with `operationHint: 'isAvailable'`; we honour that before
        // falling back to args[0].
        const KNOWN_OPERATIONS = new Set(['store', 'lookup', 'clear', 'isAvailable']);
        const operation =
          typeof operationHint === 'string' && KNOWN_OPERATIONS.has(operationHint)
            ? operationHint
            : KNOWN_OPERATIONS.has(args[0] ?? '')
              ? (args[0] as 'store' | 'lookup' | 'clear' | 'isAvailable')
              : 'unknown';

        if (child.error) {
          // spawn ENOENT, EACCES, etc. The Node child object ONLY carries
          // the error message — there is no separate stderr channel here.
          // Logging both `errorMessage` and `stderrTruncated` would
          // duplicate the same string. We emit a single record with the
          // error message classified as the spawn error (review MEDIUM
          // finding) and skip the redundant `stderrTruncated` field.
          const result: SecretToolResult = {
            status: null,
            stderr: child.error.message,
          };
          logger.error('secret-tool spawn failed', {
            operation,
            status: result.status,
            errorMessage: truncate(child.error.message, STDERR_LOG_CAP),
            stderrClassification: classifyStderr(result.status, result.stderr, child.error.message),
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
