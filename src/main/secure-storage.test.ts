import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSecureStorageAvailable } from './secure-storage';

describe('isSecureStorageAvailable', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns false when isEncryptionAvailable() is false', () => {
    const storage = {
      isEncryptionAvailable: vi.fn(() => false),
      getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret' as const),
    };

    expect(isSecureStorageAvailable(storage)).toBe(false);
    // Backend should not even be consulted once availability already failed.
    expect(storage.getSelectedStorageBackend).not.toHaveBeenCalled();
  });

  it('returns true on macOS/Windows when isEncryptionAvailable() is true, without checking backend', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const storage = {
      isEncryptionAvailable: vi.fn(() => true),
      getSelectedStorageBackend: vi.fn(() => 'unknown' as const),
    };

    expect(isSecureStorageAvailable(storage)).toBe(true);
    expect(storage.getSelectedStorageBackend).not.toHaveBeenCalled();
  });

  it('returns true on Linux when a real keyring backend is selected', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    for (const backend of ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'] as const) {
      const storage = {
        isEncryptionAvailable: vi.fn(() => true),
        getSelectedStorageBackend: vi.fn(() => backend),
      };
      expect(isSecureStorageAvailable(storage)).toBe(true);
    }
  });

  it('returns false on Linux when the backend is the insecure basic_text fallback', () => {
    // This is the case that matters for Snap strict confinement: Electron can
    // report isEncryptionAvailable() === true while still having selected the
    // hardcoded, non-OS-backed basic_text password (e.g. no keyring backend
    // could be determined for the desktop session). Without this check, that
    // would be a silent downgrade to effectively plaintext credential storage.
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const storage = {
      isEncryptionAvailable: vi.fn(() => true),
      getSelectedStorageBackend: vi.fn(() => 'basic_text' as const),
    };

    expect(isSecureStorageAvailable(storage)).toBe(false);
  });

  it('returns false on Linux when the backend is unknown (cannot confirm a real keyring)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const storage = {
      isEncryptionAvailable: vi.fn(() => true),
      getSelectedStorageBackend: vi.fn(() => 'unknown' as const),
    };

    expect(isSecureStorageAvailable(storage)).toBe(false);
  });
});
