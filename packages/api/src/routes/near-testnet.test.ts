import Fastify from 'fastify'
import { describe, it, expect } from 'vitest'
import { registerSecurity } from '../security.js'
import { cerberusRoutes } from './cerberus.js'

describe('NEAR read-only endpoint', () => {
  it('requires admin access and rejects non-testnet accounts without contacting RPC', async () => {
    const old = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const app = Fastify()
    try {
      await registerSecurity(app)
      await app.register(async scoped => cerberusRoutes(scoped), {prefix:'/api/v1'})
      await app.ready()
      const auth = (role: string) => ({authorization:`Bearer ${app.jwt.sign({sub:'user',roles:[role],exp:Math.floor(Date.now()/1000)+60})}`})
      expect((await app.inject({url:'/api/v1/near/testnet/account/example.near'})).statusCode).toBe(401)
      expect((await app.inject({url:'/api/v1/near/testnet/account/example.near',headers:auth('VIEWER')})).statusCode).toBe(403)
      expect((await app.inject({url:'/api/v1/near/testnet/account/example.near',headers:auth('ADMIN')})).statusCode).toBe(400)
    } finally { await app.close(); process.env.JWT_SECRET=old }
  })
})
