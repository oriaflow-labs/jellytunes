// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { LoginScreen } from './LoginScreen';

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'api', {
    value: {
      listUsbDevices: vi.fn().mockResolvedValue([]),
      getDeviceInfo: vi.fn().mockResolvedValue({ total: 32e9, free: 16e9, used: 16e9 }),
      getFilesystem: vi.fn().mockResolvedValue('exfat'),
      getSyncedItems: vi.fn().mockResolvedValue([]),
      analyzeDiff: vi.fn().mockResolvedValue({ success: true, items: [] }),
      estimateSize: vi
        .fn()
        .mockResolvedValue({ trackCount: 0, totalBytes: 0, formatBreakdown: {} }),
      startSync2: vi
        .fn()
        .mockResolvedValue({ success: true, tracksCopied: 10, tracksSkipped: 5, errors: [] }),
      removeItems: vi.fn().mockResolvedValue({ removed: 0, errors: [] }),
      cancelSync: vi.fn().mockResolvedValue({ cancelled: true }),
      onSyncProgress: vi.fn().mockReturnValue(() => {}),
      getDeviceSyncInfo: vi.fn().mockResolvedValue(null),
      selectFolder: vi.fn().mockResolvedValue('/mnt/usb'),
      saveSession: vi.fn().mockResolvedValue({ success: true }),
      loadSession: vi.fn().mockResolvedValue(null),
      clearSession: vi.fn().mockResolvedValue(undefined),
    },
    writable: true,
    configurable: true,
  });
});

describe('LoginScreen — HTTPS enforcement on password submit (ORAIN-0679)', () => {
  // The HTTPS gate lives in connectWithPassword (useJellyfinConnection.ts), which is
  // called by App.tsx via the onPasswordSubmit prop. LoginScreen itself only calls
  // onPasswordSubmit(url, username, password) — it never calls fetch directly.
  // These tests verify LoginScreen's side of the contract: the submitted URL and
  // credentials arrive at onPasswordSubmit, and LoginScreen makes no direct fetch.

  const defaultProps = () => ({
    urlInput: '',
    apiKeyInput: '',
    usernameInput: '',
    passwordInput: '',
    error: null as string | null,
    onUrlChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onUsernameChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onSubmit: vi.fn(),
    onPasswordSubmit: vi.fn(),
    initialMode: 'password' as const,
  });

  it('passes URL+credentials to onPasswordSubmit and makes no direct fetch', async () => {
    const props = defaultProps();
    // Spy on global.fetch to prove LoginScreen never calls it directly
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(<LoginScreen {...props} />);

    const urlInput = screen.getByTestId('server-url-input') as HTMLInputElement;
    const usernameInput = screen.getByTestId('username-input') as HTMLInputElement;
    const passwordInput = screen.getByTestId('password-input') as HTMLInputElement;

    await act(async () => {
      urlInput.value = 'http://example.com';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.value = 'alice';
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.value = 's3cret';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    // LoginScreen delegates to onPasswordSubmit — HTTPS gate is in connectWithPassword
    expect(props.onPasswordSubmit).toHaveBeenCalledWith('http://example.com', 'alice', 's3cret');
    // LoginScreen never calls fetch — the hook's connectWithPassword does, after isSecureAuthUrl
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes URL+credentials to onPasswordSubmit for https:// URLs', async () => {
    const props = defaultProps();
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(<LoginScreen {...props} />);

    const urlInput = screen.getByTestId('server-url-input') as HTMLInputElement;
    const usernameInput = screen.getByTestId('username-input') as HTMLInputElement;
    const passwordInput = screen.getByTestId('password-input') as HTMLInputElement;

    await act(async () => {
      urlInput.value = 'https://jellyfin.example.com';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.value = 'alice';
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.value = 's3cret';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(props.onPasswordSubmit).toHaveBeenCalledWith(
      'https://jellyfin.example.com',
      'alice',
      's3cret',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes URL+credentials for http://127.0.0.1 (loopback exempt from HTTPS gate)', async () => {
    const props = defaultProps();
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(<LoginScreen {...props} />);

    const urlInput = screen.getByTestId('server-url-input') as HTMLInputElement;
    const usernameInput = screen.getByTestId('username-input') as HTMLInputElement;
    const passwordInput = screen.getByTestId('password-input') as HTMLInputElement;

    await act(async () => {
      urlInput.value = 'http://127.0.0.1:8096';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.value = 'alice';
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.value = 's3cret';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });

    expect(props.onPasswordSubmit).toHaveBeenCalledWith('http://127.0.0.1:8096', 'alice', 's3cret');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
