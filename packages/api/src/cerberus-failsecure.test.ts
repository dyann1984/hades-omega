import Database from 'better-sqlite3'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOLS, GATE_CODES, ToolRegistry } from '@hades/core'
import { CerberusGate } from './cerberus-gate.js'
import { SqliteRepository } from './sqlite.js'

const T0 = Date.UTC(2026, 10, 2, 12, 0, 0)
const docs = [{ filename: 'a.txt', content: 'Precio $11,111 MXN, SLA 99%.' }, { filename: 'b.txt', content: 'Precio $22,222 MXN, penalización 4%.' }, { filename: 'c.txt', content: 'Precio $33,333 MXN, sin garantía.' }]

function gateWith(extra: ConstructorParameters<typeof ToolRegistry>[0] = []) {
  const audit: Array<{ action: string; result: string; actor: string }> = []
  const registry = new ToolRegistry([...DEFAULT_TOOLS, ...extra])
  const db = new Database(':memory:')
  const gate = new CerberusGate(db, registry, { policyHash: () => 'p1', audit: e => { audit.push(e) }, clock: () => T0 })
  gate.addRecipient('payment.execute', 'acme-supplies', 'admin')
  return { gate, db, audit }
}
const pay = (amount: number) => ({ tool: 'payment.execute', agent: 'PERSEPHONE', role: 'OPERATOR' as const, source: 'AGENT' as const, params: { recipient: 'acme-supplies', amount, currency: 'MXN' }, actor: 'p' })

describe('C-1: the gate fails closed on internal errors', () => {
  const explode = { id: 'test.explode', description: 'throws', effect: 'READ' as const, agents: ['HADES' as const], roles: ['ADMIN' as const], allowedParams: [] as string[], validate: () => { throw new Error('kaput-internal-detail') } }
  it('answers DENY GATE_INTERNAL_ERROR (never an exception), records it, and leaks no internal detail', () => {
    const { gate, audit } = gateWith([explode])
    const d = gate.authorize({ tool: 'test.explode', agent: 'HADES', role: 'ADMIN', source: 'API', params: {}, actor: 'a' })
    expect(d).toMatchObject({ outcome: 'DENY', code: 'GATE_INTERNAL_ERROR' })
    expect(d.reason).not.toContain('kaput')
    expect((gate.listDecisions(1)[0] as { code: string; outcome: string })).toMatchObject({ code: 'GATE_INTERNAL_ERROR', outcome: 'DENY' })
    expect(audit.some(e => e.action === 'CERBERUS_GATE' && e.result.startsWith('DENY:GATE_INTERNAL_ERROR'))).toBe(true)
    expect(d.grantId).toBeUndefined()
  })
  it('keeps serving other requests after an internal error', () => {
    const { gate } = gateWith([explode])
    gate.authorize({ tool: 'test.explode', agent: 'HADES', role: 'ADMIN', source: 'API', params: {}, actor: 'a' })
    expect(gate.authorize(pay(10)).code).toBe('APPROVAL_REQUIRED')
  })
})

describe('C-7: the gate only emits catalogued codes', () => {
  it('every code literal used in cerberus-gate.ts is in GATE_CODES', async () => {
    const src = await readFile(join(process.cwd(), 'src/cerberus-gate.ts'), 'utf8')
    const used = new Set<string>()
    for (const m of src.matchAll(/deny\('([A-Z_]+)'/g)) used.add(m[1]!)
    for (const m of src.matchAll(/code: '([A-Z_]+)'/g)) used.add(m[1]!)
    expect(used.size).toBeGreaterThan(10)
    for (const code of used) expect(Object.keys(GATE_CODES), code).toContain(code)
  })
})

describe('C-8: revocations leave one governance event each', () => {
  it('emits CERBERUS_APPROVAL_REVOKED per revoked approval, then the stop event', () => {
    const { gate, audit } = gateWith()
    const a = gate.authorize(pay(10)).approvalId!, b = gate.authorize(pay(20)).approvalId!
    gate.decide(b, 'APPROVED', 'human', 'checked invoice', 600_000)
    audit.length = 0
    gate.setStopped(true, 'root')
    const revoked = audit.filter(e => e.action === 'CERBERUS_APPROVAL_REVOKED').map(e => e.result.split(':').at(-1)).sort()
    expect(revoked).toEqual([a, b].sort())
    expect(audit.at(-1)).toMatchObject({ action: 'EMERGENCY_STOP', actor: 'root' })
    audit.length = 0
    gate.setStopped(true, 'root') // already stopped and nothing left to revoke: no duplicate revocation events
    expect(audit.filter(e => e.action === 'CERBERUS_APPROVAL_REVOKED')).toHaveLength(0)
  })
})

describe('C-8: the policy in force is recorded in the audit chain', () => {
  it('records POLICY_ACTIVE once per distinct policy hash across restarts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-policy-active-'))
    try {
      const file = join(dir, 'h.sqlite'), legacy = join(dir, 'none.json')
      const open = async () => { const r = new SqliteRepository(file, legacy); await r.init(); return r }
      let r = await open()
      const first = r.listAuditEvents({ action: 'POLICY_ACTIVE', limit: 10, offset: 0 })
      expect(first).toHaveLength(1)
      expect(first[0]!.result).toMatch(/^policy=[0-9a-f]{16}\|tools=[0-9a-f]{16}$/)
      r.close(); r = await open()
      expect(r.listAuditEvents({ action: 'POLICY_ACTIVE', limit: 10, offset: 0 })).toHaveLength(1) // unchanged policy: no new event
      expect(r.verifyAuditIntegrity().verified).toBe(true)
      r.close()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

describe('C-1: startup recovery honours the emergency stop', () => {
  it('does not resume an APPROVED mission while stopped, and resumes it at the next start once the stop is lifted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-stop-recovery-'))
    const dbPath = join(dir, 'db.sqlite'), legacy = join(dir, 'none.json')
    try {
      const s1 = new SqliteRepository(dbPath, legacy); await s1.init()
      const { mission, approvalId } = await s1.createMultiDocumentMission('alice', 'Stop recovery', docs)
      s1.close()
      const patch = new Database(dbPath)
      patch.prepare("UPDATE local_operations SET state='APPROVED' WHERE id=?").run(approvalId)
      const row = patch.prepare('SELECT data FROM missions WHERE id=?').get(mission.id) as { data: string }
      const data = JSON.parse(row.data) as { tasks: Array<{ id: string; status: string }>; status: string }
      data.tasks[3]!.status = 'QUEUED'; data.tasks[4]!.status = 'QUEUED'; data.status = 'IN_PROGRESS'
      patch.prepare('UPDATE missions SET data=? WHERE id=?').run(JSON.stringify(data), mission.id)
      for (const i of [3, 4]) patch.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(data.tasks[i]), data.tasks[i]!.id)
      patch.prepare('UPDATE near_security SET stopped=1 WHERE id=1').run()
      patch.close()

      const s2 = new SqliteRepository(dbPath, legacy); await s2.init()
      expect(s2.getMission(mission.id)?.status).toBe('IN_PROGRESS') // not executed while stopped
      expect(s2.listAuditEvents({ limit: 100, offset: 0 }).some(e => e.action === 'STARTUP_RECOVERY' && e.result === 'APPROVED_RESUME_SKIPPED:EMERGENCY_STOP')).toBe(true)
      expect(s2.listAuditEvents({ limit: 100, offset: 0 }).some(e => e.result === 'APPROVED_RESUMED')).toBe(false)
      s2.gate.setStopped(false, 'admin'); s2.close()

      const s3 = new SqliteRepository(dbPath, legacy); await s3.init()
      expect(s3.getMission(mission.id)?.status).toBe('COMPLETED')
      s3.close()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
