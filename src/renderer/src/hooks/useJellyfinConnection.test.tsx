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

  describe('save failures (ORAIN-0578)', () => {
    it('still connects when session:save reports encryption_unavailable', async () => {
      // The snap keyring warning is no longer driven from here — it comes
      // from the permission report (see useSnapPermissions + the App-level
      // banner test). A failed save must not block the connection.
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

      expect(result.current.isConnected).toBe(true);
      expect(result.current.error).toBeNull();
      expect(onConnected).toHaveBeenCalledWith('https://jellyfin.test', 'test-key', 'user-1');
    });
  });
});
