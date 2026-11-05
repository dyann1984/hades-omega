import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DECISION_CODES } from '@hades/core'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { cerberusRoutes } from './cerberus.js'

describe('C-7: decision-code catalogue over HTTP', () => {
  it('serves the stable catalogue to any authenticated role, keeps decision logs ADMIN-only, and unauthenticated access out', async () => {
    const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'codes-http-')); const repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
    const app = Fastify()
    try {
      await registerSecurity(app); await app.register(async a => cerberusRoutes(a, repo), { prefix: '/api/v1' }); await app.ready()
      const call = (role: string | null, url: string) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: role ? { authorization: `Bearer ${app.jwt.sign({ sub: `${role}-u`, roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } : {} })
      for (const role of ['VIEWER', 'AUDITOR', 'OPERATOR', 'ADMIN']) {
        const r = await call(role, '/cerberus/gate/codes')
        expect(r.statusCode, role).toBe(200)
        const data = r.json().data as Array<{ code: string; source: string; outcome: string; http: number; description: string }>
        expect(data.map(d => d.code).sort()).toEqual(Object.keys(DECISION_CODES).sort())
        expect(data.every(d => d.description.length > 10 && ['GATE', 'GUARD'].includes(d.source))).toBe(true)
      }
      expect((await call(null, '/cerberus/gate/codes')).statusCode).toBe(401)
      // Decision logs carry dynamic texts: they stay restricted.
      expect((await call('VIEWER', '/cerberus/gate/decisions')).statusCode).toBe(403)
      expect((await call('ADMIN', '/cerberus/gate/decisions')).statusCode).toBe(200)
    } finally { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = previous }
  })

  it('exports the audit anchor to ADMIN only, matching the independent verifier\'s view', async () => {
    const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'anchor-http-')); const repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
    const app = Fastify()
    try {
      await registerSecurity(app); await app.register(async a => cerberusRoutes(a, repo), { prefix: '/api/v1' }); await app.ready()
      const call = (role: string) => app.inject({ method: 'GET', url: '/api/v1/cerberus/audit/anchor', headers: { authorization: `Bearer ${app.jwt.sign({ sub: `${role}-u`, roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } })
      expect((await call('OPERATOR')).statusCode).toBe(403)
      const ok = await call('ADMIN'); expect(ok.statusCode).toBe(200)
      const v = repo.verifyAuditIntegrity()
      expect(ok.json().data).toMatchObject({ schema: 'hades-audit-anchor/1', headHash: v.headHash, hashedEvents: v.hashedEvents })
    } finally { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = previous }
  })

  it('denies NEAR account lookups with the stable code and a generic description, never the dynamic reason', async () => {
    const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'codes-deny-')); const repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
    const app = Fastify()
    try {
      repo.gate.setStopped(true, 'admin')
      await registerSecurity(app); await app.register(async a => cerberusRoutes(a, repo), { prefix: '/api/v1' }); await app.ready()
      const res = await app.inject({ method: 'GET', url: '/api/v1/near/testnet/account/alice.testnet', headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'root', roles: ['ADMIN'], exp: Math.floor(Date.now() / 1000) + 60 })}` } })
      expect(res.statusCode).toBe(403)
      expect(res.json().error).toMatchObject({ code: 'CERBERUS_DENIED', gateCode: 'EMERGENCY_STOP' })
      expect(res.json().error.message).toBe(DECISION_CODES.EMERGENCY_STOP.description)
    } finally { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = previous }
  })
})
