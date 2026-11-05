import type Database from 'better-sqlite3'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

type Row = { nonce: Buffer; ciphertext: Buffer; tag: Buffer }
const SENTINEL = '__vault_key_check__'
const CHECK = 'HADES_VAULT_KEY_CHECK_V1'

/** Encrypted at rest with an externally provisioned 256-bit key. No key is persisted in SQLite. */
export class SecretVault {
  private key: Buffer | null
  constructor(private readonly db: Database.Database, encodedKey: string | undefined, private readonly audit: (actor: string, action: string, result: string) => void) {
    this.key = encodedKey && /^[A-Za-z0-9+/]{43}=$/.test(encodedKey) ? Buffer.from(encodedKey, 'base64') : null
    if (this.key && (this.key.length !== 32 || this.key.toString('base64') !== encodedKey)) throw new Error('VAULT_KEY_INVALID')
    if (encodedKey && !this.key) throw new Error('VAULT_KEY_INVALID')
  }
  get configured(): boolean { return this.key !== null }
  private name(name: string): void { if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) throw new Error('VAULT_NAME_INVALID') }
  private requireKey(): Buffer { if (!this.key) throw new Error('VAULT_NOT_CONFIGURED'); return this.key }
  private encrypt(name: string, value: string): Row {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.requireKey(), nonce)
    cipher.setAAD(Buffer.from(`hades-vault:v1:${name}`))
    return { nonce, ciphertext: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]), tag: cipher.getAuthTag() }
  }
  private decrypt(name: string, row: Row): string {
    try {
      const cipher = createDecipheriv('aes-256-gcm', this.requireKey(), row.nonce)
      cipher.setAAD(Buffer.from(`hades-vault:v1:${name}`)); cipher.setAuthTag(row.tag)
      return Buffer.concat([cipher.update(row.ciphertext), cipher.final()]).toString('utf8')
    } catch { throw new Error('VAULT_AUTHENTICATION_FAILED') }
  }
  private row(name: string): Row | undefined { return this.db.prepare('SELECT nonce,ciphertext,tag FROM vault_secrets WHERE name=?').get(name) as Row | undefined }
  private verify(): void {
    this.requireKey()
    const marker = this.row(SENTINEL)
    if (marker && this.decrypt(SENTINEL, marker) !== CHECK) throw new Error('VAULT_AUTHENTICATION_FAILED')
    if (!marker && (this.db.prepare('SELECT 1 FROM vault_secrets LIMIT 1').get())) throw new Error('VAULT_AUTHENTICATION_FAILED')
  }
  private insert(name: string, value: string): void {
    const r = this.encrypt(name, value)
    this.db.prepare('INSERT INTO vault_secrets (name,nonce,ciphertext,tag,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET nonce=excluded.nonce,ciphertext=excluded.ciphertext,tag=excluded.tag,updated_at=excluded.updated_at').run(name, r.nonce, r.ciphertext, r.tag, Date.now())
  }
  private fingerprint(name: string): string { return createHash('sha256').update(name).digest('hex') }
  put(name: string, value: string, actor: string): void {
    this.name(name)
    if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > 16384) throw new Error('VAULT_VALUE_INVALID')
    this.db.transaction(() => {
      this.verify()
      if (!this.row(SENTINEL)) this.insert(SENTINEL, CHECK)
      this.insert(name, value)
      this.audit(actor, 'VAULT_SECRET_STORED', this.fingerprint(name))
    })()
  }
  /** Intended for trusted backend consumers only; never return through an HTTP endpoint. */
  get(name: string, actor: string): string | undefined {
    this.name(name); this.verify()
    const row = this.row(name)
    if (!row) return undefined
    const value = this.decrypt(name, row)
    this.audit(actor, 'VAULT_SECRET_ACCESSED', this.fingerprint(name))
    return value
  }
  list(): Array<{ name: string; updatedAt: number }> {
    this.verify()
    return (this.db.prepare('SELECT name,updated_at FROM vault_secrets WHERE name != ? ORDER BY name').all(SENTINEL) as Array<{ name: string; updated_at: number }>).map(r => ({ name: r.name, updatedAt: r.updated_at }))
  }
  delete(name: string, actor: string): boolean {
    this.name(name)
    return this.db.transaction(() => {
      this.verify()
      const deleted = this.db.prepare('DELETE FROM vault_secrets WHERE name=?').run(name).changes === 1
      if (deleted) this.audit(actor, 'VAULT_SECRET_DELETED', this.fingerprint(name))
      return deleted
    })()
  }
  /** Call only during a coordinated maintenance window after safely staging the new external key. */
  rotate(encodedKey: string, actor: string): void {
    const next = /^[A-Za-z0-9+/]{43}=$/.test(encodedKey) ? Buffer.from(encodedKey, 'base64') : null
    if (!next || next.length !== 32 || next.toString('base64') !== encodedKey) throw new Error('VAULT_KEY_INVALID')
    const old = this.requireKey()
    if (old.equals(next)) throw new Error('VAULT_KEY_UNCHANGED')
    try {
      this.db.transaction(() => {
        this.verify()
        const rows = this.db.prepare('SELECT name,nonce,ciphertext,tag FROM vault_secrets').all() as Array<Row & { name: string }>
        const plaintext = rows.map(row => ({ name: row.name, value: this.decrypt(row.name, row) }))
        this.key = next
        for (const row of plaintext) this.insert(row.name, row.value)
        if (!rows.length) this.insert(SENTINEL, CHECK)
        this.audit(actor, 'VAULT_KEY_ROTATED', `entries=${Math.max(0, rows.length - 1)}`)
      })()
    } catch (e) { this.key = old; throw e }
  }
}
