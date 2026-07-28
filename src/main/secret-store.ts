/**
 * Wrapper around the `secret-tool` CLI from libsecret.
 *
 * ORAIN-0590: replace `safeStorage` (broken under Snap strict confinement
 * — Electron's OSCrypt calls `org.freedesktop.Secret.Service.ReadAlias`
 * directly against gnome-keyring and AppArmor cuts it off) with
 * `secret-tool`. The premise is that libsecret's client detects the
 * sandbox and routes through the Secret portal, giving us OS-backed
 * session storage with no `password-manager-service` plug.
 *
 * ORAIN-0615 — WHAT IS AND IS NOT VERIFIED. That premise has never been
 * exercised end-to-end. `SecretToolHandle.result` is a lazy getter in the
 * production adapter, and it used to throw unless `write()` had been
 * called first — which only `store()` does. So `lookup()`, `clear()` and
 * `isAvailable()` threw before spawning anything; `isAvailable()` caught
 * it, returned false, the selector fell through, and users saw "sessions
 * will not persist" from first launch on every Linux install, snap or
 * not. Zero subprocesses ran, so zero diagnostics existed.
 *
 * Fixed here + in the adapter (the guard is now per-operation), and
 * pinned by `secret-store.seam.test.ts`, which drives the REAL store
 * through the REAL adapter and mocks only `spawnSync` — the older suites
 * mocked both sides of this contract and so could not see the bug.
 *
 * Still open, and NOT to be described as working until confirmed on a
 * clean VM install:
 *   - `package.json` does not stage `libsecret-tools`, so the binary may
 *     simply be absent in the snap. It would now surface as a
 *     `spawn_error` record rather than as silence.
 *   - Whether the portal route actually satisfies AppArmor.
 *
 * Security properties:
 *   - The secret travels over stdin, NEVER as argv. argv is world-readable
 *     via `/proc/<pid>/cmdline` and would leak the API key to any process
 *     on the host.
 *   - The `service=jellytunes` attribute scope keeps dev/prod installs
 *     from overwriting each other in the same keyring (the keyring itself
 *     is per-user, so cross-user collisions aren't a concern).
 *
 * Process execution is injected via `runner` — tests mock it, the IPC
 * adapter in `src/main/index.ts` wires it to a real `spawn` with timeout.
 *
 * Runner contract: the runner returns both the process result AND a
 * `StdinWriter` that, when invoked, pipes its argument into the child's
 * stdin. The runner is responsible for closing stdin before returning so
 * secret-tool sees EOF and flushes its read.
 */

import type { Logger } from './logger-types';

/** Silent default so callers that don't inject a logger keep working. */
const NOOP_LOGGER: Logger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};

/**
 * Hard cap on the error message surfaced by the `isAvailable()` catch.
 * Mirrors `STDERR_LOG_CAP` in `secret-tool.adapter.ts` — duplicated rather
 * than imported because the adapter imports its types from THIS module, and
 * importing back would close a cycle.
 */
const ERROR_MESSAGE_LOG_CAP = 200;

const TRUNCATE_MARKER = '…[truncated]';

/** Cap total length at `cap`, marking the value as shortened. */
function truncate(value: string, cap: number): string {
  if (value.length <= cap) return value;
  return `${value.slice(0, Math.max(0, cap - TRUNCATE_MARKER.length))}${TRUNCATE_MARKER}`;
}

export interface SecretToolResult {
  /** Exit code. `null` when the process could not be spawned or was killed (timeout). */
  status: number | null;
  stdout?: string;
  stderr?: string;
}

export type StdinWriter = (chunk: string) => void;

export interface SecretToolHandle {
  /**
   * Result of running `secret-tool`. Tests set this directly; the production
   * adapter in `src/main/secret-tool.adapter.ts` exposes it as a lazy getter
   * so it can be populated AFTER `write(secret)` has piped the secret into
   * stdin. Reading the value via this accessor works against both shapes.
   */
  readonly result: SecretToolResult;
  /** Invoke with the full secret (or empty) to pipe to child stdin. Must be called exactly once. */
  write: StdinWriter;
}

/** Read `result` whether it's a plain property or a computed getter. */
function readResult(handle: SecretToolHandle): SecretToolResult {
  return handle.result;
}

/**
 * Run a `secret-tool` subprocess. Args are forwarded to the CLI; `operationHint`
 * is purely for ORAIN-0601 logging — it lets the caller (`secret-store`)
 * label `lookup` invocations as `lookup` vs `isAvailable` so the diagnostic
 * log can distinguish a boot-time probe from a real session restore.
 * Defaults to `args[0]` when omitted.
 */
export interface RunnerInvocation {
  args: readonly string[];
  operationHint?: string;
}

/**
 * Runner contract. Accepts EITHER a `RunnerInvocation` (preferred — the
 * adapter can label the call) OR a plain `readonly string[]` for backward
 * compatibility with legacy test mocks. Production callers always pass
 * the `RunnerInvocation` shape from `secret-store`.
 */
export type SecretToolRunner = (call: RunnerInvocation | readonly string[]) => SecretToolHandle;

export interface SecretStoreOptions {
  runner: SecretToolRunner;
  /**
   * Wall-clock budget hint for the probe. The runner is responsible for
   * enforcing it — `secret-store` just trusts the `status:null` convention
   * to mean "timed out".
   */
  timeoutMs?: number;
  /**
   * Structured logger (ORAIN-0615 AC3). `isAvailable()` deliberately
   * swallows every throw so a broken keyring cannot crash app boot — but
   * a silent `catch` is exactly what made ORAIN-0601 unfalsifiable from a
   * log. With a logger wired, the swallow leaves a trace.
   *
   * Optional so existing callers and test fixtures keep working; defaults
   * to a no-op.
   */
  logger?: Logger;
}

export interface SecretStore {
  store(secret: string): Promise<void>;
  lookup(): Promise<string | null>;
  clear(): Promise<void>;
  isAvailable(): Promise<boolean>;
}

/** Constant attribute pair — keeps the keyring entry unambiguous. */
const ATTRS = ['service', 'jellytunes'] as const;
const LABEL = 'jellytunes-session';

/**
 * Hard cap on the plaintext we will pipe to `secret-tool`. The real
 * Jellyfin session payload is ~1 KB; cap at 64 KB as defence-in-depth
 * against a malformed renderer pushing multi-MB through the IPC.
 * Anything above this is rejected before we ever spawn a subprocess.
 */
export const MAX_SECRET_BYTES = 64 * 1024;

/**
 * `secret-tool` exits 1 both for "no matching entry" AND for unrelated
 * failures that happen to share the same exit code — e.g. a locked
 * keyring that can't complete its interactive unlock prompt exits 1 with
 * stderr `secret-tool: user interaction failed`. The exit code alone
 * cannot tell these apart; only the wording can. Real-world "not found"
 * responses are either silent or say some variant of "no such" (see
 * `classifyStderr`'s `non_zero_exit_missing` bucket in
 * `secret-tool.adapter.ts`, which this mirrors) — anything else at
 * status 1 is a real failure and must not be swallowed as an empty
 * keyring.
 */
function isGenuineNotFound(result: SecretToolResult): boolean {
  if (result.status !== 1) return false;
  const stderr = result.stderr?.trim() ?? '';
  return stderr.length === 0 || /no such/i.test(stderr);
}

/**
 * The keyring replied with a real answer: found (exit 0) or genuinely
 * absent (exit 1, see `isGenuineNotFound`). Distinct from a failure that
 * also happens to exit 1 (e.g. interaction failure) or a real failure
 * (exit 127, signal, ENOENT, timeout).
 */
function keyringReachable(result: SecretToolResult): boolean {
  return result.status === 0 || isGenuineNotFound(result);
}

function timedOut(result: SecretToolResult): boolean {
  return result.status === null;
}

function buildError(operation: string, result: SecretToolResult): Error {
  const detail = timedOut(result)
    ? 'timed out'
    : `exit ${result.status}${result.stderr ? `: ${result.stderr}` : ''}`;
  return new Error(`secret-tool ${operation} failed — ${detail}`);
}

/**
 * Validate the secret we are about to pipe to `secret-tool`. We measure
 * UTF-8 byte length (Buffer.byteLength, not string length) so a multi-
 * byte payload cannot slip past a JS-string length check.
 */
function assertSecretFits(secret: string): void {
  const bytes = Buffer.byteLength(secret, 'utf8');
  if (bytes > MAX_SECRET_BYTES) {
    throw new Error(
      `secret-tool store: secret too large (${bytes} bytes, max ${MAX_SECRET_BYTES})`,
    );
  }
}

export function createSecretStore(options: SecretStoreOptions): SecretStore {
  const { runner } = options;
  const logger: Logger = options.logger ?? NOOP_LOGGER;

  return {
    async store(secret: string): Promise<void> {
      // Validate before invoking the runner — keeps oversized payloads out
      // of the subprocess entirely.
      assertSecretFits(secret);
      const handle = runner({
        args: ['store', `--label=${LABEL}`, ...ATTRS],
        operationHint: 'store',
      });
      // Pipe the secret in one chunk — payload is small (<1 KB), single
      // write is simpler than streaming. Must happen BEFORE we read
      // `handle.result`, because the production adapter evaluates result
      // lazily (see secret-tool.adapter.ts).
      handle.write(secret);
      const result = readResult(handle);
      if (timedOut(result)) throw buildError('store', result);
      if (result.status !== 0) throw buildError('store', result);
    },

    async lookup(): Promise<string | null> {
      const handle = runner({ args: ['lookup', ...ATTRS], operationHint: 'lookup' });
      const result = readResult(handle);
      if (timedOut(result)) throw buildError('lookup', result);
      if (result.status === 0) {
        // secret-tool appends a trailing newline — strip it.
        return (result.stdout ?? '').replace(/\n$/, '');
      }
      if (isGenuineNotFound(result)) {
        // "No such entry" — normal cold-start state.
        return null;
      }
      throw buildError('lookup', result);
    },

    async clear(): Promise<void> {
      const handle = runner({ args: ['clear', ...ATTRS], operationHint: 'clear' });
      const result = readResult(handle);
      // Clearing a non-existent entry is fine — clear is idempotent.
      if (timedOut(result)) throw buildError('clear', result);
      if (result.status === 0 || isGenuineNotFound(result)) return;
      throw buildError('clear', result);
    },

    async isAvailable(): Promise<boolean> {
      try {
        // AC1 (ORAIN-0601): the boot-time availability probe runs the same
        // `lookup` command, but for diagnostic purposes we want the log
        // record to say `operation: "isAvailable"` rather than `lookup` —
        // otherwise a banner-on-first-launch incident is indistinguishable
        // from a real session-restore failure. The runner contract accepts
        // a separate `operationHint`; the production adapter honours it.
        const handle = runner({ args: ['lookup', ...ATTRS], operationHint: 'isAvailable' });
        const result = readResult(handle);
        return keyringReachable(result);
      } catch (e: unknown) {
        // ORAIN-0615 AC3: this `catch` is why the ORAIN-0601 regression was
        // invisible. The adapter threw before spawning, this swallowed the
        // throw, `false` propagated to the selector, and the user saw only
        // "sessions will not persist" — no spawn, no log, nothing to grep.
        //
        // Note the adapter already reports spawn failures itself (they come
        // back as `status: null`, not as throws), so after the AC1 fix this
        // branch should be effectively unreachable. That is precisely why it
        // must not be silent: if it ever fires again, it is a defect in the
        // seam and we need to see it.
        //
        // We log the message only — truncated, never the stdout of the
        // underlying `lookup`, which carries the plaintext session.
        logger.error('secret-tool isAvailable probe threw', {
          operation: 'isAvailable',
          errorMessage: truncate(e instanceof Error ? e.message : String(e), ERROR_MESSAGE_LOG_CAP),
        });
        return false;
      }
    },
  };
}
