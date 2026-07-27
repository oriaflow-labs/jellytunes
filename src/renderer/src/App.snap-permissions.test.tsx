// src/renderer/src/App.snap-permissions.test.tsx
// ORAIN-0578 regression test at the composition boundary.
// ORAIN-0590: `password-manager-service` is no longer surfaced (the
// session-storage provider switched to `secret-tool`).
// ORAIN-0591: `hardware-observe` is no longer surfaced either (USB
// detection under snap uses polling only). This fixture uses the two
// remaining interfaces only.
//
// The original keyring banner was unreachable in production: the hook set
// `snapKeyringIssue` and `isConnected: true` in the same state update, while
// `App` only mounted `LoginScreen` — the banner's only host — when
// `isConnected` was false. Every unit test passed because each half was
// tested in isolation and no test ever mounted `App` itself.
//
// These tests mount the real `App` and assert the banner is reachable in
// BOTH routing states, so a future refactor cannot orphan it again.

// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

const MOUNT_COMMAND = 'sudo snap connect jellytunes:mount-observe';
const REMOVABLE_COMMAND = 'sudo snap connect jellytunes:removable-media';

const ALL_MISSING = {
  isSnap: true,
  snapName: 'jellytunes',
  interfaces: [
    { interface: 'mount-observe', status: 'missing', command: MOUNT_COMMAND },
    { interface: 'removable-media', status: 'missing', command: REMOVABLE_COMMAND },
  ],
};

const NO_SNAP_REPORT = { isSnap: false, snapName: null, interfaces: [] };

const SAVED_SESSION = JSON.stringify({
  url: 'https://jellyfin.test',
  apiKey: 'test-key',
  userId: 'user-1',
});

function mockApi(overrides: Record<string, unknown> = {}): void {
  const api = {
    // Session / connection
    loadSession: vi.fn().mockResolvedValue(null),
    saveSession: vi.fn().mockResolvedValue({ success: true }),
    clearSession: vi.fn().mockResolvedValue(undefined),
    // Snap
    isSnap: vi.fn().mockResolvedValue(true),
    checkSnapPermissions: vi.fn().mockResolvedValue(NO_SNAP_REPORT),
    // ORAIN-0590: encryption provider is available in tests by default.
    isSessionStorageAvailable: vi.fn().mockResolvedValue(true),
    // Devices
    listUsbDevices: vi.fn().mockResolvedValue([]),
    onUsbAttach: vi.fn().mockReturnValue(() => {}),
    onUsbDetach: vi.fn().mockReturnValue(() => {}),
    getDeviceInfo: vi.fn().mockResolvedValue({ total: 0, free: 0, used: 0 }),
    getFilesystem: vi.fn().mockResolvedValue('unknown'),
    selectFolder: vi.fn().mockResolvedValue(null),
    // Library / sync
    getSyncedItems: vi.fn().mockResolvedValue([]),
    getSyncedTracks: vi.fn().mockResolvedValue([]),
    getTracksForItem: vi.fn().mockResolvedValue([]),
    getTracksForItems: vi.fn().mockResolvedValue([]),
    startSync2: vi
      .fn()
      .mockResolvedValue({ success: true, tracksCopied: 0, tracksFailed: [], errors: [] }),
    cancelSync: vi.fn().mockResolvedValue({ cancelled: true }),
    onSyncProgress: vi.fn().mockReturnValue(() => {}),
    removeItems: vi.fn().mockResolvedValue({ removed: 0, errors: [] }),
    clearDestination: vi.fn().mockResolvedValue({ deleted: 0, errors: [] }),
    // Misc
    getPreferences: vi.fn().mockResolvedValue({ analyticsEnabled: true }),
    setPreferences: vi.fn().mockResolvedValue(undefined),
    checkForUpdates: vi.fn().mockResolvedValue({ updateAvailable: false }),
    reportBug: vi.fn().mockResolvedValue({ success: true }),
    logError: vi.fn(),
    logWarn: vi.fn(),
    logInfo: vi.fn(),
    ...overrides,
  };
  Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ Id: 'user-1', Items: [], TotalRecordCount: 0 }),
  }) as unknown as typeof fetch;
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

// No `vi.restoreAllMocks()` here on purpose: it would run before
// testing-library's own `cleanup`, stripping the window.api implementations
// while effects from the rendered tree are still flushing. Each test builds
// a fresh api object anyway.

describe('App — snap permissions banner (ORAIN-0578, reduced in ORAIN-0590)', () => {
  describe('while connected (the state the old banner could never reach)', () => {
    it('shows the banner after auto-connecting from a saved session', async () => {
      mockApi({
        loadSession: vi.fn().mockResolvedValue(SAVED_SESSION),
        checkSnapPermissions: vi.fn().mockResolvedValue(ALL_MISSING),
      });

      render(<App />);

      // Wait for the connected shell to actually render — this is exactly
      // the state in which the previous implementation unmounted its own
      // banner. Asserting on the header (not just the absence of the login
      // screen) keeps the test honest if the connected tree ever fails to
      // mount at all.
      expect(await screen.findByTestId('connection-status')).toBeInTheDocument();
      expect(screen.queryByTestId('auth-screen')).not.toBeInTheDocument();
      expect(screen.getByTestId('snap-permissions-banner')).toBeInTheDocument();
    });

    it('lists both connect commands while connected', async () => {
      mockApi({
        loadSession: vi.fn().mockResolvedValue(SAVED_SESSION),
        checkSnapPermissions: vi.fn().mockResolvedValue(ALL_MISSING),
      });

      render(<App />);

      await screen.findByTestId('connection-status');
      await screen.findByTestId('snap-permissions-banner');
      expect(screen.getByText(MOUNT_COMMAND)).toBeInTheDocument();
      expect(screen.getByText(REMOVABLE_COMMAND)).toBeInTheDocument();
    });

    it('does not depend on session:save failing to surface the banner', async () => {
      // The banner is driven by the report, not by a failed feature.
      const saveSession = vi.fn().mockResolvedValue({ success: true });
      mockApi({
        loadSession: vi.fn().mockResolvedValue(SAVED_SESSION),
        saveSession,
        checkSnapPermissions: vi.fn().mockResolvedValue(ALL_MISSING),
      });

      render(<App />);

      await screen.findByTestId('connection-status');
      await screen.findByTestId('snap-permissions-banner');
      expect(screen.getByText(MOUNT_COMMAND)).toBeInTheDocument();
      expect(saveSession).toHaveBeenCalled();
    });
  });

  describe('while logged out', () => {
    it('shows the banner on the login screen', async () => {
      mockApi({ checkSnapPermissions: vi.fn().mockResolvedValue(ALL_MISSING) });

      render(<App />);

      await screen.findByTestId('auth-screen');
      expect(await screen.findByTestId('snap-permissions-banner')).toBeInTheDocument();
    });
  });

  describe('suppression outside snap', () => {
    it('renders no banner on the login screen', async () => {
      mockApi({
        isSnap: vi.fn().mockResolvedValue(false),
        checkSnapPermissions: vi.fn().mockResolvedValue(NO_SNAP_REPORT),
      });

      render(<App />);

      await screen.findByTestId('auth-screen');
      expect(screen.queryByTestId('snap-permissions-banner')).not.toBeInTheDocument();
    });

    it('renders no banner while connected', async () => {
      mockApi({
        loadSession: vi.fn().mockResolvedValue(SAVED_SESSION),
        isSnap: vi.fn().mockResolvedValue(false),
        checkSnapPermissions: vi.fn().mockResolvedValue(NO_SNAP_REPORT),
      });

      render(<App />);

      await screen.findByTestId('connection-status');
      await waitFor(() => {
        expect(screen.queryByTestId('auth-screen')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('snap-permissions-banner')).not.toBeInTheDocument();
    });
  });

  it('renders no banner under snap when every plug is connected', async () => {
    mockApi({
      checkSnapPermissions: vi
        .fn()
        .mockResolvedValue({ isSnap: true, snapName: 'jellytunes', interfaces: [] }),
    });

    render(<App />);

    await screen.findByTestId('auth-screen');
    expect(screen.queryByTestId('snap-permissions-banner')).not.toBeInTheDocument();
  });
});

describe('App — no-session-storage banner (ORAIN-0590)', () => {
  it('does not show the no-storage banner when an encryption provider is available', async () => {
    mockApi({ isSessionStorageAvailable: vi.fn().mockResolvedValue(true) });
    render(<App />);
    await screen.findByTestId('auth-screen');
    expect(screen.queryByTestId('no-session-storage-banner')).not.toBeInTheDocument();
  });

  it('shows the no-storage banner on the login screen when no provider is available', async () => {
    mockApi({ isSessionStorageAvailable: vi.fn().mockResolvedValue(false) });
    render(<App />);
    await screen.findByTestId('auth-screen');
    expect(await screen.findByTestId('no-session-storage-banner')).toBeInTheDocument();
  });
});
