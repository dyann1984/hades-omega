import type { FastifyInstance, FastifyReply } from 'fastify'
import type { SqliteRepository } from '../sqlite.js'
import { requireRole } from '../security.js'
import { ChronosError, JOB_REGISTRY } from '../chronos/chronos.js'

const STATUS: Record<ChronosError['code'], number> = { VALIDATION_ERROR: 400, UNREGISTERED_JOB_KIND: 403, NOT_FOUND: 404, INVALID_STATE: 409 }

function fail(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ChronosError) return reply.code(STATUS[error.code]).send({ success: false, error: { code: error.code, message: error.message } })
  throw error
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
