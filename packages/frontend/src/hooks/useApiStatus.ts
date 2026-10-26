import { useEffect } from 'react'
import { useHadesStore } from '../store/index.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_BASE = (import.meta as any).env?.VITE_API_URL ?? ''

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
    const res   = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    useHadesStore.getState().setApiReady(res.ok)
  } catch {
    useHadesStore.getState().setApiReady(false)
  }
}
