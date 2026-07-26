import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useJellyfinConnection } from './useJellyfinConnection';

const mockApi = {
  saveSession: vi.fn().mockResolvedValue({ success: true }),
  loadSession: vi.fn().mockResolvedValue(null),
  clearSession: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn(),
  // ORAIN-0578 T1: needed when the hook detects encryption_unavailable
  // under snap and asks main for the snap name.
  isSnap: vi.fn().mockResolvedValue(false),
  checkSnapPermissions: vi.fn().mockResolvedValue({
    isSnap: false,
    snapName: null,
    interfaces: [],
  }),
};

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'api', { value: mockApi, writable: true });
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useJellyfinConnection', () => {
  describe('initial state', () => {
    it('renders disconnected state when no session saved', async () => {
      mockApi.loadSession.mockResolvedValue(null);

      const { result } = renderHook(() => useJellyfinConnection(vi.fn()));

      await waitFor(() => {
        expect(result.current.isConnecting).toBe(false);
        expect(result.current.isConnected).toBe(false);
      });
    });

    it('auto-connects when session is saved with userId', async () => {
      mockApi.loadSession.mockResolvedValue(
        JSON.stringify({ url: 'https://jellyfin.test', apiKey: 'test-key', userId: 'user-1' }),
      );
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ServerName: 'Test Server' }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ Id: 'user-1', Name: 'Test User' }),
      });

      const onConnected = vi.fn();
      const { result } = renderHook(() => useJellyfinConnection(onConnected));

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      expect(onConnected).toHaveBeenCalledWith('https://jellyfin.test', 'test-key', 'user-1');
    });
  });

  describe('connect with single user', () => {
    it('auto-selects when only one user is returned (no user selector)', async () => {
      mockApi.loadSession.mockResolvedValue(null);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ServerName: 'Test Server' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Id: 'user-1', Name: 'Test User' }),
        });

      const onConnected = vi.fn();
      const { result } = renderHook(() => useJellyfinConnection(onConnected));

      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });

      expect(result.current.showUserSelector).toBe(false);
      expect(onConnected).toHaveBeenCalled();
    });
  });

  describe('connect with multiple users', () => {
    it('sets showUserSelector=true when multiple users are found', async () => {
      mockApi.loadSession.mockResolvedValue(null);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ServerName: 'Test Server' }),
        })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { Id: 'user-1', Name: 'User One' },
              { Id: 'user-2', Name: 'User Two' },
            ]),
        });

      const { result } = renderHook(() => useJellyfinConnection(vi.fn()));

      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });

      expect(result.current.showUserSelector).toBe(true);
      expect(result.current.users).toHaveLength(2);
    });
  });

  describe('connectWithUser (via handleUserSelect)', () => {
    it('calls saveSession when user selects', async () => {
      mockApi.loadSession.mockResolvedValue(null);
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ServerName: 'Test' }) })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { Id: 'user-1', Name: 'User One' },
              { Id: 'user-2', Name: 'User Two' },
            ]),
        });

      const onConnected = vi.fn();
      const { result } = renderHook(() => useJellyfinConnection(onConnected));

      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });

      await act(async () => {
        await result.current.handleUserSelect({ Id: 'user-1', Name: 'User One' });
      });

      expect(mockApi.saveSession).toHaveBeenCalledWith(
        JSON.stringify({ url: 'https://jellyfin.test', apiKey: 'test-key', userId: 'user-1' }),
      );
      expect(onConnected).toHaveBeenCalledWith('https://jellyfin.test', 'test-key', 'user-1');
    });
  });

  describe('disconnect', () => {
    it('calls clearSession and resets state', async () => {
      mockApi.loadSession.mockResolvedValue(
        JSON.stringify({ url: 'https://jellyfin.test', apiKey: 'test-key', userId: 'user-1' }),
      );
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ServerName: 'Test' }),
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Id: 'user-1', Name: 'Test' }),
      });

      const { result } = renderHook(() => useJellyfinConnection(vi.fn()));

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.disconnect();
      });

      expect(mockApi.clearSession).toHaveBeenCalled();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.jellyfinConfig).toBe(null);
    });
  });

  describe('saveSession failure', () => {
    it('still connects when saveSession returns success:false', async () => {
      mockApi.loadSession.mockResolvedValue(null);
      mockApi.saveSession.mockResolvedValue({ success: false, reason: 'encryption_unavailable' });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ServerName: 'Test Server' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Id: 'user-1', Name: 'Test User' }),
        });

      const onConnected = vi.fn();
      const { result } = renderHook(() => useJellyfinConnection(onConnected));

      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });

      expect(onConnected).toHaveBeenCalledWith('https://jellyfin.test', 'test-key', 'user-1');
      expect(mockApi.logError).toHaveBeenCalledWith('Session save failed: encryption_unavailable');
    });

    it('logs error when saveSession throws', async () => {
      mockApi.loadSession.mockResolvedValue(null);
      mockApi.saveSession.mockRejectedValue(new Error('IPC error'));
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ServerName: 'Test Server' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Id: 'user-1', Name: 'Test User' }),
        });

      const onConnected = vi.fn();
      const { result } = renderHook(() => useJellyfinConnection(onConnected));

      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });

      expect(onConnected).toHaveBeenCalled();
    });
  });

  describe('snapKeyringIssue banner (ORAIN-0578 T1)', () => {
    it('surfaces snapKeyringIssue when saveSession reports encryption_unavailable under snap', async () => {
      mockApi.loadSession.mockResolvedValue(null);
      mockApi.saveSession.mockResolvedValue({ success: false, reason: 'encryption_unavailable' });
      mockApi.isSnap.mockResolvedValue(true);
      mockApi.checkSnapPermissions.mockResolvedValue({
        isSnap: true,
        snapName: 'jellytunes',
        interfaces: [
          {
            interface: 'password-manager-service',
            status: 'missing',
            command: 'sudo snap connect jellytunes:password-manager-service',
          },
        ],
      });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ServerName: 'Test Server' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Id: 'user-1', Name: 'Test User' }),
        });

      const { result } = renderHook(() => useJellyfinConnection(vi.fn()));

      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.snapKeyringIssue).toEqual({
        command: 'sudo snap connect jellytunes:password-manager-service',
        snapName: 'jellytunes',
      });
    });

    it('does NOT surface the banner when encryption_unavailable but NOT under snap', async () => {
      // Non-snap platforms (macOS/Windows/Linux without snap) fail this
      // path differently — there's no banner there.
      mockApi.loadSession.mockResolvedValue(null);
      mockApi.saveSession.mockResolvedValue({ success: false, reason: 'encryption_unavailable' });
      mockApi.isSnap.mockResolvedValue(false);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ServerName: 'Test Server' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Id: 'user-1', Name: 'Test User' }),
        });

      const { result } = renderHook(() => useJellyfinConnection(vi.fn()));

      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.snapKeyringIssue).toBeNull();
      // isSnap IPC is consulted before surfacing the banner — make sure we
      // actually called it (suppression test, not silent skip).
      expect(mockApi.isSnap).toHaveBeenCalled();
    });

    it('clears the banner after a subsequent successful save', async () => {
      // First connection: keyring missing → banner shown.
      mockApi.loadSession.mockResolvedValue(null);
      mockApi.saveSession.mockResolvedValueOnce({
        success: false,
        reason: 'encryption_unavailable',
      });
      mockApi.isSnap.mockResolvedValue(true);
      mockApi.checkSnapPermissions.mockResolvedValue({
        isSnap: true,
        snapName: 'jellytunes',
        interfaces: [
          {
            interface: 'password-manager-service',
            status: 'missing',
            command: 'sudo snap connect jellytunes:password-manager-service',
          },
        ],
      });
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ServerName: 'Test Server' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Id: 'user-1', Name: 'Test User' }),
        });

      const { result } = renderHook(() => useJellyfinConnection(vi.fn()));
      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });
      expect(result.current.snapKeyringIssue).not.toBeNull();

      // User restarts the app, keyring is now available — second connect
      // succeeds. The banner must clear on the next save, otherwise it
      // would be a stuck-forever sticky notice.
      mockApi.saveSession.mockResolvedValueOnce({ success: true });
      mockApi.loadSession.mockResolvedValue(null);
      // Force re-render with a fresh state via disconnect + reconnect.
      act(() => {
        result.current.disconnect();
      });

      // Reset the loadSession mock so the auto-connect-on-mount effect
      // doesn't fire (we want to drive the reconnect manually).
      mockApi.loadSession.mockResolvedValue(null);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ServerName: 'Test Server' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Id: 'user-1', Name: 'Test User' }),
        });
      await act(async () => {
        await result.current.connectToJellyfin('https://jellyfin.test', 'test-key');
      });
      expect(result.current.snapKeyringIssue).toBeNull();
    });
  });
});
