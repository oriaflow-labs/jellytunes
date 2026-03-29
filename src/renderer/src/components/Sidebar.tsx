import { useState } from 'react'
import { User, Disc, ListMusic, HardDrive, Folder, Plus, RotateCcw, X } from 'lucide-react'
import type { ActiveSection, LibraryTab, LibraryStats, PaginationState, Artist, Album, Playlist, UsbDevice, SavedDestination } from '../appTypes'

interface SidebarProps {
  activeSection: ActiveSection
  activeLibrary: LibraryTab
  activeDestinationPath: string | null
  stats: LibraryStats | null
  pagination: PaginationState
  artists: Artist[]
  albums: Album[]
  playlists: Playlist[]
  usbDevices: UsbDevice[]
  savedDestinations: SavedDestination[]
  onLibraryTab: (tab: LibraryTab) => void
  onDestinationClick: (path: string) => void
  onAddFolder: () => void
  onRefreshDevices: () => void
  onRemoveDestination: (id: string) => void
}

export function Sidebar({
  activeSection,
  activeLibrary,
  activeDestinationPath,
  stats,
  pagination,
  artists,
  albums,
  playlists,
  usbDevices,
  savedDestinations,
  onLibraryTab,
  onDestinationClick,
  onAddFolder,
  onRefreshDevices,
  onRemoveDestination,
}: SidebarProps): JSX.Element {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const tabClass = (active: boolean) =>
    `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-jf-purple/20 text-jf-purple-light border border-jf-purple/40' : 'hover:bg-zinc-800 text-zinc-300 border border-transparent'}`

  const destClass = (path: string) =>
    `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeDestinationPath === path ? 'bg-jf-purple/20 text-jf-purple-light border border-jf-purple/40' : 'hover:bg-zinc-800 text-zinc-300 border border-transparent'}`

  // USB devices that have at least one mountpoint
  const mountedUsb = usbDevices.flatMap(d =>
    d.mountpoints.map(mp => ({ name: d.productName || d.displayName || 'USB Device', path: mp.path }))
  )

  const hasAnyDestination = mountedUsb.length > 0 || savedDestinations.length > 0

  return (
    <aside className="w-64 border-r border-jf-border p-4 flex flex-col">
      {/* Library */}
      <div className="mb-6">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Library</h3>
        <nav className="space-y-1">
          <button
            data-testid="tab-artists"
            onClick={() => onLibraryTab('artists')}
            className={tabClass(activeSection === 'library' && activeLibrary === 'artists')}
          >
            <User className="w-4 h-4 flex-shrink-0" />
            Artists
            <span className="ml-auto text-xs opacity-60">
              {stats ? stats.ArtistCount.toLocaleString() : pagination.artists.total > 0 ? pagination.artists.total : artists.length}
            </span>
          </button>
          <button
            data-testid="tab-albums"
            onClick={() => onLibraryTab('albums')}
            className={tabClass(activeSection === 'library' && activeLibrary === 'albums')}
          >
            <Disc className="w-4 h-4 flex-shrink-0" />
            Albums
            <span className="ml-auto text-xs opacity-60">
              {stats ? stats.AlbumCount.toLocaleString() : pagination.albums.total > 0 ? pagination.albums.total : albums.length}
            </span>
          </button>
          <button
            data-testid="tab-playlists"
            onClick={() => onLibraryTab('playlists')}
            className={tabClass(activeSection === 'library' && activeLibrary === 'playlists')}
          >
            <ListMusic className="w-4 h-4 flex-shrink-0" />
            Playlists
            <span className="ml-auto text-xs opacity-60">
              {stats ? stats.PlaylistCount.toLocaleString() : pagination.playlists.total > 0 ? pagination.playlists.total : playlists.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Devices */}
      <div className="flex-1">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 flex items-center justify-between">
          Devices
          <button
            data-testid="refresh-devices-button"
            onClick={onRefreshDevices}
            className="p-0.5 text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Refresh devices"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </h3>
        <nav className="space-y-1">
          {/* USB devices */}
          {mountedUsb.map(({ name, path }) => (
            <button
              key={path}
              data-testid="device-item"
              data-device-path={path}
              onClick={() => onDestinationClick(path)}
              className={destClass(path)}
            >
              <HardDrive className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))}

          {/* Saved folders */}
          {savedDestinations.map(dest => (
            <div key={dest.id} className="rounded-lg overflow-hidden">
              {confirmingId === dest.id ? (
                <div className="px-3 py-2 bg-red-900/20 border border-red-800/40 rounded-lg">
                  <p className="text-xs text-zinc-300 mb-2 leading-snug">
                    Remove <span className="font-medium text-white">{dest.name}</span>?{' '}
                    <span className="text-zinc-500">Sync history is kept.</span>
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="flex-1 px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { setConfirmingId(null); onRemoveDestination(dest.id) }}
                      className="flex-1 px-2 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative group/dest">
                  <button
                    data-testid="device-item"
                    data-device-path={dest.path}
                    onClick={() => onDestinationClick(dest.path)}
                    className={`${destClass(dest.path)} pr-7`}
                  >
                    <Folder className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{dest.name}</span>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmingId(dest.id) }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/dest:opacity-100 text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-all"
                    title="Remove from sidebar"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Separator + Add folder */}
          {hasAnyDestination && <div className="border-t border-jf-border my-1" />}
          <button
            data-testid="add-folder-button"
            onClick={onAddFolder}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            Add folder...
          </button>
        </nav>
      </div>
    </aside>
  )
}
