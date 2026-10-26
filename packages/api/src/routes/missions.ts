import type { FastifyInstance } from 'fastify'
import { hades, audit, near } from '../runtime.js'
import type { JsonRepository } from '../persistence.js'
import { requireRole } from '../security.js'
import { createHash } from 'node:crypto'

export async function missionRoutes(app: FastifyInstance, repository?: JsonRepository): Promise<void> {
  app.post('/missions', async (req, reply) => {
    // Standalone route tests omit persistence; production always passes the repository.
    if (repository) requireRole(req, ['ADMIN', 'OPERATOR'])
    const { title, description, budgetLimit } = req.body as any
    if (typeof title !== 'string' || title.trim().length < 3 || typeof description !== 'string' || description.trim().length < 3 || (budgetLimit !== undefined && (!Number.isFinite(Number(budgetLimit)) || Number(budgetLimit) < 0))) {
      return reply.code(400).send(err('VALIDATION_ERROR', 'title y description son requeridos'))
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({ title, description, budgetLimit: budgetLimit ?? 50000 })).digest('hex')
    const idempotencyKey = req.headers['idempotency-key']
    if (typeof idempotencyKey === 'string' && repository) {
      const prior = repository.getIdempotent(idempotencyKey, fingerprint)
      if (prior) return { ...ok(prior), auditRecords: [], nearTxs: [], meta: { ...ok(prior).meta, idempotentReplay: true } }
    }
    const mission      = await hades.createMission(title.trim(), description.trim(), budgetLimit ?? 50000)
    const auditRecords = audit.query({})
    const nearTxs      = near.getAllTransactions()
    if (repository) {
      await repository.saveMission(mission, typeof idempotencyKey === 'string' ? { key: idempotencyKey, fingerprint } : undefined)
      await repository.recordMissionEvidence(auditRecords, (req.user as { sub?: string }).sub ?? 'unknown')
    }
    return { ...ok(mission), auditRecords, nearTxs }
  })

  app.get('/missions', async () => {
    return ok(repository ? repository.listMissions() : hades.getAllMissions())
  })

  app.get('/missions/:id', async (req, reply) => {
    const { id } = req.params as any
    const mission = repository?.getMission(id) ?? hades.getMission(id)
    if (!mission) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
    return ok(mission)
  })

  app.get('/missions/:id/tasks', async (req, reply) => {
    const { id } = req.params as any
    const mission = repository?.getMission(id) ?? hades.getMission(id)
    if (!mission) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
    return ok(mission.tasks)
  })

  app.get('/missions/:id/report', async (req, reply) => {
    const { id } = req.params as any
    const mission = repository?.getMission(id) ?? hades.getMission(id)
    if (!mission) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
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
