// @vitest-environment jsdom
/**
 * ORAIN-0684: Library screens show empty/error state instead of infinite skeleton.
 *
 * Tests cover:
 * - Empty state: tab returns 0 items → "No X" message + hint + Retry button
 * - Error state: tab fetch fails → "Couldn't load X" message + hint + Retry button
 * - Retry button re-triggers loadTab for the current tab
 * - tabStates prop drives skeleton/empty/error decisions (not total === 0)
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { LibraryContent } from './LibraryContent';
import type {
  LibraryTab,
  Artist,
  Album,
  Playlist,
  Genre,
  AlbumArtist,
  PaginationState,
} from '../appTypes';

const mockApi = {
  listUsbDevices: vi.fn().mockResolvedValue([]),
  getDeviceInfo: vi.fn().mockResolvedValue({ total: 32e9, free: 16e9, used: 16e9 }),
  getFilesystem: vi.fn().mockResolvedValue('exfat'),
  getSyncedItems: vi.fn().mockResolvedValue([]),
  analyzeDiff: vi.fn().mockResolvedValue({ success: true, items: [] }),
  estimateSize: vi.fn().mockResolvedValue({ trackCount: 0, totalBytes: 0, formatBreakdown: {} }),
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
};
beforeAll(() => {
  Object.defineProperty(window, 'api', { value: mockApi, writable: true });
});
afterEach(() => {
  vi.resetAllMocks();
});

function createPagination(overrides: Partial<PaginationState> = {}): PaginationState {
  return {
    artists: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
    albums: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
    playlists: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
    genres: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
    albumArtists: { items: [], total: 0, startIndex: 0, hasMore: false, scrollPos: 0 },
    ...overrides,
  };
}

// Per-tab tabStates fixture — only the active tab's state matters
function makeTabStates(
  activeTab: LibraryTab,
  state: 'loading' | 'loaded' | 'error',
): Record<LibraryTab, 'loading' | 'loaded' | 'error'> {
  return {
    artists: activeTab === 'artists' ? state : 'loaded',
    albumArtists: activeTab === 'albumArtists' ? state : 'loaded',
    albums: activeTab === 'albums' ? state : 'loaded',
    playlists: activeTab === 'playlists' ? state : 'loaded',
    genres: activeTab === 'genres' ? state : 'loaded',
  };
}

// Shared base props — no items, active tab is 'artists', tabStates=loaded
function baseProps(extra = {}) {
  return {
    activeLibrary: 'artists' as LibraryTab,
    artists: [] as Artist[],
    albums: [] as Album[],
    playlists: [] as Playlist[],
    genres: [] as Genre[],
    albumArtists: [] as AlbumArtist[],
    pagination: createPagination(),
    selectedTracks: new Set<string>(),
    previouslySyncedItems: new Set<string>(),
    outOfSyncItems: new Set<string>(),
    isLoadingMore: false,
    error: null,
    onToggle: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onClearError: vi.fn(),
    onLoadMore: vi.fn(),
    selectionSummary: '0 selected',
    contentScrollRef: { current: null } as React.RefObject<HTMLDivElement>,
    hasActiveDevice: true,
    serverUrl: 'https://jellyfin.example.com',
    searchQuery: '',
    onSearchChange: vi.fn(),
    onClearSearch: vi.fn(),
    searchResults: null,
    isSearching: false,
    searchError: null,
    tabStates: makeTabStates('artists', 'loaded'),
    onRetryTab: vi.fn(),
    ...extra,
  };
}

// ─── Empty state ─────────────────────────────────────────────────────────────

describe('empty state', () => {
  const EMPTY_HINT = 'Add music to your Jellyfin server, then refresh';

  it('shows "No artists" when artists tab is loaded with 0 items', () => {
    render(<LibraryContent {...baseProps()} />);
    expect(screen.getByText('No artists')).toBeInTheDocument();
    expect(screen.getByText(EMPTY_HINT)).toBeInTheDocument();
  });

  it('shows "No album artists" when albumArtists tab is loaded with 0 items', () => {
    render(<LibraryContent {...baseProps({ activeLibrary: 'albumArtists' as LibraryTab })} />);
    expect(screen.getByText('No album artists')).toBeInTheDocument();
    expect(screen.getByText(EMPTY_HINT)).toBeInTheDocument();
  });

  it('shows "No albums" when albums tab is loaded with 0 items', () => {
    render(<LibraryContent {...baseProps({ activeLibrary: 'albums' as LibraryTab })} />);
    expect(screen.getByText('No albums')).toBeInTheDocument();
    expect(screen.getByText(EMPTY_HINT)).toBeInTheDocument();
  });

  it('shows "No playlists" when playlists tab is loaded with 0 items', () => {
    render(<LibraryContent {...baseProps({ activeLibrary: 'playlists' as LibraryTab })} />);
    expect(screen.getByText('No playlists')).toBeInTheDocument();
    expect(screen.getByText(EMPTY_HINT)).toBeInTheDocument();
  });

  it('shows "No genres" when genres tab is loaded with 0 items', () => {
    render(<LibraryContent {...baseProps({ activeLibrary: 'genres' as LibraryTab })} />);
    expect(screen.getByText('No genres')).toBeInTheDocument();
    expect(screen.getByText(EMPTY_HINT)).toBeInTheDocument();
  });

  it('empty state does not show skeleton', () => {
    render(<LibraryContent {...baseProps()} />);
    expect(screen.queryByTestId('library-skeleton')).not.toBeInTheDocument();
  });

  it('Retry button is visible in empty state', () => {
    render(<LibraryContent {...baseProps()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('Retry button calls onRetryTab with the current active tab', async () => {
    const user = userEvent.setup({ delay: null });
    const onRetryTab = vi.fn();
    render(<LibraryContent {...baseProps({ onRetryTab })} />);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(onRetryTab).toHaveBeenCalledWith('artists');
  });

  it('Retry button calls onRetryTab with albumArtists when on that tab', async () => {
    const user = userEvent.setup({ delay: null });
    const onRetryTab = vi.fn();
    render(
      <LibraryContent
        {...baseProps({ activeLibrary: 'albumArtists' as LibraryTab, onRetryTab })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(onRetryTab).toHaveBeenCalledWith('albumArtists');
  });
});

// ─── Error state ─────────────────────────────────────────────────────────────

describe('error state', () => {
  const ERROR_HINT = 'Check your server connection';

  it('shows "Couldn\'t load artists" when artists tab is in error state', () => {
    const tabStates = makeTabStates('artists', 'error');
    render(<LibraryContent {...baseProps({ tabStates })} />);
    expect(screen.getByText("Couldn't load artists")).toBeInTheDocument();
    expect(screen.getByText(ERROR_HINT)).toBeInTheDocument();
  });

  it('shows "Couldn\'t load album artists" when albumArtists tab is in error state', () => {
    const tabStates = makeTabStates('albumArtists', 'error');
    render(
      <LibraryContent {...baseProps({ activeLibrary: 'albumArtists' as LibraryTab, tabStates })} />,
    );
    expect(screen.getByText("Couldn't load album artists")).toBeInTheDocument();
    expect(screen.getByText(ERROR_HINT)).toBeInTheDocument();
  });

  it('shows "Couldn\'t load albums" when albums tab is in error state', () => {
    const tabStates = makeTabStates('albums', 'error');
    render(<LibraryContent {...baseProps({ activeLibrary: 'albums' as LibraryTab, tabStates })} />);
    expect(screen.getByText("Couldn't load albums")).toBeInTheDocument();
    expect(screen.getByText(ERROR_HINT)).toBeInTheDocument();
  });

  it('shows "Couldn\'t load playlists" when playlists tab is in error state', () => {
    const tabStates = makeTabStates('playlists', 'error');
    render(
      <LibraryContent {...baseProps({ activeLibrary: 'playlists' as LibraryTab, tabStates })} />,
    );
    expect(screen.getByText("Couldn't load playlists")).toBeInTheDocument();
    expect(screen.getByText(ERROR_HINT)).toBeInTheDocument();
  });

  it('shows "Couldn\'t load genres" when genres tab is in error state', () => {
    const tabStates = makeTabStates('genres', 'error');
    render(<LibraryContent {...baseProps({ activeLibrary: 'genres' as LibraryTab, tabStates })} />);
    expect(screen.getByText("Couldn't load genres")).toBeInTheDocument();
    expect(screen.getByText(ERROR_HINT)).toBeInTheDocument();
  });

  it('error state does not show skeleton', () => {
    const tabStates = makeTabStates('artists', 'error');
    render(<LibraryContent {...baseProps({ tabStates })} />);
    expect(screen.queryByTestId('library-skeleton')).not.toBeInTheDocument();
  });

  it('Retry button is visible in error state', () => {
    const tabStates = makeTabStates('artists', 'error');
    render(<LibraryContent {...baseProps({ tabStates })} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('Retry button calls onRetryTab in error state', async () => {
    const user = userEvent.setup({ delay: null });
    const onRetryTab = vi.fn();
    const tabStates = makeTabStates('artists', 'error');
    render(<LibraryContent {...baseProps({ tabStates, onRetryTab })} />);

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(onRetryTab).toHaveBeenCalledWith('artists');
  });

  it('Retry button calls onRetryTab with genres when on genres tab', async () => {
    const user = userEvent.setup({ delay: null });
    const onRetryTab = vi.fn();
    const tabStates = makeTabStates('genres', 'error');
    render(
      <LibraryContent
        {...baseProps({ activeLibrary: 'genres' as LibraryTab, tabStates, onRetryTab })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(onRetryTab).toHaveBeenCalledWith('genres');
  });
});

// ─── Loading / skeleton state ────────────────────────────────────────────────

describe('loading state', () => {
  it('shows skeleton when tab is in loading state', () => {
    const tabStates = makeTabStates('artists', 'loading');
    render(<LibraryContent {...baseProps({ tabStates })} />);
    expect(screen.getByTestId('library-skeleton')).toBeInTheDocument();
  });

  it('does not show empty message when tab is loading', () => {
    const tabStates = makeTabStates('artists', 'loading');
    render(<LibraryContent {...baseProps({ tabStates })} />);
    expect(screen.queryByText('No artists')).not.toBeInTheDocument();
  });

  it('does not show error message when tab is loading', () => {
    const tabStates = makeTabStates('artists', 'loading');
    render(<LibraryContent {...baseProps({ tabStates })} />);
    expect(screen.queryByText("Couldn't load artists")).not.toBeInTheDocument();
  });
});

// ─── Content state ───────────────────────────────────────────────────────────

describe('content state (items present)', () => {
  it('renders library items when tab is loaded and has results', () => {
    const artists: Artist[] = [{ Id: 'artist-1', Name: 'The Beatles', ChildCount: 13 }];
    render(<LibraryContent {...baseProps({ artists })} />);
    expect(screen.getByTestId('library-content')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('library-content')).getByText('The Beatles'),
    ).toBeInTheDocument();
  });

  it('does not show skeleton when loaded with items', () => {
    const artists: Artist[] = [{ Id: 'artist-1', Name: 'The Beatles', ChildCount: 13 }];
    render(<LibraryContent {...baseProps({ artists })} />);
    expect(screen.queryByTestId('library-skeleton')).not.toBeInTheDocument();
  });

  it('does not show empty message when loaded with items', () => {
    const artists: Artist[] = [{ Id: 'artist-1', Name: 'The Beatles', ChildCount: 13 }];
    render(<LibraryContent {...baseProps({ artists })} />);
    expect(screen.queryByText('No artists')).not.toBeInTheDocument();
  });
});
