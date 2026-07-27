/**
 * Wrapper around the `secret-tool` CLI from libsecret.
 *
 * ORAIN-0590: replace `safeStorage` (broken under Snap strict confinement
 * — Electron's OSCrypt calls `org.freedesktop.Secret.Service.ReadAlias`
 * directly against gnome-keyring and AppArmor cuts it off) with
 * `secret-tool`, whose libsecret client detects the sandbox and routes
 * through the Secret portal. This gives us OS-backed encrypted session
 * storage inside the snap with no `password-manager-service` plug.
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

export interface SecretToolResult {
  /** Exit code. `null` when the process could not be spawned or was killed (timeout). */
  status: number | null;
  stdout?: string;
  stderr?: string;
}

export type StdinWriter = (chunk: string) => void;

export interface SecretToolHandle {
  result: SecretToolResult;
  /** Invoke with the full secret (or empty) to pipe to child stdin. Must be called exactly once. */
  write: StdinWriter;
}

export type SecretToolRunner = (args: readonly string[]) => SecretToolHandle;

export interface SecretStoreOptions {
  runner: SecretToolRunner;
  /**
   * Wall-clock budget hint for the probe. The runner is responsible for
   * enforcing it — `secret-store` just trusts the `status:null` convention
   * to mean "timed out".
   */
  timeoutMs?: number;
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
 * The keyring replied (even with "no entry"). Exit 0 and exit 1 both
 * prove `secret-tool` ran to completion — distinct from a real failure
 * (exit 127, signal, ENOENT, timeout).
 */
function keyringReachable(status: number | null): boolean {
  return status === 0 || status === 1;
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

export function createSecretStore(options: SecretStoreOptions): SecretStore {
  const { runner } = options;

  return {
    async store(secret: string): Promise<void> {
      const handle = runner(['store', `--label=${LABEL}`, ...ATTRS]);
      // Pipe the secret in one chunk — payload is small (<1 KB), single
      // write is simpler than streaming.
      handle.write(secret);
      const { result } = handle;
      if (timedOut(result)) throw buildError('store', result);
      if (result.status !== 0) throw buildError('store', result);
    },

    async lookup(): Promise<string | null> {
      const { result } = runner(['lookup', ...ATTRS]);
      if (timedOut(result)) throw buildError('lookup', result);
      if (result.status === 0) {
        // secret-tool appends a trailing newline — strip it.
        return (result.stdout ?? '').replace(/\n$/, '');
      }
      if (result.status === 1) {
        // "No such entry" — normal cold-start state.
        return null;
      }
      throw buildError('lookup', result);
    },

    async clear(): Promise<void> {
      const { result } = runner(['clear', ...ATTRS]);
      // Clearing a non-existent entry is fine — clear is idempotent.
      if (timedOut(result)) throw buildError('clear', result);
      if (result.status === null || result.status === 0 || result.status === 1) return;
      throw buildError('clear', result);
    },

    async isAvailable(): Promise<boolean> {
      try {
        const { result } = runner(['lookup', ...ATTRS]);
        return keyringReachable(result.status);
      } catch {
        // spawn ENOENT, EACCES, etc. — binary not on PATH.
        return false;
      }
    },
  };
}
