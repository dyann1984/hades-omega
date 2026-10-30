/** In-memory per-account brute-force lockout (complements the per-IP rate limit). */
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5
interface Entry { failures: number; firstAt: number; lockedUntil: number }
const entries = new Map<string, Entry>()
const key = (username: string): string => username.trim().toLowerCase().slice(0, 64)

export function lockoutRemainingMs(username: string, now = Date.now()): number {
  const e = entries.get(key(username))
  return e && e.lockedUntil > now ? e.lockedUntil - now : 0
}
export function recordLoginFailure(username: string, now = Date.now()): void {
  const k = key(username)
  let e = entries.get(k)
  if (!e || now - e.firstAt > WINDOW_MS) e = { failures: 0, firstAt: now, lockedUntil: 0 }
  e.failures += 1
  if (e.failures >= MAX_FAILURES) e.lockedUntil = now + WINDOW_MS
  entries.set(k, e)
  if (entries.size > 5000) for (const [name, v] of entries) if (now - v.firstAt > WINDOW_MS) entries.delete(name)
}
export function recordLoginSuccess(username: string): void { entries.delete(key(username)) }
export function resetLoginGuard(): void { entries.clear() }