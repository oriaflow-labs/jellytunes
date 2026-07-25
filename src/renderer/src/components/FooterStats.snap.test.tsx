// src/renderer/src/components/FooterStats.snap.test.tsx
// Regression test for ORAIN-0573: under snap, the update banner in the
// footer must NOT be rendered (snapd handles the refresh). The stats
// ping must still fire — we only hide the banner UI.

import { render, waitFor, act, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FooterStats } from './FooterStats';
import type { PaginationState } from '../appTypes';

function makeMockApi(opts: { isSnap: boolean; updateAvailable: boolean }) {
  return {
    checkForUpdates: vi.fn().mockResolvedValue({
      updateAvailable: opts.updateAvailable,
      latestVersion: opts.updateAvailable ? '9.9.9' : '',
      releaseUrl: opts.updateAvailable ? 'https://example/release' : '',
      managedBySnap: opts.isSnap,
    }),
    isSnap: vi.fn().mockResolvedValue(opts.isSnap),
  };
}

async function flushMicrotasks(): Promise<void> {
  // Multiple awaits are needed: one to resolve window.api.isSnap, another
  // to resolve window.api.checkForUpdates, then the effect's setState.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const basePagination: PaginationState = {
  artists: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
  albumArtists: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
  albums: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
  playlists: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
  genres: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
};

const baseProps = {
  stats: null,
  pagination: basePagination,
  artists: [] as never[],
  albums: [] as never[],
  playlists: [] as never[],
  genres: [] as never[],
};

describe('FooterStats (snap-aware)', () => {
  it('shows the update banner on non-snap when an update is available', async () => {
    // @ts-expect-error — Mocking window.api for test environment
    window.api = makeMockApi({ isSnap: false, updateAvailable: true });
    render(<FooterStats {...baseProps} />);
    await flushMicrotasks();
    await waitFor(() => {
      expect(screen.getByText('v9.9.9 available ↗')).toBeInTheDocument();
    });
  });

  it('hides the update banner under snap even when an update is available', async () => {
    // ORAIN-0573 AC1: under snap, the banner must not render. snapd refreshes.
    // @ts-expect-error — Mocking window.api for test environment
    window.api = makeMockApi({ isSnap: true, updateAvailable: true });
    render(<FooterStats {...baseProps} />);
    await flushMicrotasks();
    // checkForUpdates was called (stats ping still happens), but no banner.
    expect(window.api.checkForUpdates).toHaveBeenCalled();
    expect(document.body.textContent ?? '').not.toContain('available ↗');
  });

  it('still does not show the banner under snap when there is no update either', async () => {
    // @ts-expect-error — Mocking window.api for test environment
    window.api = makeMockApi({ isSnap: true, updateAvailable: false });
    render(<FooterStats {...baseProps} />);
    await flushMicrotasks();
    expect(window.api.checkForUpdates).toHaveBeenCalled();
    expect(document.body.textContent ?? '').not.toContain('available ↗');
  });
});
