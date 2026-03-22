import { useState } from 'react'
import { Check, Info, LogOut } from 'lucide-react'
import { GradientMusicIcon } from './GradientMusicIcon'
import { AboutModal } from './AboutModal'

interface AppHeaderProps {
  isConnected: boolean
  serverUrl?: string | null
  onDisconnect: () => void
}

export function AppHeader({ isConnected, serverUrl, onDisconnect }: AppHeaderProps): JSX.Element {
  const hostname = serverUrl ? (() => { try { return new URL(serverUrl).hostname } catch { return serverUrl } })() : null
  const [showAbout, setShowAbout] = useState(false)

  return (
    <header className="h-14 border-b border-jf-border flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <GradientMusicIcon className="w-6 h-6" />
        <h1 className="text-lg font-semibold">JellyTunes</h1>
        {isConnected && (
          <span data-testid="connection-status" className="text-xs text-jf-cyan flex items-center gap-1">
            <Check className="w-3 h-3" /> {hostname ?? 'Connected'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          data-testid="about-button"
          onClick={() => setShowAbout(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <Info className="w-4 h-4" />
          About
        </button>
        {isConnected && (
          <button
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </button>
        )}
      </div>
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </header>
  )
}
