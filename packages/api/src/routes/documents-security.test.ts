import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { documentRoutes } from './documents.js'
import { registerSecurity } from '../security.js'
import { setupRoutes, generateSetupToken } from '../setup.js'

// JWT-only security (no session DB check, mirrors isolation.test.ts pattern)
async function makeApp(repo: SqliteRepository) {
  const previous = process.env['JWT_SECRET']
  process.env['JWT_SECRET'] = 'test-secret-thirty-two-chars-min!!'
  const app = Fastify()
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await registerSecurity(app) // no repo → JWT-only, no session validation
  await setupRoutes(app, repo)
  await app.register(async (api) => { await documentRoutes(api, repo) }, { prefix: '/api/v1' })
  await app.ready()
  return { app, restore: () => { process.env['JWT_SECRET'] = previous } }
}

function token(app: any, sub: string, roles = ['OPERATOR'], opts: Record<string, unknown> = {}) {
  return app.jwt.sign({ sub, roles, exp: Math.floor(Date.now() / 1000) + 60, sid: 'test-sid', ...opts })
}
function auth(app: any, sub: string, roles?: string[]) {
  return { authorization: `Bearer ${token(app, sub, roles)}` }
}

describe('document security and isolation', () => {
  let dir: string
  let repo: SqliteRepository

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hades-docsec-'))
    repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
    await repo.init()
  })

  afterEach(async () => {
    repo.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects unauthenticated document processing (no Authorization header)', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/documents/process',
        payload: { filename: 'test.txt', content: 'hello world', mimeType: 'text/plain' },
      })
      expect(res.statusCode).toBe(401)
    } finally { await app.close(); restore() }
  })

  it('rejects expired JWT', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const expiredToken = app.jwt.sign({ sub: 'user-a', roles: ['OPERATOR'], exp: Math.floor(Date.now() / 1000) - 10, sid: 'sid' })
      const res = await app.inject({
        method: 'POST', url: '/api/v1/documents/process',
        headers: { authorization: `Bearer ${expiredToken}` },
        payload: { filename: 'test.txt', content: 'content', mimeType: 'text/plain' },
      })
      expect(res.statusCode).toBe(401)
    } finally { await app.close(); restore() }
  })

  it('isolates document results: user A cannot see user B results', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const payload = { filename: 'shared.txt', content: 'Content for isolation testing across users.', mimeType: 'text/plain' }
      await app.inject({ method: 'POST', url: '/api/v1/documents/process', headers: auth(app, 'user-alice'), payload })
      await app.inject({ method: 'POST', url: '/api/v1/documents/process', headers: auth(app, 'user-bob'), payload })

      const aliceList = (await app.inject({ method: 'GET', url: '/api/v1/documents/results', headers: auth(app, 'user-alice') })).json()
      const bobList = (await app.inject({ method: 'GET', url: '/api/v1/documents/results', headers: auth(app, 'user-bob') })).json()

      expect(aliceList.data).toHaveLength(1)
      expect(bobList.data).toHaveLength(1)
      expect(aliceList.data[0].id).not.toBe(bobList.data[0].id)
    } finally { await app.close(); restore() }
  })

  it('path traversal filename: processed as a filename string, no filesystem access', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/documents/process',
        headers: auth(app, 'user-x'),
        payload: { filename: '../../etc/passwd.txt', content: 'root:x:0:0:root:/root:/bin/bash', mimeType: 'text/plain' },
      })
      // Extension is .txt — allowed. The route never accesses the filesystem using the filename.
      // Response is 200 (processed) and filename is stored as-is (no resolution)
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.filename).toBe('../../etc/passwd.txt')
      // No actual file read: result is from the content string, not the filesystem
      expect(body.data.intake.wordCount).toBeGreaterThanOrEqual(1)
    } finally { await app.close(); restore() }
  })

  it('VIEWER role can process documents (no role restriction on this endpoint currently)', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/documents/process',
        headers: auth(app, 'user-viewer', ['VIEWER']),
        payload: { filename: 'test.txt', content: 'viewer document content here', mimeType: 'text/plain' },
      })
      // Currently no role restriction → VIEWER can process (documented as future P1 to restrict)
      expect(res.statusCode).toBe(200)
    } finally { await app.close(); restore() }
  })

  it('bootstrap admin setup/init skips JWT auth (accessible without login)', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const setupToken = generateSetupToken(repo)!
      // Call /api/v1/setup/init WITHOUT any Authorization header
      const res = await app.inject({
        method: 'POST', url: '/api/v1/setup/init',
        headers: { 'x-setup-token': setupToken },
        payload: { username: 'admin', password: 'admin-secure-pass-1' },
      })
      expect(res.statusCode).toBe(201)
    } finally { await app.close(); restore() }
  })

  it('bootstrap token non-reusable after first admin created', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const setupToken = generateSetupToken(repo)!
      // First creation succeeds
      await app.inject({
        method: 'POST', url: '/api/v1/setup/init',
        headers: { 'x-setup-token': setupToken },
        payload: { username: 'admin', password: 'admin-secure-pass-2' },
      })
      // Second attempt with same token → 404 (token deleted from DB)
      const repeat = await app.inject({
        method: 'POST', url: '/api/v1/setup/init',
        headers: { 'x-setup-token': setupToken },
        payload: { username: 'hacker', password: 'hacked-password-here' },
      })
      expect(repeat.statusCode).toBe(404)
      // generateSetupToken returns null when users exist
      expect(generateSetupToken(repo)).toBeNull()
    } finally { await app.close(); restore() }
  })

  it('empty filename rejected by schema validation', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/documents/process',
        headers: auth(app, 'user-x'),
        payload: { filename: '', content: 'some content', mimeType: 'text/plain' },
      })
      expect(res.statusCode).toBe(400)
    } finally { await app.close(); restore() }
  })

  it('missing required fields rejected by schema validation', async () => {
    const { app, restore } = await makeApp(repo)
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/documents/process',
        headers: auth(app, 'user-x'),
        payload: { mimeType: 'text/plain' }, // missing filename and content
      })
      expect(res.statusCode).toBe(400)
    } finally { await app.close(); restore() }
  })
})
