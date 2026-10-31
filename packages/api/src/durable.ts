import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

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

export class PgSnapshotStore {
  constructor(private readonly q: Queryable) {}
  async ensureSchema(): Promise<void> {
    await this.q.query(`CREATE TABLE IF NOT EXISTS hades_snapshot (id TEXT PRIMARY KEY, version BIGINT NOT NULL, data BYTEA NOT NULL, sha256 TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
    await this.q.query(`CREATE TABLE IF NOT EXISTS hades_recovery (token_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
  }
  async load(): Promise<Snapshot | null> {
    const { rows } = await this.q.query(`SELECT version, data FROM hades_snapshot WHERE id='main'`)
    return rows[0] ? { version: Number(rows[0].version), data: Buffer.from(rows[0].data) } : null
  }
  /** Compare-and-swap: returns the new version, or null when someone else wrote since `expected`. */
  async save(expected: number, data: Buffer): Promise<number | null> {
    const sha = createHash('sha256').update(data).digest('hex')
    if (expected === 0) {
      const r = await this.q.query(`INSERT INTO hades_snapshot (id, version, data, sha256) VALUES ('main', 1, $1, $2) ON CONFLICT (id) DO NOTHING RETURNING version`, [data, sha])
      return r.rows[0] ? Number(r.rows[0].version) : null
    }
    const r = await this.q.query(`UPDATE hades_snapshot SET version = version + 1, data = $1, sha256 = $2, updated_at = now() WHERE id = 'main' AND version = $3 RETURNING version`, [data, sha, expected])
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
  private flushing: Promise<void> | null = null
  lastSavedAt = 0
  constructor(readonly store: PgSnapshotStore, private readonly key: Buffer, private readonly log: Log = console as unknown as Log) {}

  get degraded(): boolean { return !this.canWrite }

  /** Before the repository opens: if the local DB file is gone, bring back the last snapshot. Never throws. */
  async restoreIfMissing(dbPath: string): Promise<'restored' | 'local-kept' | 'empty-store' | 'unavailable'> {
    try {
      await this.store.ensureSchema()
      const snap = await this.store.load()
      this.version = snap?.version ?? 0
      if (existsSync(dbPath)) { this.canWrite = true; return 'local-kept' }
      if (!snap) { this.canWrite = true; return 'empty-store' }
      await mkdir(dirname(dbPath), { recursive: true })
      await writeFile(dbPath, decryptSnapshot(snap.data, this.key))
      this.canWrite = true
      this.log.info({ version: snap.version }, 'Durable snapshot restored')
      return 'restored'
    } catch (error) {
      // Durable store unreachable or snapshot unreadable: run WITHOUT durability and never write, so a blank DB cannot clobber good data.
      this.canWrite = false
      this.log.error({ reason: (error as Error).message }, 'DURABLE STORAGE UNAVAILABLE - running without persistence; do not provision the admin until this is resolved')
      return 'unavailable'
    }
  }

  start(source: MirrorSource, intervalMs = 10_000): void {
    const tick = (): void => { void this.flush(source).catch(() => {}) }
    this.timer = setInterval(tick, intervalMs); this.timer.unref()
    tick()
  }
  async stop(source: MirrorSource): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    await this.flush(source, true).catch(() => {})
  }
  /** Mirrors the DB when it changed since the last successful save. Single-flight. */
  flush(source: MirrorSource, force = false): Promise<void> {
    if (this.flushing) return this.flushing
    this.flushing = (async () => {
      if (!this.canWrite) return
      const count = source.changeCount()
      if (!force && count === this.lastCount) return
      // Guard: never publish an image without users over one that had them.
      if (!source.hasUsers() && this.version > 0) { this.log.warn({}, 'Snapshot skipped: local DB has no users'); this.lastCount = count; return }
      const blob = encryptSnapshot(source.serialize(), this.key)
      const next = await this.store.save(this.version, blob)
      if (next === null) { this.canWrite = false; this.log.error({}, 'Snapshot conflict: another instance wrote; durability paused'); return }
      this.version = next; this.lastCount = count; this.lastSavedAt = Date.now()
    })().catch(error => { this.log.warn({ reason: (error as Error).message }, 'Snapshot save failed; will retry') }).finally(() => { this.flushing = null })
    return this.flushing
  }
}

/** Builds the durable layer from env, or null when not configured. */
export async function createDurableFromEnv(env: NodeJS.ProcessEnv = process.env, log?: Log): Promise<DurableSync | null> {
  const url = env['HADES_DURABLE_DATABASE_URL']
  if (!url) return null
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 8000, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true } })
  pool.on('error', () => {})
  return new DurableSync(new PgSnapshotStore(pool as unknown as Queryable), deriveSnapshotKey(env), log)
}
