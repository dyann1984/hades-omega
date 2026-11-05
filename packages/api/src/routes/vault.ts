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
  const secrets = repository.createSecretVault(process.env['HADES_VAULT_MASTER_KEY'])
  const vaultError = (e: unknown, reply: any) => {
    const code = e instanceof Error ? e.message : ''
    if (['VAULT_NOT_CONFIGURED', 'VAULT_AUTHENTICATION_FAILED', 'VAULT_NAME_INVALID', 'VAULT_VALUE_INVALID'].includes(code)) return reply.code(code === 'VAULT_NOT_CONFIGURED' ? 503 : code === 'VAULT_AUTHENTICATION_FAILED' ? 503 : 400).send(fail(code, 'No se pudo completar la operación de Vault.'))
    throw e
  }
  app.get('/vault/secrets', async (_req, reply) => { try { return ok({ configured: secrets.configured, secrets: secrets.list() }) } catch (e) { return vaultError(e, reply) } })
  app.put('/vault/secrets/:name', { bodyLimit: 20000 }, async (req, reply) => {
    try {
      if (repository.gate.isStopped()) return reply.code(409).send(fail('EMERGENCY_STOP', 'Parada de emergencia activa.'))
      const body = req.body as { value?: unknown } | null
      if (!body || typeof body.value !== 'string' || Object.keys(body).some(k => k !== 'value')) throw new Error('VAULT_VALUE_INVALID')
      secrets.put((req.params as { name: string }).name, body.value, actorOf(req))
      return ok({ stored: true })
    } catch (e) { return vaultError(e, reply) }
  })
  app.delete('/vault/secrets/:name', async (req, reply) => {
    try {
      if (repository.gate.isStopped()) return reply.code(409).send(fail('EMERGENCY_STOP', 'Parada de emergencia activa.'))
      return ok({ deleted: secrets.delete((req.params as { name: string }).name, actorOf(req)) })
    } catch (e) { return vaultError(e, reply) }
  })
  app.get('/vault/status', async (_req, reply) => {
    try {
      const llmKeyConfigured = process.env['HADES_LLM_KEY_SOURCE'] === 'vault' ? secrets.list().some(s => s.name === 'ANTHROPIC_API_KEY') : undefined
      return ok(buildVaultStatus({ repository, near, wsClients: getConnectedClientsCount, llmKeyConfigured }))
    } catch (e) { return vaultError(e, reply) }
  })

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
