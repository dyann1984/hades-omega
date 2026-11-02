import type { FastifyInstance } from 'fastify'
import { requireRole } from '../security.js'
import type { SqliteRepository } from '../sqlite.js'
import type { NearSubmissionService } from '../near/submission.js'
import { buildVaultStatus } from '../vault.js'
import { getConnectedClientsCount } from '../websocket.js'

const ok = <T>(data: T) => ({ success: true, data, error: null })

/** Backend-derived integration status for the Vault page. ADMIN-only; secrets are reported as configured/not configured. */
export async function vaultRoutes(app: FastifyInstance, repository: SqliteRepository, near: NearSubmissionService): Promise<void> {
  app.addHook('preHandler', async req => requireRole(req, ['ADMIN']))
  app.get('/vault/status', async () => ok(buildVaultStatus({ repository, near, wsClients: getConnectedClientsCount })))
  // Read-only network check; separate from /status so opening the page never depends on an external RPC.
  app.post('/vault/near/probe', async () => ok(await near.probe()))
}
