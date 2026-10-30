import { useEffect } from 'react'
import { useHadesStore } from '../store/index.js'
import { apiPath } from '../lib/api.js'

/**
 * API connectivity = the public, unauthenticated /api/health answers 200.
 * Role-restricted endpoints (HTTP 401/403/404 for DEMO) say nothing about connectivity and are never used here.
 * A single failure while previously connected triggers one quick re-check before reporting "inactive"
 * (reconnection), so a transient blip or a sleeping backend is not shown as a hard failure.
 */
export function useApiStatus(): void {
  useEffect(() => {
    let stopped = false
    const run = (): void => { void check(() => stopped) }
    run()
    const id = setInterval(run, 30_000)
    const online = (): void => run()
    window.addEventListener('online', online)
    return () => { stopped = true; clearInterval(id); window.removeEventListener('online', online) }
  }, [])
}

async function probe(): Promise<boolean> {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    // Dev: same-origin (Vite proxy) avoids a stale absolute VITE_API_URL. Production: the configured API origin.
    const url = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? '/api/health' : apiPath('/api/health')
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return false
    const body = await res.json().catch(() => null) as { status?: string } | null
    return body?.status === 'ok'
  } catch { return false } finally { clearTimeout(timer) }
}

async function check(stopped: () => boolean): Promise<void> {
  const set = useHadesStore.getState().setApiReady
  let ok = await probe()
  if (!ok && !stopped()) {
    if (useHadesStore.getState().apiReady === true) set(null)          // "verifying" while reconnecting; never a fake green
    await new Promise(r => setTimeout(r, 2500))
    if (!stopped()) ok = await probe()
  }
  if (!stopped()) set(ok)
}
