import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import Fastify from 'fastify'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PgSnapshotStore, DurableSync, encryptSnapshot, decryptSnapshot, deriveSnapshotKey, hashRecoveryToken, type Queryable } from './durable.js'
import { SqliteRepository } from './sqlite.js'
import { registerSecurity } from './security.js'
import { authRoutes } from './auth.js'
import { hashPassword, verifyPassword } from './password.js'

const SECRET = 'x'.repeat(40)
const key = deriveSnapshotKey({ JWT_SECRET: SECRET } as NodeJS.ProcessEnv)
const quiet = { info() {}, warn() {}, error() {} }
const pgOf = (db: PGlite): Queryable => ({ query: async (t, p) => ({ rows: (await db.query(t, p as never[])).rows as any[] }) })

async function boot(dir: string, store: PgSnapshotStore) {
  const dbPath = join(dir, 'hades.sqlite')
  const sync = new DurableSync(store, key, quiet)
  const outcome = await sync.restoreIfMissing(dbPath)
  const repo = new SqliteRepository(dbPath, join(dir, 'legacy.json')); await repo.init()
  return { dbPath, sync, repo, outcome }
}

describe('durable storage (PostgreSQL mirror of SQLite)', () => {
  it('encrypts snapshots and rejects tampering / wrong key', () => {
    const blob = encryptSnapshot(Buffer.from('secret-image'), key)
    expect(blob.includes(Buffer.from('secret-image'))).toBe(false)
    expect(decryptSnapshot(blob, key).toString()).toBe('secret-image')
    const bad = Buffer.from(blob); bad[bad.length - 1] ^= 1
    expect(() => decryptSnapshot(bad, key)).toThrow('SNAPSHOT_AUTH_FAILED')
    expect(() => decryptSnapshot(blob, deriveSnapshotKey({ JWT_SECRET: 'y'.repeat(40) } as NodeJS.ProcessEnv))).toThrow()
  })

  it('admin and data survive a wiped disk (spin-down), with the same scrypt hash and working login check', async () => {
    const pgdb = new PGlite(); const store = new PgSnapshotStore(pgOf(pgdb)); await store.ensureSchema()
    const dir = await mkdtemp(join(tmpdir(), 'hades-dur-'))
    try {
      // 1st life: first-run, admin created, mirrored
      const a = await boot(dir, store)
      expect(a.outcome).toBe('empty-store')
      a.repo.createUser('admin', await hashPassword('correct horse battery staple'), 'ADMIN')
      await a.sync.flush(a.repo)
      await a.sync.stop(a.repo); a.repo.close()
      // Render wipes the disk
      await rm(join(dir, 'hades.sqlite'), { force: true }); await rm(join(dir, 'hades.sqlite-wal'), { force: true }); await rm(join(dir, 'hades.sqlite-shm'), { force: true })
      expect(existsSync(join(dir, 'hades.sqlite'))).toBe(false)
      // 2nd life: restored before the repo opens
      const b = await boot(dir, store)
      expect(b.outcome).toBe('restored')
      expect(b.repo.hasUsers()).toBe(true)
      const u = b.repo.findUser('admin')!
      expect(u.role).toBe('ADMIN')
      expect(await verifyPassword('correct horse battery staple', u.password_hash)).toBe(true)
      expect(await verifyPassword('wrong', u.password_hash)).toBe(false)
      b.repo.close()
    } finally { await rm(dir, { recursive: true, force: true }); await pgdb.close() }
  })

  it('never overwrites good data from an empty/unreachable boot, and detects concurrent writers', async () => {
    const pgdb = new PGlite(); const store = new PgSnapshotStore(pgOf(pgdb)); await store.ensureSchema()
    const dir = await mkdtemp(join(tmpdir(), 'hades-dur-'))
    try {
      const a = await boot(dir, store)
      a.repo.createUser('admin', await hashPassword('correct horse battery staple'), 'ADMIN'); await a.sync.flush(a.repo, true)
      const goodVersion = (await store.load())!.version
      a.repo.close()
      // unreachable store at boot -> degraded, no writes
      const broken = new PgSnapshotStore({ query: async () => { throw new Error('ECONNREFUSED') } })
      const dir2 = await mkdtemp(join(tmpdir(), 'hades-dur-'))
      const c = await boot(dir2, broken)
      expect(c.outcome).toBe('unavailable'); expect(c.sync.degraded).toBe(true)
      await c.sync.flush(c.repo, true); c.repo.close(); await rm(dir2, { recursive: true, force: true })
      // empty local DB cannot replace a snapshot that had users
      const dir3 = await mkdtemp(join(tmpdir(), 'hades-dur-'))
      const empty = new DurableSync(store, key, quiet); (empty as any).canWrite = true; (empty as any).version = goodVersion
      const r = new SqliteRepository(join(dir3, 'x.sqlite'), join(dir3, 'l.json')); await r.init()
      await empty.flush(r, true); r.close(); await rm(dir3, { recursive: true, force: true })
      expect((await store.load())!.version).toBe(goodVersion)
      // CAS: stale writer is refused
      expect(await store.save(goodVersion - 1 || 99, Buffer.from('stale'))).toBeNull()
    } finally { await rm(dir, { recursive: true, force: true }); await pgdb.close() }
  })

  it('recovery tokens are single-use, expire, and are stored only as hashes', async () => {
    const pgdb = new PGlite(); const store = new PgSnapshotStore(pgOf(pgdb)); await store.ensureSchema()
    try {
      const h = hashRecoveryToken('t'.repeat(64))
      await store.issueRecovery(h, 60_000)
      expect(await store.consumeRecovery(h)).toBe(true)
      expect(await store.consumeRecovery(h)).toBe(false)          // second use
      const h2 = hashRecoveryToken('u'.repeat(64)); await store.issueRecovery(h2, -1000)
      expect(await store.consumeRecovery(h2)).toBe(false)         // expired
      const stored = (await pgdb.query('SELECT token_hash FROM hades_recovery')).rows.map((r: any) => r.token_hash)
      expect(stored.every((s: string) => /^[0-9a-f]{64}$/.test(s) && s !== 't'.repeat(64))).toBe(true)
    } finally { await pgdb.close() }
  })

  it('POST /auth/recover resets the admin password once, closes sessions, never touches DEMO, and 404s without durable storage', async () => {
    process.env['JWT_SECRET'] = SECRET; let closeLater: SqliteRepository | undefined
    const pgdb = new PGlite(); const store = new PgSnapshotStore(pgOf(pgdb)); await store.ensureSchema()
    const dir = await mkdtemp(join(tmpdir(), 'hades-dur-'))
    try {
      const { repo, sync } = await boot(dir, store); closeLater = repo
      const adminId = repo.createUser('admin', await hashPassword('old passphrase value one'), 'ADMIN')
      const sid = repo.createSession(adminId, Date.now() + 3600_000)
      const app = Fastify(); await registerSecurity(app, repo); await authRoutes(app, repo, sync)
      const token = 'a'.repeat(64); let n = 0
      const call = (t: string, pw = 'brand new passphrase 2026', user = 'admin') => app.inject({ method: 'POST', url: '/api/v1/auth/recover', remoteAddress: '10.1.0.' + (++n), payload: { username: user, token: t, newPassword: pw } })
      expect((await call(token)).statusCode).toBe(401)                         // never issued
      await store.issueRecovery(hashRecoveryToken(token), 60_000)
      expect((await call(token, 'short')).statusCode).toBe(400)                // weak password does not burn the token
      expect((await call(token)).statusCode).toBe(200)
      expect((await call(token)).statusCode).toBe(401)                         // single use
      expect(await verifyPassword('brand new passphrase 2026', repo.findUser('admin')!.password_hash)).toBe(true)
      expect(repo.getActiveSession(sid)).toBeUndefined()                       // old sessions revoked
      await app.close()
      const plain = Fastify(); await registerSecurity(plain, repo); await authRoutes(plain, repo, null)
      expect((await plain.inject({ method: 'POST', url: '/api/v1/auth/recover', payload: { username: 'admin', token, newPassword: 'x'.repeat(20) } })).statusCode).toBe(404)
      await plain.close()
    } finally { try { closeLater?.close() } catch {} ; await rm(dir, { recursive: true, force: true }); await pgdb.close() }
  }, 30_000)

  it('the mirrored image contains no DEMO users or sessions', async () => {
    const pgdb = new PGlite(); const store = new PgSnapshotStore(pgOf(pgdb)); await store.ensureSchema()
    const dir = await mkdtemp(join(tmpdir(), 'hades-dur-'))
    try {
      const { repo, sync } = await boot(dir, store)
      repo.createUser('admin', await hashPassword('correct horse battery staple'), 'ADMIN'); await sync.flush(repo, true)
      const img = decryptSnapshot((await store.load())!.data, key)
      expect(img.includes(Buffer.from('DEMO'))).toBe(false)
      expect(img.includes(Buffer.from('correct horse'))).toBe(false)           // plaintext password never stored
      expect((await readFile(join(dir, 'hades.sqlite'))).length).toBeGreaterThan(0)
      repo.close()
    } finally { await rm(dir, { recursive: true, force: true }); await pgdb.close() }
  })
})
