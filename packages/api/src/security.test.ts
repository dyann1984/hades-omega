import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { registerSecurity, requireRole } from './security.js'

describe('API security', () => {
  const previousSecret = process.env['JWT_SECRET']
  afterEach(() => { process.env['JWT_SECRET'] = previousSecret })

  it('rejects unauthenticated access and enforces roles', async () => {
    process.env['JWT_SECRET'] = 'test-secret-with-at-least-thirty-two-characters'
    const app = Fastify()
    await registerSecurity(app)
    app.get('/api/v1/operator', async request => { requireRole(request, ['OPERATOR']); return { ok: true } })
    await app.ready()
    expect((await app.inject('/api/v1/operator')).statusCode).toBe(401)
    const viewer = app.jwt.sign({ sub: 'viewer-1', roles: ['VIEWER'], exp: Math.floor(Date.now()/1000)+60 })
    expect((await app.inject({ url: '/api/v1/operator', headers: { authorization: `Bearer ${viewer}` } })).statusCode).toBe(403)
    const operator = app.jwt.sign({ sub: 'operator-1', roles: ['OPERATOR'], exp: Math.floor(Date.now()/1000)+60 })
    expect((await app.inject({ url: '/api/v1/operator', headers: { authorization: `Bearer ${operator}` } })).statusCode).toBe(200)
    await app.close()
  })
})
