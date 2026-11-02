import type { FastifyInstance } from 'fastify'
import { requireRole } from '../security.js'
import type { SqliteRepository } from '../sqlite.js'
import type { NearSubmissionService } from '../near/submission.js'
import { buildVaultStatus } from '../vault.js'
import { getConnectedClientsCount } from '../websocket.js'
import { LlmPolicyError } from '../llm-governor.js'

const ok = <T>(data: T) => ({ success: true, data, error: null })
const fail = (code: string, message: string) => ({ success: false, data: null, error: { code, message } })

/** Backend-derived integration status for the Vault page. ADMIN-only; secrets are reported as configured/not configured. */
export async function vaultRoutes(app: FastifyInstance, repository: SqliteRepository, near: NearSubmissionService): Promise<void> {
  app.addHook('preHandler', async req => requireRole(req, ['ADMIN']))
  const actorOf = (req: { user?: unknown }): string => (req.user as { sub: string }).sub
  app.get('/vault/status', async () => ok(buildVaultStatus({ repository, near, wsClients: getConnectedClientsCount })))

  // Read-only network check; separate from /status so opening the page never depends on an external RPC.
  // Even this read goes through CERBERUS (registered READ tool near.probe), so it is decided and audited like every other action.
  app.post('/vault/near/probe', async (req, reply) => {
    const verdict = repository.gate.authorize({ tool: 'near.probe', agent: 'HADES', role: 'ADMIN', source: 'API', params: {}, actor: actorOf(req) })
    if (verdict.outcome !== 'PERMIT') return reply.code(403).send(fail('CERBERUS_DENIED', `CERBERUS no autorizó la sonda (${verdict.code}).`))
    return ok(await near.probe())
  })

  // Administrator-only egress policy for the LLM provider. Disabled by default; every change is audited.
  app.get('/vault/llm-policy', async () => ok({ policy: repository.llmPolicy.get(), usageToday: repository.llmPolicy.usageToday() }))
  app.post('/vault/llm-policy', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    try {
      const policy = repository.llmPolicy.update(body as never, actorOf(req), repository.gate.isStopped())
      repository.recordAuditEvent({ actor: actorOf(req), action: 'LLM_POLICY_CHANGED', result: Object.keys(body).sort().map(k => `${k}=${String(body[k])}`).join(',').slice(0, 200) })
      return ok({ policy, usageToday: repository.llmPolicy.usageToday() })
    } catch (e) {
      if (e instanceof LlmPolicyError) return reply.code(e.code === 'EMERGENCY_STOP' ? 409 : 400).send(fail(e.code, e.message))
      throw e
    }
  })
}
