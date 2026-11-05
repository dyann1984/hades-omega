import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { SqliteRepository } from './sqlite.js'

const run = promisify(execFile)
const script = resolve(process.cwd(), '../../scripts/verify-audit-chain.cjs')
const GENESIS = 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000'
const dirs: string[] = []
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }) })

async function seeded(n = 5) {
  const dir = await mkdtemp(join(tmpdir(), 'hades-chain-')); dirs.push(dir)
  const file = join(dir, 'h.sqlite'), legacy = join(dir, 'none.json')
  const repo = new SqliteRepository(file, legacy); await repo.init()
  for (let i = 0; i < n; i++) repo.recordAuditEvent({ actor: 'a', action: `ACT${i}`, result: 'ok' })
  return { repo, file, legacy, dir }
}
const raw = (file: string) => new Database(file)
const lastRows = (db: Database.Database) => db.prepare('SELECT rowid AS r, * FROM audit_events WHERE hash IS NOT NULL ORDER BY rowid DESC').all() as Array<{ r: number; id: string; hash: string; prev_hash: string }>

describe('audit chain hardening (C-3)', () => {
  it('detects an altered LAST event whose hash was nulled to look like a legacy row', async () => {
    const { repo, file } = await seeded()
    const db = raw(file)
    db.prepare("UPDATE audit_events SET result='TAMPERED', hash=NULL WHERE rowid=(SELECT MAX(rowid) FROM audit_events)").run(); db.close()
    const v = repo.verifyAuditIntegrity()
    repo.close()
    expect(v.verified).toBe(false)
    expect(v.code).toBe('HASH_MISSING')
  })

  it('detects an altered middle event with a nulled hash', async () => {
    const { repo, file } = await seeded()
    const db = raw(file); const rows = lastRows(db)
    db.prepare("UPDATE audit_events SET result='TAMPERED', hash=NULL WHERE id=?").run(rows[2]!.id); db.close()
    const v = repo.verifyAuditIntegrity(); repo.close()
    expect(v.verified).toBe(false)
  })

  it('detects truncation of the tail (events deleted from the end)', async () => {
    const { repo, file } = await seeded()
    const db = raw(file)
    db.prepare('DELETE FROM audit_events WHERE rowid IN (SELECT rowid FROM audit_events ORDER BY rowid DESC LIMIT 2)').run(); db.close()
    const v = repo.verifyAuditIntegrity(); repo.close()
    expect(v.verified).toBe(false)
    expect(v.code).toBe('TRUNCATED')
  })

  it('detects replacing the last event with a different, validly chained one (same count)', async () => {
    const { repo, file } = await seeded()
    const db = raw(file); const [last, prev] = lastRows(db)
    db.prepare('DELETE FROM audit_events WHERE id=?').run(last!.id)
    const id = randomUUID(), ts = Date.now()
    const hash = createHash('sha256').update(`${prev!.hash}|${id}|evil|null|ACT_EVIL|ok|${id}|${ts}`, 'utf8').digest('hex')
    db.prepare('INSERT INTO audit_events (id,actor,mission_id,action,result,correlation_id,timestamp,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?)').run(id, 'evil', null, 'ACT_EVIL', 'ok', id, ts, prev!.hash, hash); db.close()
    const v = repo.verifyAuditIntegrity(); repo.close()
    expect(v.verified).toBe(false)
    expect(v.code).toBe('HEAD_MISMATCH')
  })

  it('still accepts legacy rows without hash that precede the first hashed event, and reports head and counts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-chain-')); dirs.push(dir)
    const file = join(dir, 'h.sqlite'), legacy = join(dir, 'none.json')
    let repo = new SqliteRepository(file, legacy); await repo.init(); repo.close()
    const db = raw(file)
    // Reproduce a pre-migration database: unhashed rows only, no chain and an empty anchor yet.
    db.exec('DELETE FROM audit_events; UPDATE audit_anchor SET count = 0, head_hash = NULL')
    for (let i = 0; i < 2; i++) db.prepare('INSERT INTO audit_events (id,actor,mission_id,action,result,correlation_id,timestamp) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), 'old', null, 'LEGACY', 'ok', 'c', 1 + i)
    db.close()
    repo = new SqliteRepository(file, legacy); await repo.init()
    const a = repo.recordAuditEvent({ actor: 'a', action: 'NEW', result: 'ok' })
    const v = repo.verifyAuditIntegrity(); repo.close()
    // 2 legacy rows (unhashed) + POLICY_ACTIVE written by init() + NEW: only the last two are chained.
    expect(v).toMatchObject({ verified: true, hashedEvents: 2, headHash: a.hash })
    expect(v.totalEvents).toBe(4)
  })

  it('creates the anchor from existing data when an older database is opened (migration compatibility)', async () => {
    const { repo, file, legacy } = await seeded(4)
    const probe = raw(file); const head = lastRows(probe)[0]!.hash; probe.close()
    repo.close()
    const db = raw(file); db.exec('DROP TABLE audit_anchor'); db.prepare('DELETE FROM schema_migrations WHERE version = 13').run(); db.close()
    const again = new SqliteRepository(file, legacy); await again.init()
    const v = again.verifyAuditIntegrity(); again.close()
    expect(v.verified).toBe(true)
    expect(v.anchor).toMatchObject({ count: v.hashedEvents, headHash: head })
  })

  it('keeps the anchor in step with every event, including those written inside a transaction', async () => {
    const { repo, file } = await seeded(2)
    const before = repo.verifyAuditIntegrity().anchor!.count
    repo.createChronos(() => Date.now()).create({ title: 'Anchor check', kind: 'APPROVALS_DIGEST', cron: '0 * * * *' }, 'admin')
    const v = repo.verifyAuditIntegrity(); repo.close()
    expect(v.verified).toBe(true)
    expect(v.anchor!.count).toBe(before + 1)
    expect(v.anchor!.count).toBe(v.hashedEvents)
    void file
  })
})

describe('independent read-only verifier (scripts/verify-audit-chain.cjs)', () => {
  const exec = (args: string[]) => run(process.execPath, [script, ...args]).then(r => ({ code: 0, out: JSON.parse(r.stdout) }), (e: { code: number; stdout: string }) => ({ code: e.code, out: JSON.parse(e.stdout || '{}') }))

  it('verifies an intact chain without writing and reports head and count', async () => {
    const { repo, file } = await seeded(); repo.close()
    const r = await exec(['--db', file, '--json'])
    expect(r.code).toBe(0)
    expect(r.out).toMatchObject({ verdict: 'PASS', hashedEvents: 6 }) // POLICY_ACTIVE from init() + 5 seeded events
    expect(r.out.headHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fails on alteration and on truncation, even when the in-database anchor was also rewritten', async () => {
    const { repo, file } = await seeded(); repo.close()
    const headBefore = (await exec(['--db', file, '--json'])).out
    const db = raw(file)
    db.prepare('DELETE FROM audit_events WHERE rowid = (SELECT MAX(rowid) FROM audit_events)').run()
    db.prepare('UPDATE audit_anchor SET count = count - 1, head_hash = (SELECT hash FROM audit_events ORDER BY rowid DESC LIMIT 1)').run(); db.close()
    expect((await exec(['--db', file, '--json'])).code).toBe(0) // internally consistent: only an external anchor can notice
    const external = await exec(['--db', file, '--json', '--expect-count', String(headBefore.hashedEvents), '--expect-head', headBefore.headHash])
    expect(external.code).toBe(1)
    expect(external.out.verdict).toBe('FAIL')
    const db2 = raw(file); db2.prepare("UPDATE audit_events SET result='X' WHERE rowid = (SELECT MIN(rowid) FROM audit_events WHERE hash IS NOT NULL)").run(); db2.close()
    expect((await exec(['--db', file, '--json'])).code).toBe(1)
  })

  it('exits 2 on usage errors and never modifies the database file', async () => {
    const r = await exec(['--json'])
    expect(r.code).toBe(2)
    const { repo, file } = await seeded(); repo.close()
    const count = () => { const d = raw(file); try { return (d.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n } finally { d.close() } }
    const before = count()
    await exec(['--db', file, '--json'])
    expect(count()).toBe(before)
    void GENESIS
  })
})
