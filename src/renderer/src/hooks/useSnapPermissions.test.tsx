// src/renderer/src/hooks/useSnapPermissions.test.tsx
// ORAIN-0578: the hook that loads the snap interface report once on mount
// so the banner can render in every app state (login, connecting,
// connected) without depending on a feature failing first.

// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSnapPermissions } from './useSnapPermissions';

const checkSnapPermissions = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'api', { value: { checkSnapPermissions }, writable: true });
});

describe('useSnapPermissions', () => {
  it('starts with an empty report before the IPC call resolves', () => {
    checkSnapPermissions.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSnapPermissions());
    expect(result.current).toEqual({ isSnap: false, snapName: null, interfaces: [] });
  });

  it('exposes the report returned by snap:checkPermissions', async () => {
    const report = {
      isSnap: true,
      snapName: 'jellytunes',
      interfaces: [
        {
          interface: 'hardware-observe' as const,
          status: 'missing' as const,
          command: 'sudo snap connect jellytunes:hardware-observe',
        },
      ],
    };
    checkSnapPermissions.mockResolvedValue(report);

    const { result } = renderHook(() => useSnapPermissions());

    await waitFor(() => expect(result.current).toEqual(report));
  });

  it('falls back to an empty report when the IPC call rejects', async () => {
    checkSnapPermissions.mockRejectedValue(new Error('no handler'));

    const { result } = renderHook(() => useSnapPermissions());

    await waitFor(() => expect(checkSnapPermissions).toHaveBeenCalled());
    expect(result.current).toEqual({ isSnap: false, snapName: null, interfaces: [] });
  });

  it('queries main only once per mount', async () => {
    checkSnapPermissions.mockResolvedValue({ isSnap: false, snapName: null, interfaces: [] });

    const { rerender } = renderHook(() => useSnapPermissions());
    rerender();
    rerender();

    await waitFor(() => expect(checkSnapPermissions).toHaveBeenCalledTimes(1));
  });
});
