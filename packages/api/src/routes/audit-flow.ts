import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireRole } from '../security.js'
import type { SqliteRepository } from '../sqlite.js'
import { AuditFlowError, type AuditFlowService } from '../audit-flow.js'
import { ChronosError } from '../chronos/chronos.js'

const ok = <T>(data: T) => ({ success: true, data, error: null })
const STATUS: Record<AuditFlowError['code'], number> = { NOT_FOUND: 404, NOT_COMPLETED: 409, NO_EVIDENCE: 409, ALREADY_PREPARED: 409 }

/** Audit-flow routes over persisted missions. Reads follow mission ownership; the three actions need ADMIN or OPERATOR. */
export async function auditFlowRoutes(app: FastifyInstance, repository: SqliteRepository, flow: AuditFlowService): Promise<void> {
  const claims = (req: { user?: unknown }) => req.user as { sub: string; roles: string[] }
  const visible = (req: { user?: unknown; params: unknown }): boolean => {
    const m = repository.getMission((req.params as { id: string }).id), c = claims(req)
    return !!m && (c.roles.includes('ADMIN') || (!!m.ownerId && m.ownerId === c.sub))
  }
  const fail = (reply: FastifyReply, e: unknown): FastifyReply => {
    if (e instanceof AuditFlowError) return reply.code(STATUS[e.code]).send({ success: false, data: null, error: { code: e.code, message: e.message } })
    if (e instanceof ChronosError) return reply.code(422).send({ success: false, data: null, error: { code: e.code, message: e.message } })
    throw e
  }
  const hide = (reply: FastifyReply): FastifyReply => reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'mission not found' } })

  app.get('/audit-flow/:id', async (req, reply) => {
    if (!visible(req)) return hide(reply)
    try { return ok(flow.view((req.params as { id: string }).id)) } catch (e) { return fail(reply, e) }
  })
  for (const [path, run] of [
    ['evidence', (id: string, actor: string) => flow.recordEvidence(id, actor)],
    ['followup', (id: string, actor: string) => flow.scheduleFollowUp(id, actor)],
    ['near-audit', (id: string, actor: string) => flow.prepareNearAudit(id, actor)],
  ] as const) {
    app.post(`/audit-flow/:id/${path}`, async (req, reply) => {
      requireRole(req, ['ADMIN', 'OPERATOR'])
      if (!visible(req)) return hide(reply)
      try { return ok(run((req.params as { id: string }).id, claims(req).sub)) } catch (e) { return fail(reply, e) }
    })
  }
}
