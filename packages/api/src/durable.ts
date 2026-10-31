import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'

/**
 * Durable persistence for ephemeral hosts (Render Free wipes the disk on spin-down / restart).
 *
 * SQLite stays the live store (same schema, same scrypt hashes, same sync API). Its full image is mirrored,
 * encrypted with AES-256-GCM, into an external PostgreSQL table, and restored on boot when the local file is missing.
 *  - Opt-in: nothing happens unless HADES_DURABLE_DATABASE_URL is set (DATABASE_URL is NOT reused: .env.example uses it for a SQLite path).
 *  - Only the real repository is mirrored. DEMO sessions live in separate in-memory repositories and never reach this layer.
 *  - Writes are compare-and-swap on a version, and are refused if the boot-time load failed (an empty DB can never overwrite good data).
 *  - Admin recovery tokens are stored hashed, single use, with expiry, in a separate table.
 */
export interface Queryable { query(text: string, params?: unknown[]): Promise<{ rows: any[] }> }
export interface Snapshot { version: number; data: Buffer }

const MAGIC = Buffer.from('HDS1')

export function deriveSnapshotKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const explicit = env['HADES_SNAPSHOT_KEY']
  const material = explicit && explicit.length >= 32 ? explicit : env['JWT_SECRET']
  if (!material || material.length < 32) throw new Error('HADES_SNAPSHOT_KEY (or JWT_SECRET) with at least 32 characters is required for durable storage')
  return Buffer.from(hkdfSync('sha256', Buffer.from(material, 'utf8'), Buffer.from('hades-snapshot-v1'), Buffer.from(explicit ? 'explicit' : 'jwt-derived'), 32))
}
export function encryptSnapshot(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct])
}
export function decryptSnapshot(blob: Buffer, key: Buffer): Buffer {
  if (blob.length < 4 + 12 + 16 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error('SNAPSHOT_FORMAT')
  const d = createDecipheriv('aes-256-gcm', key, blob.subarray(4, 16))
  d.setAuthTag(blob.subarray(16, 32))
  try { return Buffer.concat([d.update(blob.subarray(32)), d.final()]) } catch { throw new Error('SNAPSHOT_AUTH_FAILED') }
}

/** Opens the image in memory and checks it is a healthy SQLite database with the users table. Throws if not. */
export function verifyImage(image: Buffer): void {
  let db: Database.Database | undefined
  try {
    if (image.length < 100 || image.subarray(0, 15).toString('latin1') !== 'SQLite format 3') throw new Error('x')
    // A WAL-mode header cannot be opened from memory; check a copy whose journal-mode bytes are rolled back to legacy.
    const copy = Buffer.from(image); copy[18] = 1; copy[19] = 1
    db = new Database(copy)
    const ic = db.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (ic.length !== 1 || ic[0]!.integrity_check !== 'ok') throw new Error('x')
    db.prepare('SELECT count(*) FROM users').get()
  } catch { throw new Error('SNAPSHOT_CORRUPT') } finally { try { db?.close() } catch { /* ignore */ } }
}
/** Removes connection strings / key material from any text before it reaches logs or responses. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, 'postgres://[redacted]')
  for (const k of ['HADES_DURABLE_DATABASE_URL', 'HADES_SNAPSHOT_KEY', 'JWT_SECRET']) { const v = env[k]; if (v && v.length >= 8) out = out.split(v).join('[redacted]') }
  return out
}

export class PgSnapshotStore {
  constructor(private readonly q: Queryable, private readonly id = 'main') {}
  /** Self-test helper: removes this store's snapshot row. */
  async drop(): Promise<void> { await this.q.query('DELETE FROM hades_snapshot WHERE id = $1', [this.id]) }
  async ensureSchema(): Promise<void> {
    await this.q.query(`CREATE TABLE IF NOT EXISTS hades_snapshot (id TEXT PRIMARY KEY, version BIGINT NOT NULL, data BYTEA NOT NULL, sha256 TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
    await this.q.query(`CREATE TABLE IF NOT EXISTS hades_recovery (token_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
  }
  async load(): Promise<Snapshot | null> {
    const { rows } = await this.q.query('SELECT version, data, sha256 FROM hades_snapshot WHERE id = $1', [this.id])
    if (!rows[0]) return null
    const data = Buffer.from(rows[0].data)
    if (createHash('sha256').update(data).digest('hex') !== rows[0].sha256) throw new Error('SNAPSHOT_CHECKSUM')
    return { version: Number(rows[0].version), data }
  }
  /** Compare-and-swap: returns the new version, or null when someone else wrote since `expected`. */
  async save(expected: number, data: Buffer): Promise<number | null> {
    const sha = createHash('sha256').update(data).digest('hex')
    if (expected === 0) {
      const r = await this.q.query(`INSERT INTO hades_snapshot (id, version, data, sha256) VALUES ($3, 1, $1, $2) ON CONFLICT (id) DO NOTHING RETURNING version`, [data, sha, this.id])
      return r.rows[0] ? Number(r.rows[0].version) : null
    }
    const r = await this.q.query(`UPDATE hades_snapshot SET version = version + 1, data = $1, sha256 = $2, updated_at = now() WHERE id = $4 AND version = $3 RETURNING version`, [data, sha, expected, this.id])
    return r.rows[0] ? Number(r.rows[0].version) : null
  }
  async issueRecovery(tokenHash: string, ttlMs: number): Promise<void> {
    await this.q.query(`DELETE FROM hades_recovery WHERE expires_at < now() - interval '1 day'`)
    await this.q.query(`INSERT INTO hades_recovery (token_hash, expires_at) VALUES ($1, now() + ($2 || ' milliseconds')::interval)`, [tokenHash, String(Math.round(ttlMs))])
  }
  /** Atomically burns a valid token. True only the first time, and only before it expires. */
  async consumeRecovery(tokenHash: string): Promise<boolean> {
    const r = await this.q.query(`UPDATE hades_recovery SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING token_hash`, [tokenHash])
    return r.rows.length === 1
  }
}
export const hashRecoveryToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex')

/** What DurableSync needs from the live repository. */
export interface MirrorSource { serialize(): Buffer; changeCount(): number; hasUsers(): boolean }
type Log = { info(o: unknown, m?: string): void; warn(o: unknown, m?: string): void; error(o: unknown, m?: string): void }

export class DurableSync {
  private version = 0
  private lastCount = -1
  private canWrite = false
  private timer: NodeJS.Timeout | undefined
  private flushing: Promise<boolean> | null = null
  lastSavedAt = 0
  constructor(readonly store: PgSnapshotStore, private readonly key: Buffer, private readonly log: Log = console as unknown as Log) {}

  /** True when mirrored writes cannot currently be guaranteed (store unreachable at boot, conflict, repeated save failures). */
  get degraded(): boolean { return !this.canWrite }

  /** Before the repository opens: if the local DB file is gone, bring back the last snapshot (verified). Never throws. */
  async restoreIfMissing(dbPath: string): Promise<'restored' | 'local-kept' | 'empty-store' | 'unavailable'> {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {           // a suspended Neon compute needs a moment to wake up
      try {
        await this.store.ensureSchema()
        const snap = await this.store.load()
        this.version = snap?.version ?? 0
        if (existsSync(dbPath)) { this.canWrite = true; return 'local-kept' }
        if (!snap) { this.canWrite = true; return 'empty-store' }
        const image = decryptSnapshot(snap.data, this.key)
        verifyImage(image)                                       // integrity_check + users table, before it ever becomes the live DB
        await mkdir(dirname(dbPath), { recursive: true })
        await writeFile(dbPath, image)
        this.canWrite = true
        this.log.info({ version: snap.version }, 'Durable snapshot restored')
        return 'restored'
      } catch (error) { lastError = error; await new Promise(r => setTimeout(r, 1500)) }
    }
    // Store unreachable or snapshot unreadable: run WITHOUT durability and never write, so a blank DB cannot clobber good data.
    this.canWrite = false
    this.log.error({ reason: redact((lastError as Error).message) }, 'DURABLE STORAGE UNAVAILABLE - running without persistence; admin changes are refused; do not provision the admin until this is resolved')
    return 'unavailable'
  }

  start(source: MirrorSource, intervalMs = 10_000): void {
    this.timer = setInterval(() => { void this.flush(source) }, intervalMs); this.timer.unref()
    void this.flush(source)
  }
  async stop(source: MirrorSource): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    await this.flush(source, true)
  }
  /**
   * Mirrors the DB when it changed since the last successful save. Single-flight. Resolves true when the store holds the
   * current state (or nothing needed saving); false when it could not be saved.
   */
  flush(source: MirrorSource, force = false): Promise<boolean> {
    if (this.flushing) return this.flushing.then(() => this.flush(source, force))
    this.flushing = (async () => {
      if (!this.canWrite) return false
      const count = source.changeCount()
      if (!force && count === this.lastCount) return true
      // Guard: never publish an image without users over one that had them.
      if (!source.hasUsers() && this.version > 0) { this.log.warn({}, 'Snapshot skipped: local DB has no users'); this.lastCount = count; return true }
      const image = source.serialize()                            // consistent: taken inside one read transaction (includes WAL content)
      verifyImage(image)                                          // never upload a corrupt image
      const next = await this.store.save(this.version, encryptSnapshot(image, this.key))
      if (next === null) { this.canWrite = false; this.log.error({}, 'Snapshot conflict: another instance wrote; durability paused'); return false }
      this.version = next; this.lastCount = count; this.lastSavedAt = Date.now()
      return true
    })().catch(error => { this.log.warn({ reason: redact((error as Error).message) }, 'Snapshot save failed; will retry'); return false }).finally(() => { this.flushing = null })
    return this.flushing
  }
}

/**
 * Fail-closed guard. With durable storage configured, administrative writes (everything non-GET under /api/v1 except the
 * isolated DEMO routes and plain session login/logout/refresh) are:
 *  - refused with 503 while durability is degraded (nothing is changed), and
 *  - confirmed only after the new state is stored; otherwise the client gets 503 instead of a success that could be lost.
 */
export function registerDurableGuard(app: FastifyInstance, durable: DurableSync, source: MirrorSource): void {
  const guarded = (method: string, url: string): boolean => {
    const path = url.split('?')[0]!
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !path.startsWith('/api/v1/')) return false
    if (path.startsWith('/api/v1/demo/') || path === '/api/v1/demo/session') return false
    return !['/api/v1/auth/login', '/api/v1/auth/logout', '/api/v1/auth/refresh'].includes(path)
  }
  app.addHook('onRequest', async (request, reply) => {
    if (guarded(request.method, request.url) && durable.degraded) return reply.code(503).send({ success: false, error: { code: 'DURABLE_STORAGE_UNAVAILABLE' } })
  })
  app.addHook('onSend', async (request, reply, payload) => {
    if (!guarded(request.method, request.url) || reply.statusCode >= 400) return payload
    if (await durable.flush(source, true)) return payload
    reply.code(503).header('content-type', 'application/json; charset=utf-8')
    return JSON.stringify({ success: false, error: { code: 'DURABLE_NOT_CONFIRMED' } })
  })
}

/** Builds the durable layer from env, or null when not configured. TLS is mandatory for any non-local host (Neon: sslmode=require). */
export async function createDurableFromEnv(env: NodeJS.ProcessEnv = process.env, log?: Log): Promise<DurableSync | null> {
  const url = env['HADES_DURABLE_DATABASE_URL']
  if (!url) return null
  const local = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)
  if (!local && !/[?&]sslmode=(require|verify-full)\b/.test(url)) throw new Error('HADES_DURABLE_DATABASE_URL must include sslmode=require (TLS is mandatory)')
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 20_000, ssl: local ? undefined : { rejectUnauthorized: true } })
  pool.on('error', () => {})
  return new DurableSync(new PgSnapshotStore(pool as unknown as Queryable), deriveSnapshotKey(env), log)
}

/**
 * Full lifecycle check using a TEMPORARY account and a throw-away snapshot id (never the production row):
 * create user -> mirror -> wipe disk -> restore -> verify login hash -> recovery token once -> cleanup.
 * The temporary password is random, lives only in memory and is never printed.
 */
export async function runSelfTest(q: Queryable, key: Buffer, mk: { tmpDir: string; open: (db: string) => Promise<MirrorSource & { createUser(u: string, h: string, r: string): string; findUser(u: string): { password_hash: string } | undefined; close(): void }>; hash: (p: string) => Promise<string>; verify: (p: string, h: string) => Promise<boolean> }): Promise<Array<[string, boolean]>> {
  const out: Array<[string, boolean]> = []
  const id = `selftest-${randomBytes(6).toString('hex')}`
  const store = new PgSnapshotStore(q, id)
  const db = `${mk.tmpDir}/selftest.sqlite`
  const pw = randomBytes(18).toString('base64url')
  const quiet = { info() {}, warn() {}, error() {} }
  try {
    await store.ensureSchema()
    const a = new DurableSync(store, key, quiet); await a.restoreIfMissing(db)
    const r1 = await mk.open(db); r1.createUser('tmp-selftest', await mk.hash(pw), 'ADMIN')
    out.push(['mirror saved', await a.flush(r1, true)]); r1.close()
    const { rm } = await import('node:fs/promises'); for (const s of ['', '-wal', '-shm']) await rm(db + s, { force: true })
    const b = new DurableSync(store, key, quiet)
    out.push(['restored after disk loss', (await b.restoreIfMissing(db)) === 'restored'])
    const r2 = await mk.open(db); const u = r2.findUser('tmp-selftest')
    out.push(['user survives; password verifies', !!u && await mk.verify(pw, u.password_hash) && !(await mk.verify(pw + 'x', u.password_hash))])
    const stale = new DurableSync(store, key, quiet); await stale.restoreIfMissing(db + '.none')
    out.push(['empty/stale writer cannot overwrite', (await store.save(0, Buffer.from('x'))) === null])
    const tok = randomBytes(32).toString('hex'); await store.issueRecovery(hashRecoveryToken(tok), 60_000)
    out.push(['recovery token single use', (await store.consumeRecovery(hashRecoveryToken(tok))) && !(await store.consumeRecovery(hashRecoveryToken(tok)))])
    r2.close()
  } finally { try { await store.drop() } catch { /* best effort */ } }
  return out
}