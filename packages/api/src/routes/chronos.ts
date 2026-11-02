import type { FastifyInstance, FastifyReply } from 'fastify'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { SqliteRepository } from '../sqlite.js'
import { requireRole } from '../security.js'
import { ChronosError, JOB_REGISTRY } from '../chronos/chronos.js'

const STATUS: Record<ChronosError['code'], number> = { VALIDATION_ERROR: 400, UNREGISTERED_JOB_KIND: 403, NOT_FOUND: 404, INVALID_STATE: 409 }

function fail(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ChronosError) return reply.code(STATUS[error.code]).send({ success: false, error: { code: error.code, message: error.message } })
  throw error
}

/**
 * Externally triggered scheduler pass for hosts that sleep or are serverless. Outside /api/v1 so it uses its own
 * shared-secret auth rather than user sessions. Not registered at all unless the secret is at least 32 characters.
 */
export function registerChronosTick(app: FastifyInstance, repository: SqliteRepository, secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return false
  const expected = Buffer.from(secret)
  const handler = async (req: { headers: Record<string, unknown> }, reply: FastifyReply) => {
    const header = req.headers['authorization']
    const supplied = Buffer.from(typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '')
    // Hash both sides so the comparison is constant-time regardless of the supplied length.
    const a = createHash('sha256').update(supplied).digest(), b = createHash('sha256').update(expected).digest()
    if (!timingSafeEqual(a, b)) return reply.code(401).send({ success: false, error: { code: 'UNAUTHENTICATED' } })
    const { started, retried, executed } = repository.chronos.tick()
    return { success: true, data: { started, retried, runs: executed.map(r => ({ id: r.id, taskId: r.taskId, status: r.status })) } }
  }
  app.post('/internal/chronos/tick', handler)
  app.get('/internal/chronos/tick', handler)
  return true
}

export async function chronosRoutes(app: FastifyInstance, repository: SqliteRepository): Promise<void> {
  const actorOf = (req: { user?: unknown }): string => (req.user as { sub?: string } | undefined)?.sub ?? 'unknown'
  const chronos = repository.chronos

  app.get('/chronos/job-kinds', async req => {
    requireRole(req, ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'])
    return { success: true, data: Object.entries(JOB_REGISTRY).map(([kind, j]) => ({ kind, description: j.description, effect: j.effect, agent: j.agent })) }
  })
  app.get('/chronos/tasks', async req => { requireRole(req, ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER']); return { success: true, data: chronos.list() } })
  app.get('/chronos/runs', async req => {
    requireRole(req, ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'])
    const q = req.query as { taskId?: string; limit?: string }
    const limit = Math.min(Math.max(Number(q.limit ?? 50) || 50, 1), 200)
    return { success: true, data: chronos.runs(q.taskId, limit) }
  })
  app.post('/chronos/tasks', async (req, reply) => {
    requireRole(req, ['ADMIN', 'OPERATOR'])
    try { return reply.code(201).send({ success: true, data: chronos.create((req.body ?? {}) as Record<string, unknown>, actorOf(req)) }) } catch (e) { return fail(reply, e) }
  })
  for (const action of ['pause', 'resume', 'cancel'] as const) {
    app.post(`/chronos/tasks/:id/${action}`, async (req, reply) => {
      requireRole(req, ['ADMIN', 'OPERATOR'])
      try { return { success: true, data: chronos[action]((req.params as { id: string }).id, actorOf(req)) } } catch (e) { return fail(reply, e) }
    })
  }
  app.post('/chronos/tasks/:id/run', async (req, reply) => {
    requireRole(req, ['ADMIN', 'OPERATOR'])
    try { return { success: true, data: chronos.runNow((req.params as { id: string }).id, actorOf(req)) } } catch (e) { return fail(reply, e) }
  })
}
