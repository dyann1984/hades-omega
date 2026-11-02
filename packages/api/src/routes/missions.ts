import type { FastifyInstance } from 'fastify'
import { hades, audit, near } from '../runtime.js'
import type { JsonRepository } from '../persistence.js'
import { requireRole } from '../security.js'
import { createHash } from 'node:crypto'
import { createRuleBasedPlanner } from '@hades/core'

const missionPlanner = createRuleBasedPlanner()

export async function missionRoutes(app: FastifyInstance, repository?: JsonRepository): Promise<void> {
  app.post('/missions', async (req, reply) => {
    // Standalone route tests omit persistence; production always passes the repository.
    if (repository) requireRole(req, ['ADMIN', 'OPERATOR'])
    const { title, description, budgetLimit } = (req.body ?? {}) as any
    const actor = repository ? (req.user as { sub: string }).sub : undefined
    if (typeof title !== 'string' || title.trim().length < 3 || typeof description !== 'string' || description.trim().length < 3 || (budgetLimit !== undefined && (!Number.isFinite(Number(budgetLimit)) || Number(budgetLimit) < 0))) {
      return reply.code(400).send(err('VALIDATION_ERROR', 'title y description son requeridos'))
    }
    // Validation used Number(); propagate that same numeric value rather than the raw (possibly string) input.
    const budget = budgetLimit === undefined ? 50000 : Number(budgetLimit)
    const fingerprint = createHash('sha256').update(JSON.stringify({ title, description, budgetLimit: budget })).digest('hex')
    const idempotencyKey = req.headers['idempotency-key']
    if (typeof idempotencyKey === 'string' && repository) {
      const prior = repository.getIdempotent(JSON.stringify([actor, idempotencyKey]), fingerprint)
      if (prior) return { ...ok(prior), auditRecords: [], nearTxs: [], meta: { ...ok(prior).meta, idempotentReplay: true } }
    }
    const mission      = await hades.createMission(title.trim(), description.trim(), budget, actor)
    const auditRecords = audit.query({})
    const nearTxs      = near.getAllTransactions()
    if (repository) {
      await repository.saveMission(mission, typeof idempotencyKey === 'string' ? { key: JSON.stringify([actor, idempotencyKey]), fingerprint } : undefined)
      await repository.recordMissionEvidence(auditRecords, (req.user as { sub?: string }).sub ?? 'unknown')
    }
    const isAdmin = !repository || (req.user as { roles: string[] }).roles.includes('ADMIN')
    return { ...ok(mission), auditRecords: isAdmin ? auditRecords : [], nearTxs: isAdmin ? nearTxs : [] }
  })

  app.post('/missions/plan', async (req, reply) => {
    if (repository) requireRole(req, ['ADMIN', 'OPERATOR'])
    const { title, description, context } = (req.body ?? {}) as any
    if (typeof title !== 'string' || title.trim().length < 3 || typeof description !== 'string' || description.trim().length < 3) {
      return reply.code(400).send(err('VALIDATION_ERROR', 'title y description son requeridos para la planificación'))
    }
    const planResult = await missionPlanner.plan({
      title: title.trim(),
      description: description.trim(),
      context: (typeof context === 'object' && context !== null ? context : {
        organizationId: 'default',
        budgetLimit: 100000,
        currency: 'MXN',
        deadline: null,
        priority: 'MEDIUM',
        tags: [],
      }) as any,
    })
    return ok(planResult)
  })

  app.get('/missions', async (req) => {
    const missions = repository ? repository.listMissions() : hades.getAllMissions()
    return ok(repository ? missions.filter(mission => canRead(req.user, mission)) : missions)
  })

  app.get('/missions/:id', async (req, reply) => {
    const { id } = req.params as any
    const mission = repository ? repository.getMission(id) : hades.getMission(id)
    if (!mission || (repository && !canRead(req.user, mission))) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
    return ok(mission)
  })

  app.get('/missions/:id/tasks', async (req, reply) => {
    const { id } = req.params as any
    const mission = repository ? repository.getMission(id) : hades.getMission(id)
    if (!mission || (repository && !canRead(req.user, mission))) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
    return ok(mission.tasks)
  })

  app.get('/missions/:id/report', async (req, reply) => {
    const { id } = req.params as any
    const mission = repository ? repository.getMission(id) : hades.getMission(id)
    if (!mission || (repository && !canRead(req.user, mission))) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
    if (!mission.report) return reply.code(404).send(err('REPORT_NOT_READY', 'El informe aún no está disponible'))
    return ok(mission.report)
  })
}

function ok<T>(data: T) {
  return { success: true, data, error: null, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function err(code: string, message: string) {
  return { success: false, data: null, error: { code, message }, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function genId(): string { return Math.random().toString(36).slice(2) }

function canRead(user: unknown, mission: { ownerId?: string }): boolean {
  const claims = user as { sub: string; roles: string[] }
  return claims.roles.includes('ADMIN') || (!!mission.ownerId && mission.ownerId === claims.sub)
}
