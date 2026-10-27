import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { SqliteRepository } from './sqlite.js'
import { hashPassword } from './password.js'

const SETUP_META_KEY = 'setup_token'
const TOKEN_TTL_MS = 60 * 60 * 1000

/**
 * If the DB has no users, generate a one-time setup token, store it in metadata,
 * and return it to be printed to the operator console.
 * Returns null if users already exist (setup already complete).
 */
export function generateSetupToken(repo: SqliteRepository): string | null {
  if (repo.hasUsers()) return null
  const existing = repo.getMeta(SETUP_META_KEY)
  if (existing) {
    try {
      const { token, expiresAt } = JSON.parse(existing) as { token: string; expiresAt: number }
      if (Date.now() < expiresAt) return token
    } catch {}
  }
  const token = randomBytes(32).toString('hex')
  repo.setMeta(SETUP_META_KEY, JSON.stringify({ token, expiresAt: Date.now() + TOKEN_TTL_MS }))
  return token
}

export async function setupRoutes(app: FastifyInstance, repo: SqliteRepository): Promise<void> {
  app.post('/api/v1/setup/init',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const headers = request.headers as Record<string, string | string[] | undefined>
      const providedToken = typeof headers['x-setup-token'] === 'string' ? headers['x-setup-token'] : undefined
      if (!providedToken) return reply.code(401).send({ success: false, error: { code: 'SETUP_TOKEN_REQUIRED' } })

      const raw = repo.getMeta(SETUP_META_KEY)
      if (!raw) return reply.code(404).send({ success: false, error: { code: 'SETUP_NOT_AVAILABLE' } })

      let stored: string, expiresAt: number
      try {
        const parsed = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown }
        if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number') throw new Error()
        stored = parsed.token; expiresAt = parsed.expiresAt
      } catch { return reply.code(401).send({ success: false, error: { code: 'SETUP_TOKEN_INVALID' } }) }

      if (providedToken !== stored || Date.now() > expiresAt) {
        return reply.code(401).send({ success: false, error: { code: 'SETUP_TOKEN_INVALID' } })
      }

      const body = request.body as { username?: unknown; password?: unknown } | undefined
      if (
        typeof body?.username !== 'string' || !/^[a-zA-Z0-9._-]{3,64}$/.test(body.username) ||
        typeof body.password !== 'string' || body.password.length < 12 || Buffer.byteLength(body.password, 'utf8') > 1024
      ) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } })

      const hash = await hashPassword(body.password)
      const created = repo.setupFirstAdmin(body.username.toLowerCase(), hash, stored)
      if (!created) return reply.code(409).send({ success: false, error: { code: 'SETUP_ALREADY_COMPLETE' } })

      request.log.info({ username: body.username }, 'First admin account created via setup bootstrap')
      return reply.code(201).send({ success: true, data: { message: 'Admin account created. Setup endpoint is now disabled.' } })
    })
}
