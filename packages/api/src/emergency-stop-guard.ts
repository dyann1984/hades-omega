import type { FastifyInstance } from 'fastify'

/**
 * Routes that start new work or let held work proceed. While the CERBERUS emergency stop is active they answer 423
 * before any handler runs. Everything that only reads, rejects, cancels, or clears the stop stays reachable.
 */
const LAUNCH_ROUTES: readonly RegExp[] = [
  /^\/api\/v1\/missions$/,
  /^\/api\/v1\/local-missions(?:\/multi-document)?$/,
  /^\/api\/v1\/audit-flow\/[^/]+\/(?:evidence|followup|near-audit)$/,
]
/** Decision routes: only an APPROVED decision is blocked, so operators can still reject while stopped. */
const APPROVAL_ROUTES: readonly RegExp[] = [
  /^\/api\/v1\/local-approvals\/[^/]+\/decision$/,
  /^\/api\/v1\/approvals\/[^/]+\/decision$/,
]

export function isBlockedDuringStop(method: string, url: string, body: unknown): boolean {
  if (method !== 'POST') return false
  const path = url.split('?')[0] ?? ''
  if (LAUNCH_ROUTES.some(r => r.test(path))) return true
  return APPROVAL_ROUTES.some(r => r.test(path)) && (body as { status?: unknown } | undefined)?.status === 'APPROVED'
}

/** Must be registered on the root instance before the API routes so the hook is inherited by them. */
export function registerEmergencyStopGuard(app: FastifyInstance, isStopped: () => boolean): void {
  app.addHook('preHandler', async (req, reply) => {
    if (!isBlockedDuringStop(req.method, req.url, req.body) || !isStopped()) return
    return reply.code(423).send({ success: false, data: null, error: { code: 'EMERGENCY_STOP', message: 'Parada de emergencia activa: las operaciones nuevas están suspendidas.' } })
  })
}
