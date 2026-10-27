import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { registerSecurity } from '../security.js'
import { approvalRoutes } from './approvals.js'
import type { JsonRepository } from '../persistence.js'

describe('approval authorization', () => {
  it('rejects a viewer and allows an administrator to record a decision', async () => {
    const previous = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const app = Fastify()
    try {
      await registerSecurity(app)
      const repository = { decideApproval: async (input: unknown) => input } as unknown as JsonRepository
      await app.register(async api => approvalRoutes(api, repository), { prefix: '/api/v1' })
      await app.ready()
      const send = (role: string) => app.inject({ method: 'POST', url: '/api/v1/approvals/example/decision', headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'user', roles: [role] })}` }, payload: { status: 'APPROVED', justification: 'Reviewed' } })
      expect((await send('VIEWER')).statusCode).toBe(403)
      expect((await send('ADMIN')).statusCode).toBe(200)
    } finally { await app.close(); process.env.JWT_SECRET = previous }
  })
})
