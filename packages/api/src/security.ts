import type { FastifyInstance, FastifyRequest } from 'fastify'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import type { Role } from './persistence.js'
import type { SqliteRepository } from './sqlite.js'
import { resolveDemoSession } from './demo.js'

export async function registerSecurity(app: FastifyInstance, repository?: SqliteRepository): Promise<void> {
  const secret = process.env['JWT_SECRET']
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters')
  await app.register(jwt, { secret })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  // onRequest: authentication and DEMO default-deny run before body parsing/schema validation.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!
    if (!request.url.startsWith('/api/v1') || path === '/api/v1/auth/login' || path === '/api/v1/setup/init' || path === '/api/v1/auth/recover' || path === '/api/v1/demo/session') return
    try {
      const claims = await request.jwtVerify<{ sub?: unknown; roles?: unknown; exp?: unknown; sid?: unknown }>()
      if (typeof claims.sub !== 'string' || !claims.sub.trim() || !Array.isArray(claims.roles) || !claims.roles.some(r => ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER', 'DEMO'].includes(r)) || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000) throw new Error('Invalid claims')
      if (repository) {
        if (typeof claims.sid !== 'string') throw new Error('Invalid session')
        const session = repository.getActiveSession(claims.sid) ?? resolveDemoSession(claims.sid)
        if (!session || session.sub !== claims.sub) throw new Error('Invalid session')
        // Roles always come from the server-side session, never from the token.
        request.user = { ...claims, ...session }
        // DEMO sessions are default-deny: only /api/v1/demo/* and logout are reachable.
        if (session.roles.includes('DEMO') && !(path.startsWith('/api/v1/demo/') || path === '/api/v1/auth/logout')) return reply.code(403).send({ success: false, error: { code: 'DEMO_FORBIDDEN' } })
      }
    } catch { return reply.code(401).send({ success: false, error: { code: 'UNAUTHENTICATED' } }) }
  })
}
export function requireRole(request: FastifyRequest, roles: Role[]): void {
  const claims = request.user as { roles?: Role[] }
  if (!claims.roles?.some(role => roles.includes(role))) throw Object.assign(new Error('FORBIDDEN'), { statusCode: 403 })
}
