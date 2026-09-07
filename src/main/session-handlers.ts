// src/main/session-handlers.ts
//
// ORAIN-0564 SO-2: extract the encrypted session storage logic out of
// `src/main/index.ts` so the contract is unit-testable without booting
// Electron.
//
// The IPC handlers in `index.ts` are thin wrappers: they construct the
// `fs` and `log` adapters (the only Electron-aware pieces) and call
// these pure functions. All the shape-agnostic work — encrypt, write,
// read, decrypt, stale-blob cleanup, error reporting — lives here.
//
// The contract is intentionally agnostic to the payload shape. The
// renderer is responsible for never including the password in the
// plaintext (SO-1 strips it before calling `session:save`). The main
// process MUST NOT log the plaintext either, and the on-disk file
// MUST be the bytes the provider returned, not the raw plaintext.

import type { StorageProvider } from './secure-storage';

/** Narrow fs surface these handlers need — injected for testability. */
export interface SessionFs {
  existsSync(p: string): boolean;
  writeFileSync(p: string, data: Buffer | string): void;
  readFileSync(p: string): Buffer;
  unlinkSync(p: string): void;
}

/** Narrow logger surface — `electron-log` satisfies this. */
export interface SessionLogger {
  error(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
}

export type SaveSessionResult =
  | { success: true }
  | { success: false; reason: 'encryption_unavailable' | 'storage_error' };

export interface SaveSessionInput {
  provider: StorageProvider | null;
  filePath: string;
  plaintext: string;
  fs: SessionFs;
  log: SessionLogger;
}

export interface LoadSessionInput {
  provider: StorageProvider | null;
  filePath: string;
  fs: SessionFs;
  log: SessionLogger;
}

export interface ClearSessionInput {
  filePath: string;
  fs: SessionFs;
  log: SessionLogger;
}

/**
 * Encrypt `plaintext` and write the resulting bytes to `filePath`.
 *
 * On success returns `{success: true}`. When no provider is available
 * (the boot-time probe found no OS keyring) returns
 * `{success: false, reason: 'encryption_unavailable'}` so the renderer
 * can surface the no-persistence banner (ORAIN-0590 AC).
 *
 * The function never logs `plaintext` — a strict property asserted by
 * `session-handlers.test.ts`.
 */
export async function saveSession(input: SaveSessionInput): Promise<SaveSessionResult> {
  // STUB: full implementation lands in the GREEN commit. The current
  // shape is enough for the contract (null provider -> encryption_unavailable)
  // but every other branch is intentionally absent so the RED tests fail.
  if (!input.provider) {
    return { success: false, reason: 'encryption_unavailable' };
  }
  return { success: false, reason: 'storage_error' };
}

/**
 * Read the encrypted file, decrypt it, and return the original
 * plaintext. Returns `null` when:
 *   - no provider is available,
 *   - the file does not exist (no session),
 *   - the active provider can't decrypt the on-disk blob (stale,
 *     e.g. backend switched from safeStorage to secret-tool between
 *     runs). In that case the file is best-effort unlinked so the
 *     user doesn't get stuck in a loop.
 *
 * Never throws.
 */
export async function loadSession(_input: LoadSessionInput): Promise<string | null> {
  // STUB: full implementation lands in the GREEN commit.
  return null;
}

/**
 * Best-effort unlink of the session file. Errors are logged but not
 * surfaced — the renderer never awaits a meaningful return value.
 */
export async function clearSession(_input: ClearSessionInput): Promise<void> {
  // STUB: full implementation lands in the GREEN commit.
}
