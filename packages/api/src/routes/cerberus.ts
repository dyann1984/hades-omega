import type { FastifyInstance } from 'fastify'
import { requireRole } from '../security.js'
import { guard, audit, near } from '../runtime.js'
import type { AuditFilter, GUARDOutcome, AgentName } from '@hades/core'
import type { SqliteRepository } from '../sqlite.js'
import { readTestnetAccount } from '../near-testnet.js'
import { GateError } from '../cerberus-gate.js'

export async function cerberusRoutes(app: FastifyInstance, repository?: SqliteRepository): Promise<void> {
  app.addHook('preHandler', async req => requireRole(req, ['ADMIN']))
  app.get('/audit/events', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('AUDIT_UNAVAILABLE', 'Auditoría persistente no disponible'))
    const q=req.query as {action?:string;missionId?:string;limit?:string;offset?:string}
    const limit=q.limit === undefined ? 50 : Number(q.limit), offset=q.offset === undefined ? 0 : Number(q.offset)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000 || (q.action !== undefined && !/^[A-Z_]{1,64}$/.test(q.action)) || (q.missionId !== undefined && !/^[a-zA-Z0-9-]{1,100}$/.test(q.missionId))) return reply.code(400).send(err('VALIDATION_ERROR','Filtro inválido'))
    return ok(repository.listAuditEvents({action:q.action,missionId:q.missionId,limit,offset}))
  })
  app.get('/audit/integrity', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('AUDIT_UNAVAILABLE', 'Auditoría persistente no disponible'))
    const check = repository.verifyAuditIntegrity()
    return ok(check)
  })
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

  app.get('/near/testnet/account/:accountId', async (req, reply) => {
    const { accountId } = req.params as { accountId: string }
    if (repository) {
      const verdict = repository.gate.authorize({ tool: 'near.account_view', agent: 'HADES', role: 'ADMIN', source: 'API', params: { accountId }, actor: (req.user as { sub: string }).sub })
      if (verdict.outcome !== 'PERMIT') return reply.code(verdict.code === 'INVALID_PARAMS' ? 400 : 403).send(err(verdict.code === 'INVALID_PARAMS' ? 'INVALID_TESTNET_ACCOUNT' : 'CERBERUS_DENIED', verdict.reason))
    }
    try { return ok(await readTestnetAccount(accountId)) }
    catch (error) {
      if ((error as Error).message === 'INVALID_TESTNET_ACCOUNT') return reply.code(400).send(err('INVALID_TESTNET_ACCOUNT', 'Cuenta testnet inválida'))
      return reply.code(502).send(err('NEAR_RPC_UNAVAILABLE', 'No se pudo verificar la cuenta en testnet'))
    }
  })

  app.get('/near/transactions', async () => {
    return ok(near.getAllTransactions())
  })

  // Preparation only: this interface has no signing or broadcast route.
  app.post('/near/intents', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
    try { return reply.code(201).send(ok(repository.getNearIntentStore().create(req.body, (req.user as {sub:string}).sub))) }
    catch { return reply.code(400).send(err('INVALID_INTENT', 'Parámetros testnet inválidos')) }
  })
  app.get('/near/intents/:id', async (req, reply) => {
    const intent=repository?.getNearIntentStore().get((req.params as {id:string}).id)
    return intent ? ok(intent) : reply.code(404).send(err('INTENT_NOT_FOUND', 'Operación no encontrada'))
  })
  app.post('/near/intents/:id/request-approval', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
    try { return ok(repository.getNearIntentStore().requestApproval((req.params as {id:string}).id,(req.user as {sub:string}).sub)) }
    catch { return reply.code(409).send(err('INTENT_NOT_READY', 'La operación no puede solicitar aprobación')) }
  })
  app.post('/near/intents/:id/approve', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
    const body=req.body as {hash?:unknown;expiresAt?:unknown} | undefined
    if (typeof body?.hash!=='string' || typeof body.expiresAt!=='number') return reply.code(400).send(err('VALIDATION_ERROR','Hash y expiración requeridos'))
    try { return ok(repository.getNearIntentStore().approve((req.params as {id:string}).id,body.hash,(req.user as {sub:string}).sub,body.expiresAt)) }
    catch { return reply.code(409).send(err('APPROVAL_REJECTED', 'La aprobación no es válida o la operación cambió')) }
  })
  app.post('/near/intents/:id/resolve', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
    const body=req.body as {outcome?:unknown} | undefined
    if (body?.outcome!=='REJECTED' && body?.outcome!=='CANCELLED') return reply.code(400).send(err('VALIDATION_ERROR','Decisión inválida'))
    try { return ok(repository.getNearIntentStore().resolve((req.params as {id:string}).id,body.outcome,(req.user as {sub:string}).sub)) }
    catch { return reply.code(409).send(err('INVALID_STATE', 'No se puede resolver la operación en su estado actual')) }
  })
  // One persistent switch for every sensitive action (NEAR, financial, external). Reads keep working.
  const emergencyStop = async (req: { body?: unknown; user?: unknown }, reply: { code(n: number): { send(b: unknown): unknown } }) => {
    if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
    const body=req.body as {stopped?:unknown} | undefined
    if (typeof body?.stopped!=='boolean') return reply.code(400).send(err('VALIDATION_ERROR','Estado requerido'))
    repository.getNearIntentStore().setEmergency(body.stopped,(req.user as {sub:string}).sub)
    return ok({stopped:body.stopped})
  }
  app.post('/near/emergency-stop', emergencyStop)
  app.post('/cerberus/emergency-stop', emergencyStop)
  app.get('/cerberus/emergency-stop', async (_req, reply) => repository ? ok({ stopped: repository.gate.isStopped() }) : reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible')))

  // Authorization gate administration.
  app.get('/cerberus/gate/tools', async (_req, reply) => repository ? ok(repository.gate.listTools()) : reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible')))
  app.get('/cerberus/gate/decisions', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
    const limit = Math.min(Math.max(Number((req.query as { limit?: string }).limit ?? 50) || 50, 1), 200)
    return ok(repository.gate.listDecisions(limit))
  })
  app.get('/cerberus/gate/approvals', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
    const status = (req.query as { status?: string }).status
    return ok(repository.gate.listApprovals(status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : undefined))
  })
  app.post('/cerberus/gate/approvals/:id/decision', async (req, reply) => {
    if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
    const b = req.body as { status?: unknown; justification?: unknown; ttlMs?: unknown } | undefined
    if ((b?.status !== 'APPROVED' && b?.status !== 'REJECTED') || typeof b.justification !== 'string') return reply.code(400).send(err('VALIDATION_ERROR', 'status y justificación requeridos'))
    try {
      repository.gate.decide((req.params as { id: string }).id, b.status, (req.user as { sub: string }).sub, b.justification, typeof b.ttlMs === 'number' ? b.ttlMs : undefined)
      return ok({ decided: b.status, warning: 'La aprobación autoriza una única ejecución con estos parámetros exactos; no ejecuta nada por sí misma.' })
    } catch (e) {
      if (e instanceof GateError) return reply.code(e.code === 'APPROVAL_NOT_FOUND' ? 404 : 409).send(err(e.code, e.message))
      throw e
    }
  })
  app.get('/cerberus/gate/recipients', async (req, reply) => repository ? ok(repository.gate.listRecipients((req.query as { tool?: string }).tool)) : reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible')))
  for (const action of ['add', 'remove'] as const) {
    app.post(`/cerberus/gate/recipients/${action}`, async (req, reply) => {
      if (!repository) return reply.code(503).send(err('STORAGE_UNAVAILABLE', 'Almacenamiento no disponible'))
      const b = req.body as { tool?: unknown; recipient?: unknown } | undefined
      if (typeof b?.tool !== 'string' || typeof b.recipient !== 'string') return reply.code(400).send(err('VALIDATION_ERROR', 'tool y recipient requeridos'))
      try {
        const actor = (req.user as { sub: string }).sub
        if (action === 'add') repository.gate.addRecipient(b.tool, b.recipient, actor); else repository.gate.removeRecipient(b.tool, b.recipient, actor)
        return ok({ tool: b.tool, recipient: b.recipient, action })
      } catch (e) {
        if (e instanceof GateError) return reply.code(400).send(err(e.code, e.message))
        throw e
      }
    })
  }
}

function ok<T>(data: T) {
  return { success: true, data, error: null, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function err(code: string, message: string) {
  return { success: false, data: null, error: { code, message }, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function genId(): string { return Math.random().toString(36).slice(2) }
