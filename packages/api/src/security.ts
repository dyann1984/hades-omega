import type { FastifyInstance, FastifyRequest } from 'fastify'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import type { Role } from './persistence.js'
import type { SqliteRepository } from './sqlite.js'

export async function registerSecurity(app: FastifyInstance, repository?: SqliteRepository): Promise<void> {
  const secret = process.env['JWT_SECRET']
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters')
  await app.register(jwt, { secret })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/v1') || request.url.split('?')[0] === '/api/v1/auth/login') return
    try {
      const claims = await request.jwtVerify<{ sub?: unknown; roles?: unknown; exp?: unknown; sid?: unknown }>()
      if (typeof claims.sub !== 'string' || !claims.sub.trim() || !Array.isArray(claims.roles) || !claims.roles.some(r => ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'].includes(r)) || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000) throw new Error('Invalid claims')
      if (repository) {
        if (typeof claims.sid !== 'string') throw new Error('Invalid session')
        const session = repository.getActiveSession(claims.sid)
        if (!session || session.sub !== claims.sub) throw new Error('Invalid session')
        request.user = { ...claims, ...session }
      }
    } catch { return reply.code(401).send({ success: false, error: { code: 'UNAUTHENTICATED' } }) }
  })
}
export function requireRole(request: FastifyRequest, roles: Role[]): void {
  const claims = request.user as { roles?: Role[] }
  if (!claims.roles?.some(role => roles.includes(role))) throw Object.assign(new Error('FORBIDDEN'), { statusCode: 403 })
}
