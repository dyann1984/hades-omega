import { useEffect } from 'react'
import { useHadesStore } from '../store/index.js'

export function useApiStatus(): void {
  useEffect(() => {
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [])
}

async function check(): Promise<void> {
  try {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    // Same-origin avoids a stale absolute VITE_API_URL after the launcher chooses a port.
    const res   = await fetch('/api/health', { signal: ctrl.signal })
    clearTimeout(timer)
    useHadesStore.getState().setApiReady(res.ok)
  } catch {
    useHadesStore.getState().setApiReady(false)
  }
}
