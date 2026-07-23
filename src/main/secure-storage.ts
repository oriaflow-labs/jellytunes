/**
 * Fail-safe guard around Electron's `safeStorage` API.
 *
 * ORAIN-0571: On Linux, `safeStorage.isEncryptionAvailable()` can return
 * `true` even when Electron has selected the `basic_text` backend — a
 * hardcoded, non-OS-backed password used when no real keyring (libsecret via
 * D-Bus, kwallet) could be determined for the desktop session. That happens,
 * for example, under Snap strict confinement when the `password-manager-service`
 * interface isn't connected. Treating `isEncryptionAvailable() === true` as
 * "safe to store credentials" on its own would silently downgrade storage to
 * an effectively-plaintext backend — exactly the failure mode the credential
 * storage path must never allow (see main/index.ts session:save / session:load).
 */

interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend():
    | 'basic_text'
    | 'gnome_libsecret'
    | 'kwallet'
    | 'kwallet5'
    | 'kwallet6'
    | 'unknown';
}

/** Linux backends backed by a real OS/desktop keyring. */
const SECURE_LINUX_BACKENDS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']);

/**
 * Whether `safeStorage` can protect data with real OS-backed encryption
 * (macOS Keychain, Windows DPAPI, or a Linux keyring reachable via
 * libsecret/D-Bus) — never with Electron's `basic_text` fallback or an
 * indeterminate backend.
 */
export function isSecureStorageAvailable(storage: SafeStorageLike): boolean {
  if (!storage.isEncryptionAvailable()) return false;
  if (process.platform !== 'linux') return true;
  return SECURE_LINUX_BACKENDS.has(storage.getSelectedStorageBackend());
}
