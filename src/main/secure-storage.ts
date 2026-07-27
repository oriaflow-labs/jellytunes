/**
 * Provider selector for OS-backed encrypted session storage.
 *
 * ORAIN-0590: replace the boolean guard around Electron's `safeStorage`
 * with a small provider interface. Two providers exist, both exposing
 * `encrypt`/`decrypt` over `Buffer`:
 *
 *   - **secret-tool** (preferred on Linux). libsecret CLI, routed through
 *     the Secret portal inside the Snap strict confinement — the path
 *     that AppArmor allows. Does not require the `password-manager-service`
 *     plug; that interface is removed from the snap entirely.
 *
 *   - **safeStorage** (everywhere else, plus Linux fallback). Electron's
 *     built-in, backed by macOS Keychain / Windows DPAPI / libsecret
 *     reachable on non-snap Linux installs. Under Snap strict confinement
 *     this is still blocked, so the selector only picks it on Linux when
 *     `secret-tool` is genuinely unavailable.
 *
 * Stale-blob safety: when the previously-active provider (safeStorage on
 * Snap) produced a blob on disk and the new provider takes over, the
 * load path sees a missing/corrupt entry and returns null rather than
 * throwing. The user is dropped to the login screen — the AC6 contract.
 */

export type LinuxStorageBackend =
  | 'basic_text'
  | 'gnome_libsecret'
  | 'kwallet'
  | 'kwallet5'
  | 'kwallet6'
  | 'unknown';

/**
 * Read-only probe — what the ORAIN-0571 guard needed.
 * Kept separate from the full crypto interface so legacy callers (and
 * tests that only care about availability) don't have to mock the
 * encrypt/decrypt methods.
 */
export interface SecureStorageLike {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): LinuxStorageBackend;
}

/**
 * Full safeStorage surface — what the safeStorage provider actually needs
 * at runtime. A normal Electron `safeStorage` import satisfies this.
 */
export interface FullSecureStorageLike extends SecureStorageLike {
  encryptString(plain: string): Buffer;
  decryptString(buf: Buffer): string;
}

/**
 * Minimal contract the selector needs from the secret-tool wrapper.
 * Matches `SecretStore` in `secret-store.ts` — kept narrow here so this
 * file has no upstream dependency on the wrapper.
 */
export interface SecretStorageLike {
  isAvailable(): Promise<boolean>;
  store(secret: string): Promise<void>;
  lookup(): Promise<string | null>;
  clear(): Promise<void>;
  /**
   * Selector hint: production wrappers cache the resolved `isAvailable()`
   * boolean at startup and expose it here so the synchronous selector
   * can pick a provider without re-awaiting on every call. When absent,
   * the selector treats `secret-tool` as unreachable.
   */
  availabilityCached?: boolean;
}

/** Linux backends backed by a real OS/desktop keyring. */
const SECURE_LINUX_BACKENDS = new Set<LinuxStorageBackend>([
  'gnome_libsecret',
  'kwallet',
  'kwallet5',
  'kwallet6',
]);

/**
 * Legacy boolean guard (ORAIN-0571). Kept exported for any caller that
 * still wants a yes/no answer — `createSecureStorageProvider` is the
 * preferred entry point now.
 */
export function isSecureStorageAvailable(storage: SecureStorageLike): boolean {
  if (!storage.isEncryptionAvailable()) return false;
  if (process.platform !== 'linux') return true;
  return SECURE_LINUX_BACKENDS.has(storage.getSelectedStorageBackend());
}

export interface StorageProvider {
  /** Identifier for diagnostics and tests. */
  readonly kind: 'secret-tool' | 'safeStorage';
  encrypt(plaintext: string): Promise<Buffer>;
  /**
   * Returns the plaintext on success, or null when the stored blob cannot
   * be read with the active provider (missing entry, wrong backend, etc).
   * Never throws on stale-blob mismatches — that would crash the renderer.
   */
  decrypt(buf: Buffer): Promise<string | null>;
}

export interface SelectProviderInput {
  secretStore: SecretStorageLike;
  safeStorage: FullSecureStorageLike;
}

/**
 * Build the provider that should handle `session:save` / `session:load`.
 *
 * Selection rules:
 *   - On macOS / Windows → `safeStorage` (no probe of secret-tool, since
 *     libsecret is not the primary keyring on those platforms).
 *   - On Linux → probe `secret-tool` first; if reachable, use it.
 *   - On Linux, if secret-tool is not reachable but safeStorage is
 *     backed by a real keyring (libsecret/kwallet, not basic_text),
 *     fall back to safeStorage.
 *   - Otherwise → null. The IPC handler returns `encryption_unavailable`
 *     and the renderer shows the no-persistence banner (ORAIN-0590 AC).
 *
 * The probe is async but the selector is sync — we deliberately accept
 * an already-resolved `secretStore` so the IPC handler can `await` the
 * probe once at startup and reuse the same handle for every call.
 */
export function createSecureStorageProvider(input: SelectProviderInput): StorageProvider | null {
  const { safeStorage } = input;

  if (process.platform !== 'linux') {
    return safeStorage.isEncryptionAvailable() ? makeSafeStorageProvider(safeStorage) : null;
  }

  // Linux: pick the best available. We can't await here — callers inject
  // a pre-resolved handle. For tests, isAvailable is sync via a mock.
  // We use a small trick: read the resolved boolean off a synchronous
  // hint on the input. Production wires this via an async factory in
  // `src/main/index.ts` that resolves `isAvailable()` once.
  return pickLinuxProvider(input);
}

/**
 * The synchronous Linux decision. Production callers should pre-await
 * `secretStore.isAvailable()` and supply the result via a wrapper that
 * makes isAvailable return the cached boolean — see `index.ts` for the
 * adapter that does this. Tests use the same shape.
 *
 * We can't `await` inside a non-async function, so the production wiring
 * in `index.ts` calls `await secretStore.isAvailable()` first and only
 * then invokes `createSecureStorageProvider` with a `secretStore` whose
 * `isAvailable` returns the cached boolean. This keeps the selector
 * itself trivially testable and synchronous.
 */
function pickLinuxProvider(input: SelectProviderInput): StorageProvider | null {
  const { secretStore, safeStorage } = input;

  // Probe secret-tool: the production wiring awaits `isAvailable()` once
  // at startup and caches the boolean on the wrapper, then constructs a
  // selector-friendly wrapper whose `isAvailable()` returns the cached
  // value wrapped in Promise.resolve(). Tests do the same. The selector
  // here peeks at the cached value via a small adapter hook below.
  const cached = readCachedAvailability(secretStore);

  if (cached === true) {
    return makeSecretToolProvider(secretStore);
  }

  // Fallback: safeStorage only counts when it has a real keyring behind it.
  if (isSecureStorageAvailable(safeStorage)) {
    return makeSafeStorageProvider(safeStorage);
  }

  return null;
}

/**
 * Read the cached availability boolean the production wrapper exposes.
 * Production: `await secretStore.isAvailable()` resolves once at startup
 * and the wrapper stores the result. We don't await here — the caller
 * must inject a wrapper whose `isAvailable()` is `Promise.resolve(cached)`.
 *
 * We don't have a clean way to read that synchronously from a Promise,
 * so the selector relies on a small duck-typed `availabilityCached` hint
 * the production wrapper exposes. When the hint is missing (legacy tests,
 * non-cached wrapper), we default to `false` — i.e. we don't trust
 * secret-tool until the wrapper tells us it probed it.
 */
function readCachedAvailability(store: SecretStorageLike): boolean | null {
  const hint = (store as SecretStorageLike & { availabilityCached?: boolean }).availabilityCached;
  return typeof hint === 'boolean' ? hint : null;
}

function makeSecretToolProvider(store: SecretStorageLike): StorageProvider {
  return {
    kind: 'secret-tool',
    async encrypt(plaintext: string): Promise<Buffer> {
      // libsecret owns the encryption; we hand the plaintext to the
      // wrapper, which pipes it over stdin. The "encrypted" buffer we
      // return is the lookup result — by the time `encrypt` resolves,
      // the value is in the keyring. session.enc on disk records only
      // the marker that triggers `lookup` at load time.
      await store.store(plaintext);
      // Sentinel: a non-empty marker so the load path knows there is
      // something to read. Real ciphertext never leaves the keyring.
      return Buffer.from('secret-tool:v1', 'utf8');
    },
    async decrypt(_buf: Buffer): Promise<string | null> {
      try {
        return await store.lookup();
      } catch {
        // Stale blob / corrupt entry / wrong backend — treat as no session.
        return null;
      }
    },
  };
}

function makeSafeStorageProvider(storage: FullSecureStorageLike): StorageProvider {
  return {
    kind: 'safeStorage',
    async encrypt(plaintext: string): Promise<Buffer> {
      return storage.encryptString(plaintext);
    },
    async decrypt(buf: Buffer): Promise<string | null> {
      try {
        return storage.decryptString(buf);
      } catch {
        // Stale-blob safety: a previous safeStorage backend encrypted
        // this blob and the new one can't read it. Drop to login.
        return null;
      }
    },
  };
}
