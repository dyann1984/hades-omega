import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { SqliteRepository } from './sqlite.js'
import { registerSecurity } from './security.js'
import { vaultRoutes } from './routes/vault.js'

const key = () => randomBytes(32).toString('base64')
const dirs: string[] = []
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })
async function repository() {
  const dir = await mkdtemp(join(tmpdir(), 'hades-vault-test-')); dirs.push(dir)
  const db = join(dir, 'vault.sqlite'), legacy = join(dir, 'none.json')
  const repo = new SqliteRepository(db, legacy); await repo.init()
  return { repo, db, legacy }
}

describe('encrypted secret vault', () => {
  it('persists authenticated ciphertext across restart, refuses wrong keys and detects tampering', async () => {
    const { repo, db, legacy } = await repository(), master = key(), secret = 'canary-secret-value-923145'
    const vault = repo.createSecretVault(master)
    vault.put('SERVICE_TOKEN', secret, 'admin')
    expect(vault.get('SERVICE_TOKEN', 'service')).toBe(secret)
    expect(vault.list()).toHaveLength(1)
    repo.close()
    expect((await readFile(db)).includes(Buffer.from(secret))).toBe(false)
    const reopened = new SqliteRepository(db, legacy); await reopened.init()
    try {
      const wrong = reopened.createSecretVault(key())
      expect(() => wrong.get('SERVICE_TOKEN', 'service')).toThrow('VAULT_AUTHENTICATION_FAILED')
      expect(() => wrong.put('SERVICE_TOKEN', 'replacement', 'admin')).toThrow('VAULT_AUTHENTICATION_FAILED')
      expect(reopened.createSecretVault(master).get('SERVICE_TOKEN', 'service')).toBe(secret)
      const Database = (await import('better-sqlite3')).default
      const raw = new Database(db); raw.prepare("UPDATE vault_secrets SET tag=zeroblob(16) WHERE name='SERVICE_TOKEN'").run(); raw.close()
      expect(() => reopened.createSecretVault(master).get('SERVICE_TOKEN', 'service')).toThrow('VAULT_AUTHENTICATION_FAILED')
      expect(JSON.stringify(reopened.listAuditEvents({ limit: 100, offset: 0 }))).not.toContain(secret)
    } finally { reopened.close() }
  })
  it('is disabled without a key and rejects invalid keys and inputs', async () => {
    const { repo } = await repository()
    try {
      expect(() => repo.createSecretVault(undefined).put('TOKEN', 'secret', 'admin')).toThrow('VAULT_NOT_CONFIGURED')
      expect(() => repo.createSecretVault('bad')).toThrow('VAULT_KEY_INVALID')
      const vault = repo.createSecretVault(key())
      expect(() => vault.put('bad name', 'secret', 'admin')).toThrow('VAULT_NAME_INVALID')
      expect(() => vault.put('TOKEN', '', 'admin')).toThrow('VAULT_VALUE_INVALID')
    } finally { repo.close() }
  })
  it('limits HTTP operations to administrators and never returns stored values', async () => {
    const { repo } = await repository(), oldJwt = process.env.JWT_SECRET, oldKey = process.env.HADES_VAULT_MASTER_KEY
    process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'; process.env.HADES_VAULT_MASTER_KEY = key()
    const app = Fastify()
    try {
      await registerSecurity(app)
      await app.register(async a => vaultRoutes(a, repo, {} as never), { prefix: '/api/v1' }); await app.ready()
      const call = (role: string, method: 'GET' | 'PUT' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'u', roles: [role] }, { expiresIn: '1h' })}` } })
      expect((await call('VIEWER', 'PUT', '/api/v1/vault/secrets/TOKEN', { value: 'secret-value' })).statusCode).toBe(403)
      expect((await call('ADMIN', 'PUT', '/api/v1/vault/secrets/TOKEN', { value: 'secret-value' })).statusCode).toBe(200)
      const listed = await call('ADMIN', 'GET', '/api/v1/vault/secrets')
      expect(listed.statusCode).toBe(200); expect(listed.body).not.toContain('secret-value')
      expect((await call('ADMIN', 'DELETE', '/api/v1/vault/secrets/TOKEN')).json().data.deleted).toBe(true)
    } finally {
      await app.close(); repo.close()
      if (oldJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldJwt
      if (oldKey === undefined) delete process.env.HADES_VAULT_MASTER_KEY; else process.env.HADES_VAULT_MASTER_KEY = oldKey
    }
  })
})
