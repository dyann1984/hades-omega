import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { agentRoutes } from './agents.js'
import { missionRoutes } from './missions.js'
import { localMissionRoutes } from './local-missions.js'
import { cerberusRoutes } from './cerberus.js'

describe('FASE 8 — Autonomous Intelligence & Capabilities', () => {
  it('exposes verified capabilities per agent and blocks unauthorized role access', async () => {
    const old = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'hades-cap-')), db = join(dir, 'data.sqlite'), legacy = join(dir, 'none.json')
    const repo = new SqliteRepository(db, legacy); const app = Fastify()
    try {
      await repo.init()
      const admin = repo.createUser('admin', 'unused', 'ADMIN')
      const viewer = repo.createUser('viewer', 'unused', 'VIEWER')
      await registerSecurity(app, repo)
      await app.register(async api => {
        await agentRoutes(api)
      }, { prefix: '/api/v1' })
      await app.ready()

      const auth = (id: string, role: string) => {
        const sid = repo.createSession(id, Date.now() + 60000)
        return { authorization: `Bearer ${app.jwt.sign({ sub: id, roles: [role], sid, exp: Math.floor(Date.now() / 1000) + 60 })}` }
      }

      // Anonymous blocked
      const anonRes = await app.inject({ url: '/api/v1/capabilities' })
      expect(anonRes.statusCode).toBe(401)

      // Viewer allowed to read capabilities
      const viewerRes = await app.inject({ url: '/api/v1/capabilities', headers: auth(viewer, 'VIEWER') })
      expect(viewerRes.statusCode).toBe(200)
      const caps = viewerRes.json().data
      expect(caps.length).toBeGreaterThanOrEqual(10)

      // Query single agent capabilities
      const tartarusRes = await app.inject({ url: '/api/v1/capabilities/agents/TARTARUS', headers: auth(viewer, 'VIEWER') })
      expect(tartarusRes.statusCode).toBe(200)
      const tartarusCaps = tartarusRes.json().data
      expect(tartarusCaps.some((c: any) => c.id === 'cap:crypto:hash@1.0.0')).toBe(true)

      // Non-existent agent returns 404
      const notFoundRes = await app.inject({ url: '/api/v1/capabilities/agents/GHOST', headers: auth(viewer, 'VIEWER') })
      expect(notFoundRes.statusCode).toBe(404)
    } finally {
      await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = old
    }
  })

  it('plans structured missions dynamically and maps capabilities and dependencies', async () => {
    const old = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'hades-plan-')), db = join(dir, 'data.sqlite'), legacy = join(dir, 'none.json')
    const repo = new SqliteRepository(db, legacy); const app = Fastify()
    try {
      await repo.init()
      const admin = repo.createUser('admin', 'unused', 'ADMIN')
      await registerSecurity(app, repo)
      await app.register(async api => {
        await missionRoutes(api, repo)
      }, { prefix: '/api/v1' })
      await app.ready()

      const auth = (id: string, role: string) => {
        const sid = repo.createSession(id, Date.now() + 60000)
        return { authorization: `Bearer ${app.jwt.sign({ sub: id, roles: [role], sid, exp: Math.floor(Date.now() / 1000) + 60 })}` }
      }

      const planRes = await app.inject({
        method: 'POST',
        url: '/api/v1/missions/plan',
        headers: auth(admin, 'ADMIN'),
        payload: {
          title: 'Comparar contratos de proveedores en la nube',
          description: 'Auditoría comparativa y dictamen para selección de proveedor',
          context: {
            budgetLimit: 200000,
            documents: [
              { filename: 'docA.txt', content: 'Contrato Alpha' },
              { filename: 'docB.txt', content: 'Contrato Beta' },
            ],
          },
        },
      })

      expect(planRes.statusCode).toBe(200)
      const plan = planRes.json().data
      expect(plan.tasks.length).toBe(6)
      expect(plan.simulated).toBe(false)
      expect(plan.tasks[0].assignedTo).toBe('CHARON')
      expect(plan.tasks[1].assignedTo).toBe('MINOS')
      expect(plan.tasks[2].assignedTo).toBe('PERSEPHONE')
      expect(plan.tasks[3].assignedTo).toBe('HADES')
      expect(plan.tasks[3].requiresApproval).toBe(true)
      expect(plan.tasks[4].assignedTo).toBe('ELYSIUM')
      expect(plan.tasks[5].assignedTo).toBe('TARTARUS')
    } finally {
      await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = old
    }
  })

  it('executes real multi-document mission, validates reassignment rules, enforces approval, and persists across restart', async () => {
    const old = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'hades-reassign-')), db = join(dir, 'data.sqlite'), legacy = join(dir, 'none.json')
    let repo = new SqliteRepository(db, legacy); let app = Fastify()
    try {
      await repo.init()
      const admin = repo.createUser('admin', 'unused', 'ADMIN')
      const operator = repo.createUser('operator', 'unused', 'OPERATOR')
      await registerSecurity(app, repo)
      await app.register(async api => {
        await localMissionRoutes(api, repo)
        await api.register(async scoped => cerberusRoutes(scoped, repo))
      }, { prefix: '/api/v1' })
      await app.ready()

      const auth = (id: string, role: string) => {
        const sid = repo.createSession(id, Date.now() + 60000)
        return { authorization: `Bearer ${app.jwt.sign({ sub: id, roles: [role], sid, exp: Math.floor(Date.now() / 1000) + 60 })}` }
      }
      const adminHeaders = auth(admin, 'ADMIN')
      const operatorHeaders = auth(operator, 'OPERATOR')

      // 1. Create real multi-document mission with 3 test documents
      const docsPayload = [
        { filename: 'doc-a.txt', content: 'Contrato Alpha: $150,000 MXN, penalización 15%, plazo 30 días, SLA 99.9%, indemnización incluida.' },
        { filename: 'doc-b.txt', content: 'Contrato Beta: $120,000 MXN, penalización 5%, plazo 45 días, SLA 99.5%, cláusula ambigua unilateral.' },
        { filename: 'doc-c.txt', content: 'Contrato Gamma: $95,000 MXN, penalización 0%, plazo 60 días, SLA 98.0%, sin garantía de indemnización.' },
      ]

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/local-missions/multi-document',
        headers: operatorHeaders,
        payload: {
          title: 'Comparativa de 3 Proveedores Cloud',
          documents: docsPayload,
          budgetLimit: 150000,
        },
      })
      expect(createRes.statusCode).toBe(201)
      const { mission, approvalId } = createRes.json().data

      // Check stages: CHARON, MINOS, PERSEPHONE executed immediately; Task 4 is waiting approval (CERBERUS_REVIEW)
      expect(mission.tasks[0].status).toBe('EXECUTED')
      expect(mission.tasks[1].status).toBe('EXECUTED')
      expect(mission.tasks[2].status).toBe('EXECUTED')
      expect(mission.tasks[3].status).toBe('CERBERUS_REVIEW')
      expect(mission.tasks[3].assignedTo).toBe('HADES')

      // 2. Test INCOMPATIBLE reassignment attempt: reassigning Task 2 (MINOS validation) to PERSEPHONE
      const badReassignRes = await app.inject({
        method: 'POST',
        url: `/api/v1/local-missions/${mission.id}/tasks/${mission.tasks[1].id}/reassign`,
        headers: adminHeaders,
        payload: {
          newAssignee: 'PERSEPHONE',
          justification: 'Prueba de transferencia indebida',
        },
      })
      // Must be blocked because task 2 already completed or PERSEPHONE lacks cap:doc:validate
      expect([400, 409]).toContain(badReassignRes.statusCode)

      // Test INCOMPATIBLE reassignment on unexecuted task: try assigning Task 5 (ELYSIUM report) to MINOS
      const badReassignReport = await app.inject({
        method: 'POST',
        url: `/api/v1/local-missions/${mission.id}/tasks/${mission.tasks[4].id}/reassign`,
        headers: adminHeaders,
        payload: {
          newAssignee: 'MINOS',
          justification: 'Asignar informe a validador',
        },
      })
      expect(badReassignReport.statusCode).toBe(409)
      expect(badReassignReport.json().error.code).toBe('REASSIGNMENT_BLOCKED_BY_DESIGN')
      expect(badReassignReport.json().error.message).toContain('MINOS')

      // 3. Test COMPATIBLE reassignment: Task 4 (SHA-256 hash / crypto) from HADES to TARTARUS!
      const goodReassignRes = await app.inject({
        method: 'POST',
        url: `/api/v1/local-missions/${mission.id}/tasks/${mission.tasks[3].id}/reassign`,
        headers: adminHeaders,
        payload: {
          newAssignee: 'TARTARUS',
          justification: 'Transferencia autorizada al especialista en seguridad criptográfica TARTARUS',
        },
      })
      expect(goodReassignRes.statusCode).toBe(200)
      const reassignedTask = goodReassignRes.json().data.task
      expect(reassignedTask.assignedTo).toBe('TARTARUS')

      // Check audit event recorded for reassignment
      const auditRes = await app.inject({
        url: `/api/v1/audit/events?missionId=${mission.id}`,
        headers: adminHeaders,
      })
      expect(auditRes.statusCode).toBe(200)
      const events = auditRes.json().data
      expect(events.some((e: any) => e.action === 'TASK_REASSIGNED')).toBe(true)

      // 4. Admin decides approval on the mission hold
      const decideRes = await app.inject({
        method: 'POST',
        url: `/api/v1/local-approvals/${approvalId}/decision`,
        headers: adminHeaders,
        payload: {
          status: 'APPROVED',
          justification: 'Aprobación directiva para proceder con dictamen y sellado',
        },
      })
      expect(decideRes.statusCode).toBe(200)
      const finishedMission = decideRes.json().data
      expect(finishedMission.status).toBe('COMPLETED')
      // Task 4 executed by TARTARUS
      const task4 = finishedMission.tasks.find((t: any) => t.id === mission.tasks[3].id)
      expect(task4.status).toBe('EXECUTED')
      expect(task4.assignedTo).toBe('TARTARUS')
      expect(task4.result.data.executor).toBe('TARTARUS')
      expect(task4.result.data.sha256).toBeTruthy()

      // Subsequent tasks executed
      expect(finishedMission.tasks[4].status).toBe('EXECUTED')
      expect(finishedMission.tasks[5].status).toBe('EXECUTED')

      // 5. Restart backend and check persistence
      await app.close(); repo.close()
      repo = new SqliteRepository(db, legacy); await repo.init()
      const restored = repo.getMission(mission.id)
      expect(restored).toBeTruthy()
      expect(restored?.status).toBe('COMPLETED')
      expect(restored?.tasks.every(t => t.status === 'EXECUTED')).toBe(true)
    } finally {
      await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = old
    }
  })
})
