import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDeviceSelections } from './useDeviceSelections'

const mockApi = {
  getSyncedItems: vi.fn().mockResolvedValue([]),
  analyzeDiff: vi.fn().mockResolvedValue({
    success: true,
    items: [],
    totals: { newTracks: 0, metadataChanged: 0, removed: 0, pathChanged: 0, unchanged: 0 },
  }),
  estimateSize: vi.fn().mockResolvedValue({ trackCount: 0, totalBytes: 0, formatBreakdown: {} }),
}

const defaultOptions = {
  serverUrl: 'https://jellyfin.test',
  apiKey: 'test-key',
  userId: 'user-1',
  itemIds: ['artist-1', 'album-1', 'playlist-1'],
  itemTypes: { 'artist-1': 'artist' as const, 'album-1': 'album' as const, 'playlist-1': 'playlist' as const },
  convertToMp3: false,
  bitrate: '192k' as const,
  coverArtMode: 'embed' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { value: mockApi, writable: true })
})

describe('useDeviceSelections', () => {
  describe('activateDevice', () => {
    it('fresh install: getSyncedItems called, analyzeDiff NOT called, estimateSize called with all selected items', async () => {
      mockApi.getSyncedItems.mockResolvedValue([])

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      expect(mockApi.getSyncedItems).toHaveBeenCalledWith('/Volumes/USB')
      expect(mockApi.analyzeDiff).not.toHaveBeenCalled()
      expect(mockApi.estimateSize).toHaveBeenCalledTimes(1)
      const estimateSizeCall = mockApi.estimateSize.mock.calls[0][0]
      expect(estimateSizeCall.itemIds).toEqual(defaultOptions.itemIds)
    })

    it('with items synced: analyzeDiff called only with idsToAnalyze (not all IDs)', async () => {
      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'artist-1', name: 'The Beatles', type: 'artist' as const },
      ])
      mockApi.analyzeDiff.mockResolvedValue({
        success: true,
        items: [],
        totals: { newTracks: 0, metadataChanged: 0, removed: 0, pathChanged: 0, unchanged: 0 },
      })

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      expect(mockApi.analyzeDiff).toHaveBeenCalledTimes(1)
      const analyzeDiffCall = mockApi.analyzeDiff.mock.calls[0][0]
      expect(analyzeDiffCall.itemIds).toEqual(['artist-1'])
      expect(analyzeDiffCall.itemIds).not.toEqual(defaultOptions.itemIds)
    })

    it('estimateSize called with all selected itemIds (including new items)', async () => {
      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'artist-1', name: 'The Beatles', type: 'artist' as const },
      ])
      mockApi.estimateSize.mockResolvedValue({ trackCount: 10, totalBytes: 5_000_000, formatBreakdown: {} })

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      expect(mockApi.estimateSize).toHaveBeenCalledTimes(1)
      const estimateSizeCall = mockApi.estimateSize.mock.calls[0][0]
      expect(estimateSizeCall.itemIds).toEqual(defaultOptions.itemIds)
    })

    it('estimatedSizeBytes populated in state after activation', async () => {
      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'artist-1', name: 'The Beatles', type: 'artist' as const },
      ])
      mockApi.estimateSize.mockResolvedValue({ trackCount: 10, totalBytes: 5_000_000, formatBreakdown: {} })

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      expect(result.current.estimatedSizeBytes).toBe(5_000_000)
    })
  })

  describe('toggleItem', () => {
    it('selects an item correctly', async () => {
      mockApi.getSyncedItems.mockResolvedValue([])

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      act(() => {
        result.current.toggleItem('album-1')
      })

      expect(result.current.selectedTracks.has('album-1')).toBe(true)
    })

    it('deselects an already-selected item correctly', async () => {
      mockApi.getSyncedItems.mockResolvedValue([])

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      act(() => {
        result.current.toggleItem('album-1')
      })
      expect(result.current.selectedTracks.has('album-1')).toBe(true)

      act(() => {
        result.current.toggleItem('album-1')
      })
      expect(result.current.selectedTracks.has('album-1')).toBe(false)
    })
  })

  describe('selectItems', () => {
    it('adds multiple items to selectedItems', async () => {
      mockApi.getSyncedItems.mockResolvedValue([])

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      act(() => {
        result.current.selectItems([{ Id: 'artist-1' }, { Id: 'album-2' }, { Id: 'playlist-1' }])
      })

      expect(result.current.selectedTracks.has('artist-1')).toBe(true)
      expect(result.current.selectedTracks.has('album-2')).toBe(true)
      expect(result.current.selectedTracks.has('playlist-1')).toBe(true)
    })
  })

  describe('clearSelection', () => {
    it('empties selectedItems', async () => {
      mockApi.getSyncedItems.mockResolvedValue([])

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      act(() => {
        result.current.selectItems([{ Id: 'artist-1' }, { Id: 'album-1' }])
      })
      expect(result.current.selectedTracks.size).toBeGreaterThan(0)

      act(() => {
        result.current.clearSelection()
      })

      expect(result.current.selectedTracks.size).toBe(0)
    })
  })

  describe('removeDevice', () => {
    it('clears state and activeDevicePath', async () => {
      mockApi.getSyncedItems.mockResolvedValue([])

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      expect(result.current.activeDevicePath).toBe('/Volumes/USB')

      act(() => {
        result.current.removeDevice('/Volumes/USB')
      })

      expect(result.current.activeDevicePath).toBe(null)
      expect(result.current.selectedTracks.size).toBe(0)
    })
  })

  describe('rapid device switching', () => {
    it('maintains correct state for the last activated device', async () => {
      mockApi.getSyncedItems.mockResolvedValue([])

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB1', defaultOptions)
      })

      act(() => {
        result.current.selectItems([{ Id: 'artist-1' }])
      })

      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'album-1', name: 'Album One', type: 'album' as const },
      ])

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB2', {
          ...defaultOptions,
          itemIds: ['album-1'],
          itemTypes: { 'album-1': 'album' as const },
        })
      })

      expect(result.current.activeDevicePath).toBe('/Volumes/USB2')
      expect(result.current.selectedTracks.has('artist-1')).toBe(false)
    })
  })

  describe('outOfSyncItems', () => {
    it('populated when analyzeDiff returns items with changes', async () => {
      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'artist-1', name: 'The Beatles', type: 'artist' as const },
      ])
      mockApi.analyzeDiff.mockResolvedValue({
        success: true,
        items: [
          {
            itemId: 'artist-1',
            itemName: 'The Beatles',
            itemType: 'artist',
            changes: [],
            summary: { new: 0, metadataChanged: 1, removed: 0, pathChanged: 0, unchanged: 0 },
          },
        ],
        totals: { newTracks: 0, metadataChanged: 1, removed: 0, pathChanged: 0, unchanged: 0 },
      })

      const { result } = renderHook(() => useDeviceSelections())

      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      expect(result.current.outOfSyncItems.has('artist-1')).toBe(true)
    })

    it('second activateDevice with SAME path+options skips analyzeDiff (no unnecessary recalculation)', async () => {
      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'artist-1', name: 'The Beatles', type: 'artist' as const },
      ])
      mockApi.analyzeDiff.mockResolvedValue({
        success: true,
        items: [],
        totals: { newTracks: 0, metadataChanged: 0, removed: 0, pathChanged: 0, unchanged: 0 },
      })

      const { result } = renderHook(() => useDeviceSelections())

      // First activation
      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      // Second activation — same path AND same options → must NOT trigger analyzeDiff
      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      // analyzeDiff should be called exactly once (first activation), not twice
      expect(mockApi.analyzeDiff).toHaveBeenCalledTimes(1)
      // getSyncedItems also skipped when cache key unchanged and path already active
      expect(mockApi.getSyncedItems).toHaveBeenCalledTimes(1)
    })

    it('second activateDevice with DIFFERENT itemIds retriggers analyzeDiff', async () => {
      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'artist-1', name: 'The Beatles', type: 'artist' as const },
      ])

      const { result } = renderHook(() => useDeviceSelections())

      // First activation
      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      // Second activation with different selection
      const differentOptions = {
        ...defaultOptions,
        itemIds: ['artist-1', 'album-1'],
        itemTypes: { 'artist-1': 'artist' as const, 'album-1': 'album' as const },
      }
      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', differentOptions)
      })

      // analyzeDiff should be called again for the new itemIds
      expect(mockApi.analyzeDiff).toHaveBeenCalledTimes(2)
    })
  })

  describe('invalidateCache', () => {
    it('after invalidation, activateDevice re-runs analyzeDiff even with same params', async () => {
      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'artist-1', name: 'The Beatles', type: 'artist' as const },
      ])

      const { result } = renderHook(() => useDeviceSelections())

      // First activation
      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })
      expect(mockApi.analyzeDiff).toHaveBeenCalledTimes(1)

      // Invalidate cache (simulates library refresh detecting server changes)
      act(() => {
        result.current.invalidateCache()
      })

      // Second activation with SAME params → should re-run because cache was invalidated
      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })

      expect(mockApi.analyzeDiff).toHaveBeenCalledTimes(2)
    })
  })

  describe('revalidateDevice', () => {
    it('re-runs analyzeDiff with the same params as last activation', async () => {
      mockApi.getSyncedItems.mockResolvedValue([
        { id: 'artist-1', name: 'The Beatles', type: 'artist' as const },
      ])

      const { result } = renderHook(() => useDeviceSelections())

      // First activation with specific options
      await act(async () => {
        await result.current.activateDevice('/Volumes/USB', defaultOptions)
      })
      expect(mockApi.analyzeDiff).toHaveBeenCalledTimes(1)

      // revalidateDevice should call activateDevice again with same params
      await act(async () => {
        await result.current.revalidateDevice()
      })

      expect(mockApi.analyzeDiff).toHaveBeenCalledTimes(2)
    })
  })
})
