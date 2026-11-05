import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteRepository } from './sqlite.js'
import { rotateVaultKey } from './vault-rotation.js'

const key = () => randomBytes(32).toString('base64')
const dirs: string[] = []
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }) })

async function seeded(oldKey: string) {
  const dir = await mkdtemp(join(tmpdir(), 'hades-rot-')); dirs.push(dir)
  const dbFile = join(dir, 'h.sqlite'), legacyFile = join(dir, 'none.json')
  const repo = new SqliteRepository(dbFile, legacyFile); await repo.init()
  const vault = repo.createSecretVault(oldKey)
  vault.put('SERVICE_TOKEN', 'canary-rotation-value-77', 'admin'); vault.put('OTHER_SECRET', 'second-value', 'admin')
  repo.close()
  return { dir, dbFile, legacyFile }
}
const open = async (dbFile: string, legacyFile: string) => { const r = new SqliteRepository(dbFile, legacyFile); await r.init(); return r }

describe('operational vault key rotation', () => {
  it('backs up, rotates, verifies the new key and rejects the old one, without leaking secrets in the report', async () => {
    const oldKey = key(), newKey = key(), { dir, dbFile, legacyFile } = await seeded(oldKey)
    const backupFile = join(dir, 'pre-rotation.bak')
    const report = await rotateVaultKey({ dbFile, legacyFile, oldKey, newKey, backupFile, actor: 'operator:test' })
    expect(report).toEqual({ backupFile, entries: 2, verified: true })
    expect(JSON.stringify(report)).not.toContain('canary-rotation-value-77')
    const repo = await open(dbFile, legacyFile)
    try {
      expect(repo.createSecretVault(newKey).get('SERVICE_TOKEN', 'svc')).toBe('canary-rotation-value-77')
      expect(() => repo.createSecretVault(oldKey).list()).toThrow('VAULT_AUTHENTICATION_FAILED')
      expect(repo.verifyAuditIntegrity().verified).toBe(true)
    } finally { repo.close() }
    // The backup still opens with the OLD key: it is a valid rollback point.
    const rollback = await open(backupFile, legacyFile)
    try { expect(rollback.createSecretVault(oldKey).get('OTHER_SECRET', 'svc')).toBe('second-value') } finally { rollback.close() }
    expect((await readFile(dbFile)).includes(Buffer.from('canary-rotation-value-77'))).toBe(false)
  })

  it('aborts without changing anything when the current key is wrong, keys are equal, or the backup already exists', async () => {
    const oldKey = key(), { dir, dbFile, legacyFile } = await seeded(oldKey)
    const backupFile = join(dir, 'b1.bak')
    await expect(rotateVaultKey({ dbFile, legacyFile, oldKey: key(), newKey: key(), backupFile, actor: 'op' })).rejects.toThrow('VAULT_AUTHENTICATION_FAILED')
    await expect(rotateVaultKey({ dbFile, legacyFile, oldKey, newKey: oldKey, backupFile: join(dir, 'b2.bak'), actor: 'op' })).rejects.toThrow('VAULT_KEY_UNCHANGED')
    expect(existsSync(join(dir, 'b2.bak'))).toBe(false)
    // The wrong-key attempt took a backup before failing; reusing that path must be refused, not overwritten.
    await expect(rotateVaultKey({ dbFile, legacyFile, oldKey, newKey: key(), backupFile, actor: 'op' })).rejects.toThrow('BACKUP_EXISTS')
    // Database is untouched: the original key still opens it.
    const repo = await open(dbFile, legacyFile)
    try { expect(repo.createSecretVault(oldKey).get('SERVICE_TOKEN', 'svc')).toBe('canary-rotation-value-77') } finally { repo.close() }
  })
})
