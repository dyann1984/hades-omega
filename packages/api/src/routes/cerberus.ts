import type { FastifyInstance } from 'fastify'
import { requireRole } from '../security.js'
import { guard, audit, near } from '../runtime.js'
import type { AuditFilter, GUARDOutcome, AgentName } from '@hades/core'

export async function cerberusRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async req => requireRole(req, ['ADMIN']))
  app.get('/cerberus/status', async () => {
    return ok({
      active:          true,
      policyVersion:   guard.getPolicyVersion(),
      policyHash:      guard.getPolicyHash().slice(0, 16) + '...',
      evaluationCount: guard.getEvaluationCount(),
      auditRecords:    audit.getTotalCount(),
      near:            near.getStatus(),
    })
  })

  app.get('/cerberus/audit', async (req) => {
    const q = req.query as Record<string, string>
    const filter: AuditFilter = {
      agentName:     q.agentName     as AgentName | undefined,
      operationType: q.operationType as string    | undefined,
      outcome:       q.outcome       as GUARDOutcome | undefined,
      limit:         q.limit  ? Math.min(Number(q.limit), 500) : 50,
      offset:        q.offset ? Number(q.offset) : 0,
    }
    return ok(audit.query(filter))
  })

  app.get('/cerberus/audit/stats', async (req) => {
    const q = req.query as Record<string, string>
    return ok(audit.getStats(
      q.from ? Number(q.from) : undefined,
      q.to   ? Number(q.to)   : undefined,
    ))
  })

  app.get('/cerberus/audit/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const record = audit.getRecord(id)
    if (!record) return reply.code(404).send(err('AUDIT_NOT_FOUND', `Registro ${id} no encontrado`))
    return ok(record)
  })

  app.get('/cerberus/policy', async () => {
    const policy = guard.getPolicy()
    return ok({
      version:      policy.version,
      hash:         policy.hash.slice(0, 16) + '...',
      rulesActive:  policy.rules.filter(r => r.active).length,
      rulesTotal:   policy.rules.length,
      rules:        policy.rules.map(r => ({
        id:          r.id,
        name:        r.name,
        outcome:     r.outcome,
        active:      r.active,
        priority:    r.priority,
      })),
    })
  })

  app.get('/near/status', async () => {
    return ok(near.getStatus())
  })

  app.get('/near/transactions', async () => {
    return ok(near.getAllTransactions())
  })
}

function ok<T>(data: T) {
  return { success: true, data, error: null, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function err(code: string, message: string) {
  return { success: false, data: null, error: { code, message }, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function genId(): string { return Math.random().toString(36).slice(2) }
