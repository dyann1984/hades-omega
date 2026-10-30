import Fastify from 'fastify'
import websocketPlugin from '@fastify/websocket'
import WebSocket from 'ws'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from './sqlite.js'
import { hashPassword, validatePasswordPolicy } from './password.js'
import { registerSecurity } from './security.js'
import { authRoutes } from './auth.js'
import { demoRoutes, expireDemoSessionForTest, resetDemoSessions, DEMO_MAX_RUNS, DEMO_MAX_SESSIONS, DEMO_MAX_SESSIONS_PER_IP, DEMO_TTL_MS } from './demo.js'
import { setupWebSocket } from './websocket.js'
import { resolveDemoSession } from './demo.js'
import { missionRoutes } from './routes/missions.js'
import { agentRoutes } from './routes/agents.js'
import { cerberusRoutes } from './routes/cerberus.js'
import { approvalRoutes } from './routes/approvals.js'
import { localMissionRoutes } from './routes/local-missions.js'
import { documentRoutes } from './routes/documents.js'
import { resetLoginGuard } from './login-guard.js'

const PASS = 'violeta cobre montaña 42'

async function build() {
  const old = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
  resetLoginGuard(); resetDemoSessions()
  const dir = await mkdtemp(join(tmpdir(), 'hades-demo-auth-'))
  const repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
  await repo.init()
  repo.createUser('hades-admin', await hashPassword('a'.repeat(8) + 'Zz9-prod-secret'), 'ADMIN')
  repo.createUser('alice', await hashPassword('correct horse battery staple'), 'OPERATOR')
  const app = Fastify()
  await app.register(websocketPlugin)
  await registerSecurity(app, repo)
  await authRoutes(app, repo)
  await demoRoutes(app)
  await app.register(async api => {
    await missionRoutes(api, repo); await agentRoutes(api)
    await api.register(async scoped => cerberusRoutes(scoped, repo))
    await approvalRoutes(api, repo); await localMissionRoutes(api, repo); await documentRoutes(api, repo)
  }, { prefix: '/api/v1' })
  setupWebSocket(app, repo, sid => repo.getActiveSession(sid) ?? resolveDemoSession(sid))
  await app.ready()
  const cleanup = async () => { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = old }
  return { app, repo, cleanup }
}
type App = Awaited<ReturnType<typeof build>>['app']
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
async function login(app: App, username: string, password: string) { return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password } }) }
async function demo(app: App) { const r = await app.inject({ method: 'POST', url: '/api/v1/demo/session', payload: {} }); expect(r.statusCode).toBe(200); return r.json().data as { token: string; expiresAt: number; role: string } }

describe('password policy', () => {
  it('accepts memorable passphrases and 12-16 char passwords, rejects weak ones', () => {
    expect(validatePasswordPolicy('violeta cobre montaña')).toBeNull()
    expect(validatePasswordPolicy('Cobre#Luna42x')).toBeNull()
    expect(validatePasswordPolicy('short1!')).toBe('PASSWORD_TOO_SHORT')
    expect(validatePasswordPolicy('aaaaaaaaaaaaaaaa')).toBe('PASSWORD_LOW_VARIETY')
    expect(validatePasswordPolicy('administrator')).toBe('PASSWORD_TOO_COMMON')
    expect(validatePasswordPolicy('onlylowercaseletters')).toBeNull() // 20 chars: long enough as passphrase
    expect(validatePasswordPolicy('abcdefghijkl')).toBe('PASSWORD_TOO_WEAK')
    expect(validatePasswordPolicy('xxadminxx-Q9!zz', 'admin')).toBe('PASSWORD_CONTAINS_USERNAME')
  })
})

describe('admin credentials', () => {
  it('changes password with the current one, renames admin->admin, revokes old sessions and keeps one admin', async () => {
    const { app, repo, cleanup } = await build()
    try {
      const first = (await login(app, 'hades-admin', 'aaaaaaaaZz9-prod-secret')).json().data.token as string
      const second = (await login(app, 'hades-admin', 'aaaaaaaaZz9-prod-secret')).json().data.token as string
      const change = (body: object, token = first) => app.inject({ method: 'POST', url: '/api/v1/auth/password', headers: bearer(token), payload: body })
      expect((await change({ currentPassword: 'wrong-current-password', newPassword: PASS })).statusCode).toBe(401)
      expect((await change({ currentPassword: 'aaaaaaaaZz9-prod-secret', newPassword: 'short' })).json().error.code).toBe('PASSWORD_TOO_SHORT')
      const ok = await change({ currentPassword: 'aaaaaaaaZz9-prod-secret', newPassword: PASS, newUsername: 'admin' })
      expect(ok.statusCode).toBe(200)
      expect(JSON.stringify(ok.json())).not.toContain(PASS)
      // the other session is invalidated, the current one survives
      expect((await app.inject({ url: '/api/v1/agents', headers: bearer(second) })).statusCode).toBe(401)
      expect((await app.inject({ url: '/api/v1/agents', headers: bearer(first) })).statusCode).toBe(200)
      // old credentials die, new work; username lowercased and unique (no duplicate admin)
      expect((await login(app, 'hades-admin', 'aaaaaaaaZz9-prod-secret')).statusCode).toBe(401)
      const fresh = await login(app, 'admin', PASS)
      expect(fresh.statusCode).toBe(200); expect(fresh.json().data.role).toBe('ADMIN')
      expect(repo.findUser('hades-admin')).toBeUndefined()
      expect((await change({ currentPassword: PASS, newPassword: 'otra passphrase larga 77', newUsername: 'alice' }, fresh.json().data.token)).statusCode).toBe(409)
      // non-admin cannot rename
      const alice = (await login(app, 'alice', 'correct horse battery staple')).json().data.token as string
      expect((await change({ currentPassword: 'correct horse battery staple', newPassword: 'nueva passphrase segura 5', newUsername: 'root1' }, alice)).statusCode).toBe(403)
    } finally { await cleanup() }
  })
  it('renews the token and revokes the previous session', async () => {
    const { app, cleanup } = await build()
    try {
      const old = (await login(app, 'alice', 'correct horse battery staple')).json().data.token as string
      const renewed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: bearer(old) })
      expect(renewed.statusCode).toBe(200)
      const next = renewed.json().data.token as string
      expect(next).not.toBe(old)
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: bearer(old) })).statusCode).toBe(401)
      expect((await app.inject({ url: '/api/v1/missions', headers: bearer(next) })).statusCode).toBe(200)
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: bearer(next) })).statusCode).toBe(200)
      expect((await app.inject({ url: '/api/v1/missions', headers: bearer(next) })).statusCode).toBe(401)
    } finally { await cleanup() }
  })
  it('locks an account after repeated failures, even for the right password', async () => {
    const { app, cleanup } = await build()
    try {
      const codes: number[] = []
      for (let i = 0; i < 6; i++) codes.push((await login(app, 'alice', `bad-password-${i}-xx`)).statusCode)
      expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
      expect(codes[5]).toBe(429)
      expect((await login(app, 'alice', 'correct horse battery staple')).statusCode).toBe(429)
    } finally { await cleanup() }
  })
})

const SENSITIVE: Array<[string, string, object?]> = [
  ['GET', '/api/v1/agents'], ['GET', '/api/v1/agents/CHARON'], ['GET', '/api/v1/missions'], ['GET', '/api/v1/missions/x'],
  ['POST', '/api/v1/missions', { title: 'x', description: 'y' }], ['GET', '/api/v1/capabilities'],
  ['GET', '/api/v1/approvals'], ['POST', '/api/v1/approvals/x/decision', { status: 'APPROVED', justification: 'hola' }],
  ['GET', '/api/v1/cerberus/audit'], ['GET', '/api/v1/cerberus/policy'], ['GET', '/api/v1/cerberus/status'],
  ['GET', '/api/v1/audit/events'], ['GET', '/api/v1/audit/integrity'],
  ['GET', '/api/v1/local-approvals'], ['POST', '/api/v1/local-approvals/x/decision', { status: 'APPROVED', justification: 'hola' }],
  ['POST', '/api/v1/local-missions', { title: 'x', input: 'y' }], ['POST', '/api/v1/local-missions/multi-document', { title: 'x', documents: [] }],
  ['GET', '/api/v1/documents/results'], ['POST', '/api/v1/documents/process', {}], ['GET', '/api/v1/near/status'], ['GET', '/api/v1/near/transactions'],
  ['POST', '/api/v1/auth/password', { currentPassword: 'x', newPassword: 'yyyyyyyyyyyy' }], ['POST', '/api/v1/auth/refresh'],
]

describe('DEMO mode isolation', () => {
  it('creates a signed, expiring DEMO session without credentials and exposes demo data', async () => {
    const { app, cleanup } = await build()
    try {
      const session = await demo(app)
      expect(session.role).toBe('DEMO')
      expect(session.expiresAt - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000)
      const info = (await app.inject({ url: '/api/v1/demo/info?lang=en', headers: bearer(session.token) })).json().data
      expect(info.capabilities.map((c: { label: string }) => c.label)).toEqual(expect.arrayContaining(['REAL', 'DETERMINISTA', 'SIMULADA', 'NO_DISPONIBLE']))
      expect(info.agents).toHaveLength(7)
      expect((await app.inject({ url: '/api/v1/demo/agents', headers: bearer(session.token) })).json().data).toHaveLength(7)
      expect((await app.inject({ url: '/api/v1/demo/cerberus/policy', headers: bearer(session.token) })).json().data.rules.length).toBeGreaterThan(0)
      expect((await app.inject({ url: '/api/v1/demo/near/status', headers: bearer(session.token) })).json().data.mode).toBe('simulation')
      expect((await app.inject({ url: '/api/v1/demo/info' })).statusCode).toBe(401)
    } finally { await cleanup() }
  })
  it('denies every sensitive production route to DEMO sessions (default-deny)', async () => {
    const { app, cleanup } = await build()
    try {
      const { token } = await demo(app)
      for (const [method, url, payload] of SENSITIVE) {
        const res = await app.inject({ method: method as 'GET', url, headers: bearer(token), payload })
        expect(res.statusCode, `${method} ${url}`).toBe(403)
      }
      // an unlisted path under /demo is explicitly unavailable
      expect((await app.inject({ url: '/api/v1/demo/users', headers: bearer(token) })).statusCode).toBe(403)
      expect((await app.inject({ method: 'POST', url: '/api/v1/demo/anything', headers: bearer(token), payload: {} })).statusCode).toBe(403)
    } finally { await cleanup() }
  })
  it('does not let a forged token claim a higher role, and keeps non-DEMO tokens off demo routes', async () => {
    const { app, cleanup } = await build()
    try {
      const { token } = await demo(app)
      const claims = app.jwt.decode<{ sub: string; sid: string }>(token)!
      const forged = app.jwt.sign({ sub: claims.sub, roles: ['ADMIN'], sid: claims.sid, exp: Math.floor(Date.now() / 1000) + 600 })
      expect((await app.inject({ url: '/api/v1/agents', headers: bearer(forged) })).statusCode).toBe(403)
      expect((await app.inject({ url: '/api/v1/demo/info', headers: bearer(forged) })).statusCode).toBe(200) // still only DEMO powers
      const unknownSid = app.jwt.sign({ sub: 'demo:x', roles: ['ADMIN'], sid: 'demo-nonexistent', exp: Math.floor(Date.now() / 1000) + 600 })
      expect((await app.inject({ url: '/api/v1/agents', headers: bearer(unknownSid) })).statusCode).toBe(401)
      const admin = (await login(app, 'alice', 'correct horse battery staple')).json().data.token as string
      expect((await app.inject({ url: '/api/v1/demo/info', headers: bearer(admin) })).statusCode).toBe(403)
    } finally { await cleanup() }
  })
  it('expires and revokes sessions', async () => {
    const { app, cleanup } = await build()
    try {
      const a = await demo(app), b = await demo(app)
      const sid = app.jwt.decode<{ sid: string }>(a.token)!.sid
      expireDemoSessionForTest(sid)
      expect((await app.inject({ url: '/api/v1/demo/info', headers: bearer(a.token) })).statusCode).toBe(401)
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: bearer(b.token) })).statusCode).toBe(200)
      expect((await app.inject({ url: '/api/v1/demo/info', headers: bearer(b.token) })).statusCode).toBe(401)
    } finally { await cleanup() }
  })
  it('runs the deterministic scenario, halts at the Approval Gate, resumes and seals a verifiable report; sessions never see each other', async () => {
    const { app, repo, cleanup } = await build()
    try {
      const a = await demo(app), b = await demo(app)
      const run = await app.inject({ method: 'POST', url: '/api/v1/demo/scenario/run', headers: bearer(a.token), payload: { lang: 'en' } })
      expect(run.statusCode).toBe(200)
      const { mission, approvalId, label } = run.json().data
      expect(label).toBe('DETERMINISTA')
      expect(mission.tasks.map((t: { status: string }) => t.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED', 'CERBERUS_REVIEW', 'QUEUED'])
      expect(mission.context.guardDecision.outcome).toBe('PERMIT')
      expect((await app.inject({ url: `/api/v1/demo/missions/${mission.id}/report`, headers: bearer(a.token) })).statusCode).toBe(409) // halted: no report yet
      // isolation between sessions
      expect((await app.inject({ url: '/api/v1/demo/missions', headers: bearer(b.token) })).json().data).toEqual([])
      expect((await app.inject({ url: '/api/v1/demo/local-approvals', headers: bearer(b.token) })).json().data).toEqual([])
      expect((await app.inject({ url: `/api/v1/demo/missions/${mission.id}/report`, headers: bearer(b.token) })).statusCode).toBe(404)
      const decide = (token: string, status = 'APPROVED') => app.inject({ method: 'POST', url: `/api/v1/demo/local-approvals/${approvalId}/decision`, headers: bearer(token), payload: { status, justification: 'Revisado en la demo' } })
      expect((await decide(b.token)).statusCode).toBe(404)
      expect((await decide(a.token)).statusCode).toBe(200)
      expect((await decide(a.token)).statusCode).toBe(404) // idempotent: already resolved
      const report = (await app.inject({ url: `/api/v1/demo/missions/${mission.id}/report`, headers: bearer(a.token) })).json().data
      expect(report.verifiable).toBe(true)
      expect(report.sha256).toBe(createHash('sha256').update(report.markdown).digest('hex'))
      const md = await app.inject({ url: `/api/v1/demo/missions/${mission.id}/report?format=md`, headers: bearer(a.token) })
      expect(md.headers['content-disposition']).toContain('attachment'); expect(md.body).toContain(report.sha256)
      const audit = (await app.inject({ url: '/api/v1/demo/audit/events', headers: bearer(a.token) })).json().data
      expect(audit.length).toBeGreaterThan(0)
      // production database was never touched by the demo
      expect(repo.listMissions()).toEqual([])
      expect((repo as unknown as { listAuditEvents(f: object): unknown[] }).listAuditEvents({ limit: 100, offset: 0 }).every((e: any) => e.actor !== a.token)).toBe(true)
    } finally { await cleanup() }
  })
  it('limits scenario runs per session', async () => {
    const { app, cleanup } = await build()
    try {
      const { token } = await demo(app)
      for (let i = 0; i < DEMO_MAX_RUNS; i++) expect((await app.inject({ method: 'POST', url: '/api/v1/demo/scenario/run', headers: bearer(token), payload: {} })).statusCode).toBe(200)
      expect((await app.inject({ method: 'POST', url: '/api/v1/demo/scenario/run', headers: bearer(token), payload: {} })).statusCode).toBe(429)
    } finally { await cleanup() }
  })
})

describe('DEMO WebSocket', () => {
  it('streams scenario events only to the owning demo socket and never to other sessions', async () => {
    const { app, cleanup } = await build()
    try {
      const addr = await app.listen({ host: '127.0.0.1', port: 0 })
      const a = await demo(app), b = await demo(app)
      const open = (token: string) => new Promise<{ ws: WebSocket; events: Array<{ type: string; demo?: boolean }> }>((resolve, reject) => {
        const ws = new WebSocket(addr.replace('http:', 'ws:') + '/ws'); const events: Array<{ type: string; demo?: boolean }> = []
        ws.on('message', raw => { const e = JSON.parse(raw.toString()); if (e.type === 'CONNECTED') resolve({ ws, events }); else events.push(e) })
        ws.once('open', () => ws.send(JSON.stringify({ type: 'AUTH', token }))); ws.once('error', reject)
      })
      const wa = await open(a.token), wb = await open(b.token)
      await app.inject({ method: 'POST', url: '/api/v1/demo/scenario/run', headers: bearer(a.token), payload: {} })
      await new Promise(r => setTimeout(r, 300))
      expect(wa.events.filter(e => e.type === 'EXECUTION_EVENT').length).toBeGreaterThan(3)
      expect(wa.events.filter(e => e.type === 'EXECUTION_EVENT').every(e => e.demo === true)).toBe(true)
      expect(wb.events.filter(e => e.type === 'EXECUTION_EVENT')).toHaveLength(0)
      wa.ws.close(); wb.ws.close()
    } finally { await cleanup() }
  })
})

describe('DEMO abuse limits (Render Free protection)', () => {
  const create = (app: App, ip: string, payload: unknown = {}) => app.inject({ method: 'POST', url: '/api/v1/demo/session', remoteAddress: ip, payload: payload as object })
  it('honours the 30 minute lifetime in both the response and the signed token', async () => {
    const { app, cleanup } = await build()
    try {
      const before = Date.now()
      const data = (await create(app, '10.0.0.1')).json().data
      expect(DEMO_TTL_MS).toBe(30 * 60 * 1000)
      expect(data.expiresAt - before).toBeLessThanOrEqual(DEMO_TTL_MS + 2000)
      const exp = app.jwt.decode<{ exp: number }>(data.token)!.exp
      expect(exp * 1000).toBeLessThanOrEqual(before + DEMO_TTL_MS + 2000)
      expect(exp * 1000).toBeGreaterThan(before + DEMO_TTL_MS - 5000)
    } finally { await cleanup() }
  })
  it('caps concurrent sessions per IP and in total', async () => {
    const { app, cleanup } = await build()
    try {
      for (let i = 0; i < DEMO_MAX_SESSIONS_PER_IP; i++) expect((await create(app, '10.0.1.1')).statusCode).toBe(200)
      const blocked = await create(app, '10.0.1.1')
      expect(blocked.statusCode).toBe(429); expect(blocked.json().error.code).toBe('DEMO_IP_LIMIT')
      resetDemoSessions()
      for (let i = 0; i < DEMO_MAX_SESSIONS; i++) expect((await create(app, `10.0.2.${i + 1}`)).statusCode).toBe(200)
      const full = await create(app, '10.0.3.1')
      expect(full.statusCode).toBe(503); expect(full.json().error.code).toBe('DEMO_CAPACITY')
    } finally { await cleanup() }
  })
  it('rate-limits session creation per IP and rejects oversized bodies', async () => {
    const { app, cleanup } = await build()
    try {
      const codes: number[] = []
      for (let i = 0; i < 12; i++) { codes.push((await create(app, '10.0.4.1')).statusCode); resetDemoSessions() }
      expect(codes.slice(0, 10).every(c => c === 200)).toBe(true)
      expect(codes[10]).toBe(429)
      const big = await create(app, '10.0.5.1', { lang: 'x'.repeat(5000) })
      expect(big.statusCode).toBe(413)
    } finally { await cleanup() }
  })
  it('limits sockets per demo session', async () => {
    const { app, cleanup } = await build()
    try {
      const addr = await app.listen({ host: '127.0.0.1', port: 0 })
      const { token } = await demo(app)
      const connect = () => new Promise<number | 'open'>(resolve => {
        const ws = new WebSocket(addr.replace('http:', 'ws:') + '/ws')
        ws.on('message', raw => { if (JSON.parse(raw.toString()).type === 'CONNECTED') resolve('open') })
        ws.once('close', code => resolve(code)); ws.once('open', () => ws.send(JSON.stringify({ type: 'AUTH', token })))
        ;(connect as unknown as { open: WebSocket[] }).open ??= []; (connect as unknown as { open: WebSocket[] }).open.push(ws)
      })
      const results = [await connect(), await connect(), await connect(), await connect()]
      expect(results.slice(0, 3)).toEqual(['open', 'open', 'open'])
      expect(results[3]).toBe(1008)
      for (const ws of (connect as unknown as { open: WebSocket[] }).open) ws.close()
    } finally { await cleanup() }
  })
})