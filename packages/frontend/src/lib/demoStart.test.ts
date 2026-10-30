import { describe, it, expect, vi } from 'vitest'
import { startDemoSession, DemoStartError, warmBackend, resetWarmForTest } from './demoStart.js'

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })
const session = { data: { token: 't', expiresAt: 1, role: 'DEMO' } }

describe('startDemoSession', () => {
  it('wakes the backend with GET /health (retrying) and only then POSTs once', async () => {
    const calls: string[] = []
    let health = 0
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`)
      if (String(url).endsWith('/api/health')) return ++health < 3 ? json(502) : json(200)
      return json(200, session)
    }) as unknown as typeof fetch
    const phases: string[] = []
    const out = await startDemoSession({ lang: 'es', fetchImpl, onPhase: p => phases.push(p) })
    expect(out.token).toBe('t')
    expect(calls.filter(c => c.startsWith('POST'))).toHaveLength(1)
    expect(phases[0]).toBe('connecting'); expect(phases).toContain('waking'); expect(phases.at(-1)).toBe('ready')
  }, 15_000)

  it('reuses the single login-screen wake-up instead of probing again', async () => {
    resetWarmForTest()
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => { calls.push(`${init?.method ?? 'GET'} ${String(url)}`); return String(url).endsWith('/health') ? json(200) : json(200, session) }) as unknown as typeof fetch
    await warmBackend(fetchImpl)
    await warmBackend(fetchImpl)                       // second call must not hit the network
    await startDemoSession({ lang: 'es', fetchImpl })
    expect(calls.filter(c => c.endsWith('/health'))).toHaveLength(1)
    expect(calls.filter(c => c.startsWith('POST'))).toHaveLength(1)
    resetWarmForTest()
  })

  it('shares one attempt between concurrent callers (no duplicate sessions)', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('/health') ? json(200) : json(200, session)) as unknown as typeof fetch
    const [a, b] = await Promise.all([startDemoSession({ lang: 'es', fetchImpl }), startDemoSession({ lang: 'es', fetchImpl })])
    expect(a).toBe(b)
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'POST')).toHaveLength(1)
  })

  it('retries a failed POST with the SAME Idempotency-Key', async () => {
    const keys: string[] = []
    let n = 0
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/health')) return json(200)
      keys.push((init?.headers as Record<string, string>)['Idempotency-Key']!)
      return ++n < 2 ? json(502) : json(200, session)
    }) as unknown as typeof fetch
    await startDemoSession({ lang: 'en', fetchImpl })
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(keys[0]!.length).toBeGreaterThanOrEqual(16)
  }, 15_000)

  it('does not retry capacity (503) and reports a typed error', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('/health') ? json(200) : json(503)) as unknown as typeof fetch
    await expect(startDemoSession({ lang: 'es', fetchImpl })).rejects.toMatchObject({ code: 'CAPACITY' })
  })

  it('times out when the backend never wakes up', async () => {
    const fetchImpl = vi.fn(async () => json(502)) as unknown as typeof fetch
    const err = await startDemoSession({ lang: 'es', fetchImpl, wakeDeadlineMs: 50 }).catch(e => e)
    expect(err).toBeInstanceOf(DemoStartError); expect(err.code).toBe('TIMEOUT')
  })

  it('can be aborted by the user without creating a session', async () => {
    const ctl = new AbortController()
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('abort'))))) as unknown as typeof fetch
    const p = startDemoSession({ lang: 'es', fetchImpl, signal: ctl.signal })
    setTimeout(() => ctl.abort(), 20)
    await expect(p).rejects.toMatchObject({ code: 'ABORTED' })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.every(c => (c[1] as RequestInit | undefined)?.method !== 'POST')).toBe(true)
  })
})
