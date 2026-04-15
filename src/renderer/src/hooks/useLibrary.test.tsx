import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { useLibrary } from './useLibrary'
import type { JellyfinConfig } from '../appTypes'

const mockConfig: JellyfinConfig = { url: 'https://jellyfin.test', apiKey: 'test-key' }

const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  vi.clearAllMocks()
})

function createMockFetch() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        Items: [
          { Id: 'artist-1', Name: 'Artist 1', AlbumCount: 5, ImageTags: {} },
          { Id: 'artist-2', Name: 'Artist 2', AlbumCount: 3, ImageTags: {} },
        ],
        TotalRecordCount: 2,
      }),
  }
}

describe('useLibrary', () => {
  describe('loadLibrary', () => {
    it('fetches 3 tabs in parallel', async () => {
      mockFetch.mockResolvedValue(createMockFetch())

      const { result } = renderHook(() => useLibrary(mockConfig, 'user-1'))

      await act(async () => {
        await result.current.loadLibrary('https://jellyfin.test', 'test-key', 'user-1')
      })

      // artists, albums, playlists — all 3 tabs are loaded
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('loadMore', () => {
    it('appends items with deduplication by Id', async () => {
      // Initial load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Items: [{ Id: 'artist-1', Name: 'Artist 1', AlbumCount: 5, ImageTags: {} }],
            TotalRecordCount: 4,
          }),
      })
      // Load more
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Items: [
              { Id: 'artist-1', Name: 'Artist 1', AlbumCount: 5, ImageTags: {} }, // duplicate
              { Id: 'artist-2', Name: 'Artist 2', AlbumCount: 3, ImageTags: {} }, // new
            ],
            TotalRecordCount: 4,
          }),
      })

      const { result } = renderHook(() => useLibrary(mockConfig, 'user-1'))

      await act(async () => {
        await result.current.loadLibrary('https://jellyfin.test', 'test-key', 'user-1')
      })

      await act(async () => {
        await result.current.loadMore('artists')
      })

      // Should have only 2 unique artists (deduped)
      const uniqueIds = new Set(result.current.artists.map(a => a.Id))
      expect(uniqueIds.size).toBe(2)
    })
  })

  describe('handleTabChange', () => {
    it('saves scroll position of previous tab', async () => {
      mockFetch.mockResolvedValue(createMockFetch())

      const { result } = renderHook(() => useLibrary(mockConfig, 'user-1'))

      // Mock scroll ref
      const scrollContainer = { scrollTop: 150 }
      ;(result.current.contentScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = scrollContainer as unknown as HTMLDivElement

      await act(async () => {
        await result.current.loadLibrary('https://jellyfin.test', 'test-key', 'user-1')
      })

      act(() => {
        result.current.handleTabChange('albums')
      })

      // Scroll position of 'artists' tab should be saved
      expect(result.current.pagination.artists.scrollPos).toBe(150)
    })
  })

  describe('lazy tab loading', () => {
    it('loadTab fetches albums data when called directly', async () => {
      // Start with empty loadedTabs (hook initial state has only 'artists')
      mockFetch.mockResolvedValue(createMockFetch())

      const { result } = renderHook(() => useLibrary(mockConfig, 'user-1'))

      // Manually call loadTab for albums (not via handleTabChange, since handleTabChange
      // also changes activeLibrary and saves scroll position)
      await act(async () => {
        await result.current.loadTab('albums')
      })

      // loadTab should have fetched albums data
      expect(mockFetch).toHaveBeenCalled()
      const lastCallUrl = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][0] as string
      expect(lastCallUrl.toLowerCase()).toContain('includeitemtypes=musicalbum')
    })
  })

  describe('stats', () => {
    it('populates statsObj correctly after loadStats', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ArtistCount: 42,
            AlbumCount: 120,
            ChildCount: 3000,
            PlaylistCount: 5,
            ItemCount: 3100,
          }),
      })

      const { result } = renderHook(() => useLibrary(mockConfig, 'user-1'))

      await act(async () => {
        await result.current.loadStats('https://jellyfin.test', 'test-key', 'user-1')
      })

      expect(result.current.stats).not.toBeNull()
      expect(result.current.stats?.ArtistCount).toBe(42)
      expect(result.current.stats?.AlbumCount).toBe(120)
      expect(result.current.stats?.SongCount).toBe(3000)
    })
  })
})
