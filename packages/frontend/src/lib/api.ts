const STORAGE_KEY = 'hades-session'

interface StoredSession { token: string; expiresAt: number }

function readStored(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    if (Date.now() >= s.expiresAt) { sessionStorage.removeItem(STORAGE_KEY); return null }
    return s
  } catch { return null }
}

let sessionToken: string | undefined = readStored()?.token

export function setSessionToken(token: string | undefined, expiresAt?: number): void {
  sessionToken = token
  if (token && expiresAt) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt })) } catch {}
  } else {
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
  }
}
export function getStoredSession(): StoredSession | null { return readStored() }
export function websocketToken(): string | undefined { return sessionToken }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_BASE = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? ''
export function apiPath(path: string): string { return `${API_BASE}${path}` }
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) }
}
