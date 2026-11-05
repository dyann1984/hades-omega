import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { SqliteRepository } from './sqlite.js'

export interface RotationReport { backupFile: string; entries: number; verified: true }

/**
 * Operator-driven rotation of the Vault master key. The caller must have stopped every other HADES process that uses
 * the same database (see docs/vault-secrets.md). Keys are passed in, never read from argv; nothing secret is returned.
 * Steps: refuse unsafe inputs, take a consistent backup, rotate in one transaction, then prove the new key opens the
 * vault with the same entries and the old key no longer does. A failed rotation leaves the database unchanged.
 */
export async function rotateVaultKey(opts: { dbFile: string; legacyFile?: string; oldKey: string; newKey: string; backupFile: string; actor: string }): Promise<RotationReport> {
  if (!opts.oldKey || !opts.newKey) throw new Error('KEYS_REQUIRED')
  if (opts.oldKey === opts.newKey) throw new Error('VAULT_KEY_UNCHANGED')
  if (!existsSync(opts.dbFile)) throw new Error('DB_NOT_FOUND')
  if (existsSync(opts.backupFile)) throw new Error('BACKUP_EXISTS')

  // Backup first, then confirm it is readable; abort before touching anything if it is not.
  const src = new Database(opts.dbFile, { readonly: true })
  try { src.exec(`VACUUM INTO '${opts.backupFile.replace(/\\/g, '/').replace(/'/g, "''")}'`) } finally { src.close() }
  const backup = new Database(opts.backupFile, { readonly: true })
  try { if (backup.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('BACKUP_CORRUPT') } finally { backup.close() }

  const legacy = opts.legacyFile ?? `${opts.dbFile}.legacy.json`
  const repo = new SqliteRepository(opts.dbFile, legacy)
  let entries: number
  try {
    await repo.init()
    const before = repo.createSecretVault(opts.oldKey)
    entries = before.list().length // fails with VAULT_AUTHENTICATION_FAILED when the current key is wrong
    before.rotate(opts.newKey, opts.actor)
  } finally { repo.close() }

  // Independent verification with a fresh connection.
  const check = new SqliteRepository(opts.dbFile, legacy)
  try {
    await check.init()
    if (check.createSecretVault(opts.newKey).list().length !== entries) throw new Error('VERIFY_COUNT_MISMATCH')
    let oldStillWorks = true
    try { check.createSecretVault(opts.oldKey).list() } catch { oldStillWorks = false }
    if (oldStillWorks) throw new Error('VERIFY_OLD_KEY_ACCEPTED')
  } finally { check.close() }
  return { backupFile: opts.backupFile, entries, verified: true }
}
