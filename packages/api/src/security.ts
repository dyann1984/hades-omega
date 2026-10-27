import type { FastifyInstance, FastifyRequest } from 'fastify'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import type { Role } from './persistence.js'

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  const secret = process.env['JWT_SECRET']
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters')
  await app.register(jwt, { secret })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/v1')) return
    try {
      const claims = await request.jwtVerify<{ sub?: unknown; roles?: unknown; exp?: unknown }>()
      if (typeof claims.sub !== 'string' || !claims.sub.trim() || !Array.isArray(claims.roles) || !claims.roles.some(r => ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'].includes(r)) || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000) throw new Error('Invalid claims')
    } catch { return reply.code(401).send({ success: false, error: { code: 'UNAUTHENTICATED' } }) }
  })
}
export function requireRole(request: FastifyRequest, roles: Role[]): void {
  const claims = request.user as { roles?: Role[] }
  if (!claims.roles?.some(role => roles.includes(role))) throw Object.assign(new Error('FORBIDDEN'), { statusCode: 403 })
}
