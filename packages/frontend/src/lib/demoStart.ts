import { apiPath, demoPath } from './api.js'

/**
 * DEMO start: wake the backend (idempotent GETs, safe to retry), then create ONE server-side session.
 * Retries of the POST reuse the same Idempotency-Key so a lost response never yields a duplicate session.
 * No background pinging: everything here only runs while the user is actively entering the demo.
 */
export type DemoPhase = 'connecting' | 'waking' | 'creating' | 'ready' | 'failed'
export interface DemoSessionData { token: string; expiresAt: number; role: string }
export interface DemoStartOptions {
  lang: 'es' | 'en'
  onPhase?: (phase: DemoPhase, elapsedMs: number) => void
  signal?: AbortSignal
  /** Test seams. */
  fetchImpl?: typeof fetch
  wakeDeadlineMs?: number
  requestTimeoutMs?: number
}
export class DemoStartError extends Error {
  constructor(readonly code: 'CAPACITY' | 'LIMIT' | 'TIMEOUT' | 'HTTP' | 'ABORTED', readonly status?: number) { super(code) }
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new DemoStartError('ABORTED'))
  const id = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DemoStartError('ABORTED')) }, { once: true })
})

function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController()
  const id = setTimeout(() => ctl.abort(), ms)
  const onAbort = (): void => ctl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  return { signal: ctl.signal, done: () => { clearTimeout(id); signal?.removeEventListener('abort', onAbort) } }
}

function newKey(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}` }
}

/**
 * One-shot wake-up when the login screen opens (a single GET, never repeated): the cold-start of a sleeping
 * backend then overlaps with the time the visitor spends reading the page. Not a keep-alive.
 */
let warmedAt = 0
let warming: Promise<void> | null = null
export function warmBackend(fetchImpl: typeof fetch = fetch.bind(globalThis)): Promise<void> {
  if (warming) return warming
  warming = (async () => {
    const ctl = new AbortController(); const id = setTimeout(() => ctl.abort(), 70_000)
    try { const r = await fetchImpl(apiPath('/api/health'), { signal: ctl.signal, cache: 'no-store' }); if (r.ok) warmedAt = Date.now() }
    catch { /* the explicit start flow retries with visible progress */ }
    finally { clearTimeout(id) }
  })()
  return warming
}
export function resetWarmForTest(): void { warmedAt = 0; warming = null }

/** In-flight dedupe: double clicks / re-renders share one attempt (and one Idempotency-Key). */
let inflight: Promise<DemoSessionData> | null = null

export function startDemoSession(opts: DemoStartOptions): Promise<DemoSessionData> {
  if (inflight) return inflight
  const p = run(opts).finally(() => { inflight = null })
  inflight = p
  return p
}

async function run(opts: DemoStartOptions): Promise<DemoSessionData> {
  const f = opts.fetchImpl ?? fetch.bind(globalThis)
  const t0 = performance.now()
  const phase = (p: DemoPhase): void => opts.onPhase?.(p, Math.round(performance.now() - t0))
  const reqTimeout = opts.requestTimeoutMs ?? 8_000
  const deadline = opts.wakeDeadlineMs ?? 75_000
  const key = newKey()

  // 1) Wake / reach the backend with a cheap GET. A cold Render instance answers after ~30-50 s.
  phase('connecting')
  let attempt = 0
  if (warming && !warmedAt) { phase('waking'); await Promise.race([warming, sleep(deadline, opts.signal).catch(() => {})]) }   // reuse the login-screen wake-up
  const fresh = Date.now() - warmedAt < 120_000
  for (; !fresh;) {
    const t = withTimeout(opts.signal, reqTimeout)
    try {
      const r = await f(apiPath('/api/health'), { signal: t.signal, cache: 'no-store' })
      if (r.ok) break
    } catch (e) {
      if (opts.signal?.aborted) throw new DemoStartError('ABORTED')
      void e
    } finally { t.done() }
    if (performance.now() - t0 > deadline) { phase('failed'); throw new DemoStartError('TIMEOUT') }
    if (attempt++ === 0 || performance.now() - t0 > 2_000) phase('waking')
    await sleep(Math.min(1_000 + attempt * 500, 3_000), opts.signal)
  }

  // 2) Create the session. Retried with the SAME key; the server returns the existing session if it was already created.
  phase('creating')
  let lastStatus: number | undefined
  for (let i = 0; i < 4; i++) {
    const t = withTimeout(opts.signal, 15_000)
    try {
      const r = await f(apiPath('/api/v1/demo/session'), {
        method: 'POST', signal: t.signal,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ lang: opts.lang }),
      })
      if (r.status === 503) { phase('failed'); throw new DemoStartError('CAPACITY', 503) }
      if (r.status === 429) { phase('failed'); throw new DemoStartError('LIMIT', 429) }
      if (r.ok) { const body = await r.json(); phase('ready'); return body.data as DemoSessionData }
      lastStatus = r.status
      if (r.status < 500) break
    } catch (e) {
      if (e instanceof DemoStartError) throw e
      if (opts.signal?.aborted) throw new DemoStartError('ABORTED')
    } finally { t.done() }
    await sleep(800 * (i + 1), opts.signal)
  }
  phase('failed')
  throw new DemoStartError(lastStatus ? 'HTTP' : 'TIMEOUT', lastStatus)
}

// ---- Seed prefetch: starts as soon as the session exists, in parallel with loading the app shell chunk. ----
let seed: { key: string; promise: Promise<unknown> } | null = null
export function prefetchDemoSeed(token: string, lang: string): void {
  const key = `${token}|${lang}`
  seed = { key, promise: fetch(demoPath(`/seed?lang=${lang}`), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null) }
}
/** Returns the prefetched seed body once (or null when none matches), so AppShell never fetches twice. */
export function takePrefetchedSeed(token: string | undefined, lang: string): Promise<unknown> | null {
  if (!seed || !token || seed.key !== `${token}|${lang}`) return null
  const p = seed.promise; seed = null; return p
}
