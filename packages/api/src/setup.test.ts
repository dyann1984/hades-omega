import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { SqliteRepository } from './sqlite.js'
import { generateSetupToken, setupRoutes } from './setup.js'

async function makeApp(repo: SqliteRepository) {
  const app = Fastify()
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await setupRoutes(app, repo)
  return app
}

describe('admin bootstrap', () => {
  it('generates token when no users; token is idempotent and null after users exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-setup-a-'))
    const repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
    try {
      await repo.init()
      const token = generateSetupToken(repo)
      expect(typeof token).toBe('string')
      expect(token!.length).toBe(64)
      expect(generateSetupToken(repo)).toBe(token) // idempotent
    } finally { repo.close(); await rm(dir, { recursive: true, force: true }) }
  })

  it('rejects missing or wrong token', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-setup-b-'))
    const repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
    const app = await makeApp(repo)
    try {
      await repo.init()
      generateSetupToken(repo)
      expect((await app.inject({ method: 'POST', url: '/api/v1/setup/init', payload: { username: 'admin', password: 'secure-password-123' } })).statusCode).toBe(401)
      expect((await app.inject({ method: 'POST', url: '/api/v1/setup/init', headers: { 'x-setup-token': 'wrongtoken' }, payload: { username: 'admin', password: 'secure-password-123' } })).statusCode).toBe(401)
    } finally { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }) }
  })

  it('rejects short password with valid token', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-setup-c-'))
    const repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
    const app = await makeApp(repo)
    try {
      await repo.init()
      const token = generateSetupToken(repo)!
      expect((await app.inject({ method: 'POST', url: '/api/v1/setup/init', headers: { 'x-setup-token': token }, payload: { username: 'admin', password: 'short' } })).statusCode).toBe(400)
    } finally { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }) }
  })

  it('creates admin on valid request, then disables setup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-setup-d-'))
    const repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
    const app = await makeApp(repo)
    try {
      await repo.init()
      const token = generateSetupToken(repo)!

      const res = await app.inject({ method: 'POST', url: '/api/v1/setup/init', headers: { 'x-setup-token': token }, payload: { username: 'admin', password: 'secure-password-for-admin' } })
      expect(res.statusCode).toBe(201)
      expect(res.json().success).toBe(true)
      expect(repo.hasUsers()).toBe(true)
      expect(repo.findUser('admin')).toBeDefined()

      // Token consumed — setup_token deleted from DB → endpoint returns 404 (setup not available)
      const repeat = await app.inject({ method: 'POST', url: '/api/v1/setup/init', headers: { 'x-setup-token': token }, payload: { username: 'admin2', password: 'another-secure-pass-here' } })
      expect(repeat.statusCode).toBe(404)

      // generateSetupToken returns null when users exist
      expect(generateSetupToken(repo)).toBeNull()
    } finally { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }) }
  })
})
