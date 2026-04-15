import { describe, it, expect, vi } from 'vitest'
import { createApiClient } from './sync-api'
import type { JellyfinTrackItem } from './types'

// Helper to create a minimal track item
function makeTrackItem(overrides: Partial<JellyfinTrackItem> = {}): JellyfinTrackItem {
  return {
    Id: 'track-1',
    Name: 'Yesterday',
    Album: 'Help!',
    AlbumName: 'Help! (Remastered)',
    AlbumArtist: 'The Beatles',
    Artists: ['John Lennon', 'Paul McCartney'],
    Genres: ['Rock', 'Pop'],
    AlbumId: 'album-1',
    Path: '/music/The Beatles/Help!/yesterday.mp3',
    MediaSources: [
      {
        Path: '/music/The Beatles/Help!/yesterday.mp3',
        Container: 'mp3',
        Size: 3_500_000,
        Bitrate: 320_000,
      },
    ],
    IndexNumber: 1,
    ParentIndexNumber: 1,
    ...overrides,
  }
}

describe('sync-api', () => {
  describe('trackItemToInfo (via getAlbumTracks)', () => {
    it('maps item.Album to the album field', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            Items: [
              makeTrackItem({ Id: 'track-1', Album: 'Abbey Road', Name: 'Come Together' }),
            ],
          }),
      })

      const api = createApiClient({
        baseUrl: 'https://jellyfin.test',
        apiKey: 'test-key',
        userId: 'user-1',
        fetch: mockFetch,
      })

      const tracks = await api.getAlbumTracks('album-1')
      expect(tracks[0].album).toBe('Abbey Road')
    })

    it('falls back to AlbumName when Album is undefined', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            Items: [
              makeTrackItem({ Id: 'track-1', Album: undefined, AlbumName: 'Help! (Deluxe)' }),
            ],
          }),
      })

      const api = createApiClient({
        baseUrl: 'https://jellyfin.test',
        apiKey: 'test-key',
        userId: 'user-1',
        fetch: mockFetch,
      })

      const tracks = await api.getAlbumTracks('album-1')
      expect(tracks[0].album).toBe('Help! (Deluxe)')
    })
  })

  describe('getAlbumTracks fields', () => {
    it('includes Artists and AlbumArtist in the Fields query param', async () => {
      let capturedUrl = ''
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ Items: [], ProductionYear: 1969 }),
        })
      })

      const api = createApiClient({
        baseUrl: 'https://jellyfin.test',
        apiKey: 'test-key',
        userId: 'user-1',
        fetch: mockFetch,
      })

      await api.getAlbumTracks('album-1')

      expect(capturedUrl).toContain('Fields=')
      expect(capturedUrl).toContain('Artists')
      expect(capturedUrl).toContain('AlbumArtist')
    })
  })

  describe('getPlaylistTracks fields', () => {
    it('includes Artists and AlbumArtist in the Fields query param', async () => {
      let capturedUrl = ''
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ Items: [] }),
        })
      })

      const api = createApiClient({
        baseUrl: 'https://jellyfin.test',
        apiKey: 'test-key',
        userId: 'user-1',
        fetch: mockFetch,
      })

      await api.getPlaylistTracks('playlist-1')

      expect(capturedUrl).toContain('Fields=')
      expect(capturedUrl).toContain('Artists')
      expect(capturedUrl).toContain('AlbumArtist')
    })
  })

  describe('getTracksForItems', () => {
    it('with empty array: returns { tracks: [], errors: [] } with 0 HTTP calls', async () => {
      const mockFetch = vi.fn()

      const api = createApiClient({
        baseUrl: 'https://jellyfin.test',
        apiKey: 'test-key',
        userId: 'user-1',
        fetch: mockFetch,
      })

      const result = await api.getTracksForItems([], new Map())

      expect(result.tracks).toEqual([])
      expect(result.errors).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('getCoverArt', () => {
    it('emits warning (via error) when cover art fetch fails — sync continues', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      })

      const api = createApiClient({
        baseUrl: 'https://jellyfin.test',
        apiKey: 'test-key',
        userId: 'user-1',
        fetch: mockFetch,
      })

      await expect(api.getCoverArt('cover-art-1')).rejects.toThrow()
    })
  })
})
