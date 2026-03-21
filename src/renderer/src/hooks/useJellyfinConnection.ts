import { useState, useEffect } from 'react'
import type { JellyfinConfig, JellyfinUser } from '../appTypes'
import { jellyfinHeaders } from '../utils/jellyfin'

const SESSION_KEY = 'jellytunes-session'

interface ConnectionState {
  jellyfinConfig: JellyfinConfig | null
  userId: string | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  users: JellyfinUser[]
  showUserSelector: boolean
  pendingConfig: { url: string; apiKey: string } | null
  urlInput: string
  apiKeyInput: string
}

interface SavedSession {
  url: string
  apiKey: string
  userId?: string
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.url && parsed.apiKey ? parsed : null
  } catch {
    return null
  }
}

function saveSession(url: string, apiKey: string, userId: string): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ url, apiKey, userId }))
  } catch { /* ignore */ }
}

function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

export function useJellyfinConnection(
  onConnected: (url: string, apiKey: string, userId: string) => void
) {
  const session = loadSession()

  const [state, setState] = useState<ConnectionState>({
    jellyfinConfig: null,
    userId: null,
    isConnected: false,
    // If session exists, start in connecting state so ConnectingScreen shows immediately
    isConnecting: !!session,
    error: null,
    users: [],
    showUserSelector: false,
    pendingConfig: null,
    urlInput: session?.url ?? '',
    apiKeyInput: session?.apiKey ?? '',
  })

  const connectWithUser = async (url: string, apiKey: string, userId: string): Promise<void> => {
    saveSession(url, apiKey, userId)
    setState(prev => ({
      ...prev,
      jellyfinConfig: { url, apiKey, userId },
      userId,
      isConnected: true,
      isConnecting: false,
      error: null,
    }))
    onConnected(url, apiKey, userId)
  }

  // Auto-connect on mount if session is saved
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!session) return
    const { url, apiKey, userId } = session
    const normalized = url.replace(/\/$/, '')

    if (userId) {
      // Fast path: we have userId, just validate server is reachable
      fetch(`${normalized}/System/Info/Public`, { signal: AbortSignal.timeout(5000) })
        .then(r => r.ok
          ? connectWithUser(normalized, apiKey, userId)
          : Promise.reject(new Error(`Server returned ${r.status}`))
        )
        .catch(() => {
          clearSession()
          setState(prev => ({ ...prev, isConnecting: false, error: 'Could not reconnect. Please log in again.' }))
        })
    } else {
      // Legacy session without userId — try /Users/Me
      connectToJellyfin(normalized, apiKey)
    }
  }, []) // intentional: run once on mount

  const fetchUserList = async (baseUrl: string, apiKey: string): Promise<JellyfinUser[]> => {
    const headers = jellyfinHeaders(apiKey)
    const authRes = await fetch(`${baseUrl}/Users`, { headers }).catch(() => null)
    if (authRes?.ok) {
      const users: JellyfinUser[] = await authRes.json()
      if (users.length > 0) return users
    }
    const publicRes = await fetch(`${baseUrl}/Users/Public`).catch(() => null)
    if (publicRes?.ok) {
      const users: JellyfinUser[] = await publicRes.json()
      if (users.length > 0) return users
    }
    return []
  }

  const connectToJellyfin = async (url: string, apiKey: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }))
    try {
      const normalizedUrl = url.replace(/\/$/, '')
      const headers = jellyfinHeaders(apiKey)
      const response = await fetch(`${normalizedUrl}/System/Info/Public`, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`Connection error: ${response.status} ${response.statusText}`)
      }
      const userRes = await fetch(`${normalizedUrl}/Users/Me`, { headers }).catch(() => null)
      if (userRes?.ok) {
        const userData = await userRes.json()
        await connectWithUser(normalizedUrl, apiKey, userData.Id)
        return true
      }
      const userList = await fetchUserList(normalizedUrl, apiKey)
      if (userList.length > 0) {
        setState(prev => ({
          ...prev,
          users: userList,
          pendingConfig: { url: normalizedUrl, apiKey },
          showUserSelector: true,
          isConnecting: false,
        }))
        return false
      }
      setState(prev => ({ ...prev, isConnecting: false, error: 'Could not identify user. Please select manually.' }))
      return false
    } catch (err) {
      setState(prev => ({ ...prev, isConnecting: false, error: err instanceof Error ? err.message : 'Connection failed' }))
      return false
    }
  }

  const handleUserSelect = async (user: JellyfinUser): Promise<void> => {
    if (!state.pendingConfig) return
    const { url, apiKey } = state.pendingConfig
    setState(prev => ({ ...prev, showUserSelector: false, pendingConfig: null }))
    await connectWithUser(url, apiKey, user.Id)
  }

  const handleUserSelectorCancel = (): void => {
    setState(prev => ({ ...prev, showUserSelector: false, pendingConfig: null, users: [], isConnecting: false }))
  }

  const disconnect = (): void => {
    clearSession()
    setState(prev => ({ ...prev, isConnected: false, jellyfinConfig: null, userId: null, urlInput: '', apiKeyInput: '' }))
  }

  return {
    ...state,
    connectToJellyfin,
    handleUserSelect,
    handleUserSelectorCancel,
    disconnect,
    setUrlInput: (v: string) => setState(prev => ({ ...prev, urlInput: v })),
    setApiKeyInput: (v: string) => setState(prev => ({ ...prev, apiKeyInput: v })),
  }
}
