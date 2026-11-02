import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireRole } from '../security.js'
import type { SqliteRepository } from '../sqlite.js'
import { NearSubmitError, type NearSubmissionService } from '../near/submission.js'

const STATUS: Partial<Record<string, number>> = {
  NOT_FOUND: 404, INVALID_STATE: 409, DUPLICATE_SUBMISSION: 409, ALREADY_RECORDED: 409,
  SIGNING_DISABLED: 503, NO_SIGNER: 503, NO_CONTRACT_CONFIGURED: 503, RPC_ERROR: 502,
}
const store = (code: string): number => (code === 'EMERGENCY_STOP' ? 423 : 409)

function fail(reply: FastifyReply, e: unknown): FastifyReply {
  if (e instanceof NearSubmitError) return reply.code(STATUS[e.code] ?? 422).send({ success: false, data: null, error: { code: e.code, message: e.message } })
  const m = (e as Error).message ?? ''
  const code = m.split(':')[0]!
  if (/^(EMERGENCY_STOP|APPROVAL_EXPIRED|INTENT_CHANGED|POLICY_DENIED|INVALID_STATE)$/.test(code)) return reply.code(store(code)).send({ success: false, data: null, error: { code, message: m } })
  throw e
}
const ok = <T>(data: T) => ({ success: true, data, error: null })

/** Transaction preparation review, submission and follow-up. Every route is ADMIN-only; secrets are never returned. */
export async function nearTxRoutes(app: FastifyInstance, repository: SqliteRepository, service: NearSubmissionService): Promise<void> {
  app.addHook('preHandler', async req => requireRole(req, ['ADMIN']))
  const actor = (req: { user?: unknown }): string => (req.user as { sub: string }).sub
  const id = (req: { params: unknown }): string => (req.params as { id: string }).id

  app.get('/near/config', async () => ok(service.status()))
  app.get('/near/intents', async () => ok(repository.getNearIntentStore().list(50)))
  app.get('/near/submissions', async () => ok(service.list(50)))
  app.get('/near/submissions/:id', async (req, reply) => { try { return ok(service.get(id(req))) } catch (e) { return fail(reply, e) } })
  app.post('/near/intents/:id/submit', async (req, reply) => { try { return ok(await service.submit(id(req), actor(req))) } catch (e) { return fail(reply, e) } })
  app.post('/near/submissions/:id/refresh', async (req, reply) => { try { return ok(await service.refresh(id(req), actor(req))) } catch (e) { return fail(reply, e) } })
  app.post('/near/submissions/:id/reconcile', async (req, reply) => { try { return ok(await service.reconcile(id(req), actor(req))) } catch (e) { return fail(reply, e) } })
}
