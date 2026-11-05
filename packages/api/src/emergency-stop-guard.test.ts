import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from './sqlite.js'
import { registerSecurity } from './security.js'
import { localMissionRoutes } from './routes/local-missions.js'
import { missionRoutes } from './routes/missions.js'
import { isBlockedDuringStop, registerEmergencyStopGuard } from './emergency-stop-guard.js'

describe('emergency stop route guard', () => {
  it('classifies launch and approval routes, leaving reads, rejections and cancellations open', () => {
    expect(isBlockedDuringStop('POST', '/api/v1/missions', {})).toBe(true)
    expect(isBlockedDuringStop('POST', '/api/v1/local-missions?x=1', {})).toBe(true)
    expect(isBlockedDuringStop('POST', '/api/v1/local-missions/multi-document', {})).toBe(true)
    expect(isBlockedDuringStop('POST', '/api/v1/audit-flow/abc/near-audit', {})).toBe(true)
    expect(isBlockedDuringStop('POST', '/api/v1/local-approvals/x/decision', { status: 'APPROVED' })).toBe(true)
    expect(isBlockedDuringStop('POST', '/api/v1/approvals/x/decision', { status: 'APPROVED' })).toBe(true)
    expect(isBlockedDuringStop('POST', '/api/v1/local-approvals/x/decision', { status: 'REJECTED' })).toBe(false)
    expect(isBlockedDuringStop('POST', '/api/v1/local-missions/x/cancel', {})).toBe(false)
    expect(isBlockedDuringStop('POST', '/api/v1/cerberus/emergency-stop', {})).toBe(false)
    expect(isBlockedDuringStop('GET', '/api/v1/missions', undefined)).toBe(false)
  })

  it('refuses new missions and approvals while stopped (without side effects) and resumes after the stop is cleared', async () => {
    const old = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'hades-stop-')); const app = Fastify()
    const repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
    try {
      await repo.init(); await registerSecurity(app)
      registerEmergencyStopGuard(app, () => repo.gate.isStopped())
      await app.register(async api => { await missionRoutes(api, repo); await localMissionRoutes(api, repo) }, { prefix: '/api/v1' }); await app.ready()
      const h = (sub: string, role: string) => ({ authorization: `Bearer ${app.jwt.sign({ sub, roles: [role], exp: Math.floor(Date.now() / 1000) + 120 })}` })
      const create = () => app.inject({ method: 'POST', url: '/api/v1/local-missions', headers: h('alice', 'OPERATOR'), payload: { title: 'Hash local', input: 'entrada verificable' } })

      const held = (await create()).json().data // created before the stop, waiting for approval
      repo.gate.setStopped(true, 'admin')
      const before = repo.listMissions().length

      for (const [url, payload] of [['/api/v1/local-missions', { title: 'Hash local', input: 'x' }], ['/api/v1/missions', { title: 'Nueva', description: 'Descripción' }]] as const) {
        const res = await app.inject({ method: 'POST', url, headers: h('alice', 'OPERATOR'), payload })
        expect(res.statusCode, url).toBe(423)
        expect(res.json().error.code).toBe('EMERGENCY_STOP')
      }
      expect(repo.listMissions().length).toBe(before)

      const approve = await app.inject({ method: 'POST', url: `/api/v1/local-approvals/${held.approvalId}/decision`, headers: h('admin', 'ADMIN'), payload: { status: 'APPROVED', justification: 'Verificado' } })
      expect(approve.statusCode).toBe(423)
      expect(repo.getMission(held.mission.id)?.tasks[0].status).toBe('CERBERUS_REVIEW') // still held: nothing executed

      const reject = await app.inject({ method: 'POST', url: `/api/v1/local-approvals/${held.approvalId}/decision`, headers: h('admin', 'ADMIN'), payload: { status: 'REJECTED', justification: 'Detenido por parada' } })
      expect(reject.statusCode).toBe(200)

      repo.gate.setStopped(false, 'admin')
      expect((await create()).statusCode).toBe(201)
    } finally { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = old }
  })
})
