import Database from 'better-sqlite3'
import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CerberusGUARD, NEARBridge, createDefaultToolRegistry } from '@hades/core'
import { CerberusGate, GateError, type AuthorizeRequest } from './cerberus-gate.js'
import { SqliteRepository } from './sqlite.js'
import { registerSecurity } from './security.js'
import { cerberusRoutes } from './routes/cerberus.js'
import { chronosRoutes, registerChronosTick } from './routes/chronos.js'
import { JOB_REGISTRY } from './chronos/chronos.js'

const T0 = Date.UTC(2026, 10, 2, 12, 0, 0)
const MIN = 60_000
const PAY = { recipient: 'acme-supplies', amount: 1000, currency: 'MXN' }
const NEAR_TX = { network: 'testnet', signerId: 'source.testnet', receiverId: 'audit.testnet', type: 'AUDIT_HASH', amountYocto: '0', auditId: 'a-1', contentHash: 'a'.repeat(64), operationType: 'PLANNING', agentName: 'HADES', decision: 'PERMIT', timestampMs: 1700000000000, gas: '30000000000000' }

function setup(db = new Database(':memory:'), clockRef = { now: T0 }, policy = { hash: 'policy-1' }) {
  const audit: Array<{ action: string; result: string }> = []
  const gate = new CerberusGate(db, createDefaultToolRegistry(), { policyHash: () => policy.hash, audit: e => { audit.push(e) }, clock: () => clockRef.now })
  gate.addRecipient('payment.execute', 'acme-supplies', 'admin')
  gate.addRecipient('near.audit_hash_submit', 'audit.testnet', 'admin')
  return { db, gate, clock: clockRef, policy, audit }
}
const pay = (over: Partial<AuthorizeRequest> = {}, params: Record<string, unknown> = PAY): AuthorizeRequest =>
  ({ tool: 'payment.execute', agent: 'PERSEPHONE', role: 'OPERATOR', source: 'AGENT', params, actor: 'persephone', ...over })

/** Request -> human approval -> returns the approval id ready to be consumed. */
function approved(g: ReturnType<typeof setup>, params: Record<string, unknown> = PAY, ttl = 10 * MIN): string {
  const ask = g.gate.authorize(pay({}, params))
  expect(ask).toMatchObject({ outcome: 'ESCALATE', code: 'APPROVAL_REQUIRED' })
  g.gate.decide(ask.approvalId!, 'APPROVED', 'human-admin', 'checked invoice and vendor', ttl)
  return ask.approvalId!
}

describe('CERBERUS gate: classification and default deny', () => {
  it('permits a legitimate read and records it', () => {
    const { gate, audit } = setup()
    const d = gate.authorize({ tool: 'chronos.approvals_digest', agent: 'HADES', role: 'SYSTEM', source: 'CHRONOS', params: {}, actor: 'chronos:t1' })
    expect(d).toMatchObject({ outcome: 'PERMIT', code: 'OK' })
    expect(gate.listDecisions(5)).toContainEqual(expect.objectContaining({ id: d.decisionId, outcome: 'PERMIT', effect: 'READ' }))
    expect(audit.some(a => a.action === 'CERBERUS_GATE' && a.result.startsWith('PERMIT:OK'))).toBe(true)
  })
  it('blocks unknown tools however they are spelled', () => {
    const { gate } = setup()
    for (const tool of ['shell.exec', 'Payment.Execute', 'payment.execute ', 'payment', 'payment.execute​', '__proto__', 'constructor', '', undefined, null, 7, {}, ['payment.execute']]) {
      expect(gate.authorize(pay({ tool }))).toMatchObject({ outcome: 'DENY', code: 'UNKNOWN_TOOL' })
    }
    expect(gate.listDecisions(50)).toHaveLength(13)
  })
  it('enforces agent and role policy per tool', () => {
    const { gate } = setup()
    expect(gate.authorize(pay({ agent: 'CHARON' }))).toMatchObject({ outcome: 'DENY', code: 'AGENT_NOT_PERMITTED' })
    for (const role of ['VIEWER', 'AUDITOR', 'DEMO'] as const) expect(gate.authorize(pay({ role }))).toMatchObject({ outcome: 'DENY', code: 'ROLE_NOT_PERMITTED' })
    expect(gate.authorize({ tool: 'near.account_view', agent: 'HADES', role: 'DEMO', source: 'API', params: { accountId: 'a.testnet' }, actor: 'demo' })).toMatchObject({ outcome: 'DENY', code: 'ROLE_NOT_PERMITTED' })
  })
  it('validates amounts, currency, limits and rejects extra or smuggled arguments', () => {
    const { gate } = setup()
    for (const amount of [0, -5, '1000', null, undefined]) expect(gate.authorize(pay({}, { ...PAY, amount })), String(amount)).toMatchObject({ outcome: 'DENY', code: 'INVALID_AMOUNT' })
    for (const amount of [NaN, Infinity, -Infinity]) expect(gate.authorize(pay({}, { ...PAY, amount })), String(amount)).toMatchObject({ outcome: 'DENY', code: 'INVALID_PARAMS' }) // non-JSON numbers never get as far as amount checks
    expect(gate.authorize(pay({}, { ...PAY, currency: 'USD' }))).toMatchObject({ code: 'INVALID_AMOUNT' })
    expect(gate.authorize(pay({}, { ...PAY, amount: 50_001 }))).toMatchObject({ outcome: 'DENY', code: 'AMOUNT_LIMIT' })
    for (const extra of [{ destination: 'attacker' }, { memo: 'x' }, { privateKey: 'k' }, { ['__proto__']: 1 }]) expect(gate.authorize(pay({}, { ...PAY, ...extra })), JSON.stringify(extra)).toMatchObject({ outcome: 'DENY', code: 'INVALID_PARAMS' })
    for (const bad of [[], 'str', 42, null, new Date()]) expect(gate.authorize(pay({ params: bad as never }))).toMatchObject({ outcome: 'DENY', code: 'INVALID_PARAMS' })
    expect(gate.authorize(pay({ params: JSON.parse('{"recipient":"acme-supplies","amount":1,"currency":"MXN","__proto__":{"x":1}}') }))).toMatchObject({ outcome: 'DENY', code: 'INVALID_PARAMS' })
  })
  it('only pays recipients on the allowlist', () => {
    const { gate } = setup()
    expect(gate.authorize(pay({}, { ...PAY, recipient: 'attacker-llc' }))).toMatchObject({ outcome: 'DENY', code: 'RECIPIENT_NOT_ALLOWED' })
    gate.removeRecipient('payment.execute', 'acme-supplies', 'admin')
    expect(gate.authorize(pay())).toMatchObject({ outcome: 'DENY', code: 'RECIPIENT_NOT_ALLOWED' })
    expect(() => gate.addRecipient('chronos.approvals_digest', 'x', 'admin')).toThrow(GateError)
  })
})

describe('CERBERUS gate: one-time human approvals', () => {
  let g: ReturnType<typeof setup>
  beforeEach(() => { g = setup() })

  it('blocks an unauthorized financial operation: no execution without approval', () => {
    const first = g.gate.authorize(pay())
    expect(first.outcome).toBe('ESCALATE')
    expect(first.grantId).toBeUndefined()
    // Asking again while pending, or presenting the still-pending approval, never permits.
    expect(g.gate.authorize(pay({ approvalId: first.approvalId }))).toMatchObject({ outcome: 'ESCALATE', code: 'APPROVAL_PENDING' })
    expect(g.gate.authorize(pay({ approvalId: 'made-up' }))).toMatchObject({ outcome: 'DENY', code: 'APPROVAL_NOT_FOUND' })
    expect(g.gate.authorize(pay()).approvalId).toBe(first.approvalId) // identical pending request is not duplicated
  })
  it('permits exactly once after approval and rejects reuse', () => {
    const id = approved(g)
    const run = g.gate.authorize(pay({ approvalId: id }))
    expect(run).toMatchObject({ outcome: 'PERMIT', code: 'OK' })
    expect(g.gate.authorize(pay({ approvalId: id }))).toMatchObject({ outcome: 'DENY', code: 'APPROVAL_REUSED' })
    g.gate.consumeGrant(run.grantId!, 'payment.execute', PAY)
    expect(() => g.gate.consumeGrant(run.grantId!, 'payment.execute', PAY)).toThrow('GRANT_REUSED')
  })
  it('rejects an expired approval and an expired request', () => {
    const id = approved(g, PAY, 5 * MIN)
    g.clock.now += 5 * MIN + 1
    expect(g.gate.authorize(pay({ approvalId: id }))).toMatchObject({ outcome: 'DENY', code: 'APPROVAL_EXPIRED' })
    const late = g.gate.authorize(pay({}, { ...PAY, amount: 7 }))
    g.clock.now += 25 * 3_600_000
    expect(() => g.gate.decide(late.approvalId!, 'APPROVED', 'human-admin', 'too late')).toThrow('APPROVAL_EXPIRED')
    expect(() => g.gate.decide(late.approvalId!, 'APPROVED', 'human-admin', 'x'.repeat(3), 16 * MIN)).toThrow(GateError)
  })
  it('limits approval validity to 15 minutes', () => {
    const ask = g.gate.authorize(pay())
    expect(() => g.gate.decide(ask.approvalId!, 'APPROVED', 'human-admin', 'ok then', 16 * MIN)).toThrow('INVALID_EXPIRY')
  })
  it('rejects any alteration of the approved operation, and the original still works', () => {
    const id = approved(g)
    for (const altered of [{ ...PAY, amount: 1001 }, { ...PAY, amount: 999 }, { ...PAY, recipient: 'other' }, { ...PAY, currency: 'MXN', amount: 1000.01 }]) {
      g.gate.addRecipient('payment.execute', String(altered.recipient), 'admin')
      expect(g.gate.authorize(pay({ approvalId: id }, altered)), JSON.stringify(altered)).toMatchObject({ outcome: 'DENY', code: 'PARAMS_ALTERED' })
    }
    expect(g.gate.authorize(pay({ approvalId: id }))).toMatchObject({ outcome: 'PERMIT' })
  })
  it('cannot use an approval for a different tool or agent', () => {
    const id = approved(g)
    g.gate.addRecipient('near.audit_hash_submit', 'audit.testnet', 'admin')
    expect(g.gate.authorize({ tool: 'near.audit_hash_submit', agent: 'HADES', role: 'ADMIN', source: 'NEAR', params: NEAR_TX, actor: 'x', approvalId: id })).toMatchObject({ outcome: 'DENY', code: 'PARAMS_ALTERED' })
  })
  it('honours a rejection', () => {
    const ask = g.gate.authorize(pay())
    g.gate.decide(ask.approvalId!, 'REJECTED', 'human-admin', 'vendor not verified')
    expect(g.gate.authorize(pay({ approvalId: ask.approvalId }))).toMatchObject({ outcome: 'DENY', code: 'APPROVAL_REJECTED' })
    expect(() => g.gate.decide(ask.approvalId!, 'APPROVED', 'human-admin', 'changed my mind')).toThrow('APPROVAL_ALREADY_DECIDED')
  })
  it('invalidates outstanding approvals when policy changes', () => {
    const id = approved(g)
    g.policy.hash = 'policy-2'
    expect(g.gate.authorize(pay({ approvalId: id }))).toMatchObject({ outcome: 'DENY', code: 'POLICY_CHANGED' })
  })
  it('automation can never approve its own request; a human admin on the API can', () => {
    const bot = g.gate.authorize(pay({ source: 'CHRONOS', actor: 'chronos:t1', role: 'SYSTEM' }))
    expect(() => g.gate.decide(bot.approvalId!, 'APPROVED', 'chronos:t1', 'self approve')).toThrow('SELF_APPROVAL_FORBIDDEN')
    const human = g.gate.authorize(pay({ source: 'API', actor: 'admin', role: 'ADMIN' }, { ...PAY, amount: 5 }))
    expect(() => g.gate.decide(human.approvalId!, 'APPROVED', 'admin', 'reviewed')).not.toThrow()
  })
  it('grants are bound to the exact params, short-lived and single-use', () => {
    const id = approved(g)
    const run = g.gate.authorize(pay({ approvalId: id }))
    expect(() => g.gate.consumeGrant(run.grantId!, 'payment.execute', { ...PAY, amount: 2000 })).toThrow('GRANT_PARAMS_ALTERED')
    expect(() => g.gate.consumeGrant(run.grantId!, 'near.audit_hash_submit', PAY)).toThrow('GRANT_TOOL_MISMATCH')
    expect(() => g.gate.consumeGrant('forged', 'payment.execute', PAY)).toThrow('GRANT_INVALID')
    const denied = g.gate.authorize(pay({ approvalId: id }))
    expect(() => g.gate.consumeGrant(denied.decisionId, 'payment.execute', PAY)).toThrow('GRANT_INVALID') // a DENY is not a grant
    g.clock.now += 3 * MIN
    expect(() => g.gate.consumeGrant(run.grantId!, 'payment.execute', PAY)).toThrow('GRANT_EXPIRED')
  })
})

describe('CERBERUS gate: emergency stop and budgets', () => {
  it('stop is persistent and blocks new tool executions, including reads and already granted actions', () => {
    const dir = new Database(':memory:'), g = setup(dir)
    const id = approved(g)
    const run = g.gate.authorize(pay({ approvalId: id }))
    const pendingApproved = approved(g, { ...PAY, amount: 20 })
    g.gate.setStopped(true, 'admin')
    expect(g.gate.authorize(pay({ approvalId: pendingApproved }, { ...PAY, amount: 20 }))).toMatchObject({ outcome: 'DENY', code: 'EMERGENCY_STOP' })
    expect(g.gate.authorize(pay({}, { ...PAY, amount: 21 }))).toMatchObject({ outcome: 'DENY', code: 'EMERGENCY_STOP' })
    expect(() => g.gate.consumeGrant(run.grantId!, 'payment.execute', PAY)).toThrow('EMERGENCY_STOP')
    expect(g.gate.authorize({ tool: 'chronos.approvals_digest', agent: 'HADES', role: 'SYSTEM', source: 'CHRONOS', params: {}, actor: 'c' })).toMatchObject({ outcome: 'DENY', code: 'EMERGENCY_STOP' })
    // "Restart": a new gate on the same database sees the same flag.
    const restarted = new CerberusGate(dir, createDefaultToolRegistry(), { policyHash: () => g.policy.hash, audit: () => {}, clock: () => g.clock.now })
    expect(restarted.isStopped()).toBe(true)
    restarted.setStopped(false, 'admin')
    expect(restarted.authorize(pay({ approvalId: pendingApproved }, { ...PAY, amount: 20 })).outcome).toBe('PERMIT')
  })
  it('enforces the daily budget across consumed approvals and resets the next UTC day', () => {
    const g = setup()
    for (const n of [1, 2]) { const p = { ...PAY, amount: 40_000 + n }; expect(g.gate.authorize(pay({ approvalId: approved(g, p) }, p)).outcome).toBe('PERMIT') }
    const third = { ...PAY, amount: 40_000 }
    expect(g.gate.authorize(pay({}, third))).toMatchObject({ outcome: 'DENY', code: 'BUDGET_EXCEEDED' })
    g.clock.now += 24 * 3_600_000
    expect(g.gate.authorize(pay({}, third)).outcome).toBe('ESCALATE')
  })
  it('two processes racing for one approval: exactly one wins', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gate-'))
    try {
      const file = join(dir, 'race.sqlite')
      const a = setup(new Database(file)), b = setup(new Database(file))
      const id = approved(a)
      const results = [a.gate.authorize(pay({ approvalId: id })), b.gate.authorize(pay({ approvalId: id }))]
      expect(results.map(r => r.outcome).sort()).toEqual(['DENY', 'PERMIT'])
      expect(results.find(r => r.outcome === 'DENY')!.code).toBe('APPROVAL_REUSED')
      a.db.close(); b.db.close()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

describe('integration: CHRONOS, NEAR and agents all go through the gate', () => {
  let dir: string, repo: SqliteRepository
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'gate-int-')); repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init() })
  afterEach(async () => { repo.close(); await rm(dir, { recursive: true, force: true }) })

  it('CHRONOS cannot schedule a job backed by a sensitive tool', () => {
    JOB_REGISTRY['PAY_VENDOR'] = { description: 'x', effect: 'READ_ONLY', idempotent: true, agent: 'PERSEPHONE', tool: 'payment.execute', validate: () => ({ ...PAY }), run: () => 'paid' }
    try { expect(() => repo.chronos.create({ title: 'pay weekly', kind: 'PAY_VENDOR', cron: '0 9 * * 1' }, 'admin')).toThrow(/READ tool/) } finally { delete JOB_REGISTRY['PAY_VENDOR'] }
  })
  it('CHRONOS cannot execute a task whose tool is later re-pointed at a sensitive one, and is never retried', () => {
    const task = repo.chronos.create({ title: 'digest', kind: 'APPROVALS_DIGEST', cron: '0 9 * * *' }, 'admin')
    const job = JOB_REGISTRY['APPROVALS_DIGEST']!, original = job.tool
    let ran = false
    const originalRun = job.run
    job.tool = 'payment.execute'; job.run = () => { ran = true; return 'paid' }
    try {
      const run = repo.chronos.runNow(task.id, 'admin')
      expect(run.status).toBe('FAILED')
      expect(run.error).toMatch(/^CERBERUS_DENIED:/)
      expect(ran).toBe(false)
    } finally { job.tool = original; job.run = originalRun }
    expect(repo.gate.listDecisions(5)).toContainEqual(expect.objectContaining({ source: 'CHRONOS', outcome: 'DENY' }))
  })
  it('CHRONOS may drive a legitimate read, and each run leaves a gate decision', () => {
    const task = repo.chronos.create({ title: 'digest', kind: 'APPROVALS_DIGEST', cron: '0 9 * * *' }, 'admin')
    expect(repo.chronos.runNow(task.id, 'admin').status).toBe('SUCCEEDED')
    expect(repo.gate.listDecisions(5)).toContainEqual(expect.objectContaining({ tool: 'chronos.approvals_digest', source: 'CHRONOS', outcome: 'PERMIT' }))
  })
  it('a sensitive request from CHRONOS can only ever reach ESCALATE', () => {
    const d = repo.gate.authorize({ tool: 'near.audit_hash_submit', agent: 'HADES', role: 'SYSTEM', source: 'CHRONOS', params: NEAR_TX, actor: 'chronos:t' })
    expect(d.outcome).toBe('DENY') // receiver not allowlisted yet
    repo.gate.addRecipient('near.audit_hash_submit', 'audit.testnet', 'admin')
    const again = repo.gate.authorize({ tool: 'near.audit_hash_submit', agent: 'HADES', role: 'SYSTEM', source: 'CHRONOS', params: NEAR_TX, actor: 'chronos:t' })
    expect(again).toMatchObject({ outcome: 'ESCALATE', code: 'APPROVAL_REQUIRED' })
    expect(again.grantId).toBeUndefined()
  })
  it('NEAR: an intent cannot be claimed without a consumed gate approval, and the bridge needs the resulting grant', async () => {
    repo.gate.addRecipient('near.audit_hash_submit', 'audit.testnet', 'admin')
    const store = repo.getNearIntentStore()
    const raw = (repo as unknown as { db: Database.Database }).db
    // Forged state: marked APPROVED directly in the database, with no gate approval behind it.
    const forged = store.create(NEAR_TX, 'op')
    raw.prepare("UPDATE near_intents SET status='APPROVED',expires_at=?,approved_by='forger' WHERE id=?").run(Date.now() + 60_000, forged.id)
    expect(() => store.claimForSigning(forged.id, forged.hash, 'executor')).toThrow('INVALID_STATE')
    // Forged link to a gate approval nobody approved.
    const pending = store.create(NEAR_TX, 'op'); store.requestApproval(pending.id, 'op')
    const link = raw.prepare('SELECT gate_approval_id AS g FROM near_intents WHERE id=?').get(pending.id) as { g: string }
    raw.prepare("UPDATE near_intents SET status='APPROVED',expires_at=? WHERE id=?").run(Date.now() + 60_000, pending.id)
    expect(() => store.claimForSigning(pending.id, pending.hash, 'executor')).toThrow(/POLICY_DENIED:APPROVAL_PENDING/)
    expect(repo.gate.listApprovals('PENDING')).toContainEqual(expect.objectContaining({ id: link.g }))
    // Proper flow.
    const ok = store.create({ ...NEAR_TX, auditId: 'a-2' }, 'op'); store.requestApproval(ok.id, 'op'); store.approve(ok.id, ok.hash, 'admin', Date.now() + 60_000)
    const claimed = store.claimForSigning(ok.id, ok.hash, 'executor')
    expect(claimed).toMatchObject({ status: 'SIGNING' })
    expect(() => store.claimForSigning(ok.id, ok.hash, 'executor')).toThrow() // approval is spent
    const prior = process.env['NEAR_EXECUTION_MODE']; process.env['NEAR_EXECUTION_MODE'] = 'testnet'
    try {
      const bridge = new NEARBridge()
      const tx = { auditId: 'a-2', contentHash: 'a'.repeat(64), operationType: 'PLANNING', agentName: 'HADES', decision: 'PERMIT', timestampMs: 1 }
      await expect(bridge.storeAuditHash(tx, claimed.grantId, claimed.params)).rejects.toThrow('CERBERUS_GATE_REQUIRED')
      bridge.attachGate(repo.gate)
      await expect(bridge.storeAuditHash(tx, claimed.grantId, { ...claimed.params, receiverId: 'evil.testnet' })).rejects.toThrow('GRANT_PARAMS_ALTERED')
      await expect(bridge.storeAuditHash(tx, claimed.grantId, claimed.params)).rejects.toThrow('NEAR_SUBMITTER_NOT_CONFIGURED') // passed CERBERUS; no submitter/signer attached
      await expect(bridge.storeAuditHash(tx, claimed.grantId, claimed.params)).rejects.toThrow('GRANT_REUSED')
    } finally { if (prior === undefined) delete process.env['NEAR_EXECUTION_MODE']; else process.env['NEAR_EXECUTION_MODE'] = prior }
  })
  it('the emergency stop switch used by NEAR is the same one the gate enforces', () => {
    repo.getNearIntentStore().setEmergency(true, 'admin')
    expect(repo.gate.isStopped()).toBe(true)
    expect(repo.gate.authorize(pay({}, PAY))).toMatchObject({ code: 'EMERGENCY_STOP' })
  })
  it('the decision log and the audit hash chain stay consistent and verifiable', () => {
    repo.gate.authorize(pay()); repo.gate.authorize(pay({ tool: 'nope' }))
    expect(repo.listAuditEvents({ action: 'CERBERUS_GATE', limit: 10, offset: 0 }).length).toBeGreaterThanOrEqual(2)
    expect(repo.verifyAuditIntegrity().verified).toBe(true)
  })
  it('a legacy guard is unaffected by gate state while agents still hit R-009', () => {
    expect(new CerberusGUARD().evaluate({ id: 'p', agentId: 'a', agentName: 'CHARON', operationType: 'PAYMENT', payload: { amount: 1, currency: 'MXN' }, missionId: 'm', taskId: 't', requestedAt: 1 }).ruleMatched).toBe('R-009')
  })
})

describe('HTTP: gate administration and protected tick endpoint', () => {
  let dir: string, repo: SqliteRepository, previous: string | undefined
  beforeEach(async () => {
    previous = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    dir = await mkdtemp(join(tmpdir(), 'gate-http-')); repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
  })
  afterEach(async () => { repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = previous })

  it('only ADMIN can decide approvals, edit allowlists and stop the system; decisions are validated', async () => {
    const app = Fastify()
    await registerSecurity(app); await app.register(async a => cerberusRoutes(a, repo), { prefix: '/api/v1' }); await app.ready()
    const call = (role: string, method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({ method, url: `/api/v1${url}`, payload: payload as object, headers: { authorization: `Bearer ${app.jwt.sign({ sub: `${role}-user`, roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } })
    try {
      repo.gate.addRecipient('payment.execute', 'acme-supplies', 'admin')
      const ask = repo.gate.authorize(pay())
      for (const role of ['OPERATOR', 'VIEWER', 'AUDITOR']) {
        expect((await call(role, 'POST', `/cerberus/gate/approvals/${ask.approvalId}/decision`, { status: 'APPROVED', justification: 'fine' })).statusCode, role).toBe(403)
        expect((await call(role, 'POST', '/cerberus/emergency-stop', { stopped: true })).statusCode, role).toBe(403)
        expect((await call(role, 'POST', '/cerberus/gate/recipients/add', { tool: 'payment.execute', recipient: 'x' })).statusCode, role).toBe(403)
      }
      expect(repo.gate.isStopped()).toBe(false)
      expect((await call('ADMIN', 'POST', `/cerberus/gate/approvals/${ask.approvalId}/decision`, { status: 'MAYBE', justification: 'x' })).statusCode).toBe(400)
      expect((await call('ADMIN', 'POST', `/cerberus/gate/approvals/${ask.approvalId}/decision`, { status: 'APPROVED', justification: 'ok' })).statusCode).toBe(409) // justification too short
      expect((await call('ADMIN', 'POST', `/cerberus/gate/approvals/${ask.approvalId}/decision`, { status: 'APPROVED', justification: 'invoice verified' })).statusCode).toBe(200)
      expect((await call('ADMIN', 'POST', `/cerberus/gate/approvals/${ask.approvalId}/decision`, { status: 'APPROVED', justification: 'invoice verified' })).statusCode).toBe(409)
      expect((await call('ADMIN', 'POST', '/cerberus/gate/approvals/nope/decision', { status: 'APPROVED', justification: 'invoice verified' })).statusCode).toBe(404)
      expect((await call('ADMIN', 'POST', '/cerberus/emergency-stop', { stopped: true })).statusCode).toBe(200)
      expect((await call('ADMIN', 'GET', '/cerberus/emergency-stop')).json().data).toEqual({ stopped: true })
      expect(repo.gate.authorize(pay({ approvalId: ask.approvalId })).code).toBe('EMERGENCY_STOP')
      const tools = (await call('ADMIN', 'GET', '/cerberus/gate/tools')).json().data as Array<{ id: string; requiresApproval: boolean }>
      expect(tools.find(t => t.id === 'payment.execute')?.requiresApproval).toBe(true)
      expect(tools.find(t => t.id === 'chronos.approvals_digest')?.requiresApproval).toBe(false)
      expect((await call('ADMIN', 'GET', '/cerberus/gate/decisions')).json().data.length).toBeGreaterThan(0)
    } finally { await app.close() }
  })

  it('/internal/chronos/tick requires the shared secret and runs due tasks', async () => {
    const secret = 's'.repeat(40)
    const app = Fastify()
    await registerSecurity(app, repo)
    expect(registerChronosTick(app, repo, secret)).toBe(true)
    await app.register(async a => chronosRoutes(a, repo), { prefix: '/api/v1' }); await app.ready()
    try {
      const task = repo.chronos.create({ title: 'digest', kind: 'APPROVALS_DIGEST', cron: '* * * * *' }, 'admin')
      const raw = (repo as unknown as { db: Database.Database }).db
      raw.prepare('UPDATE chronos_tasks SET next_run_at=? WHERE id=?').run(Date.now() - 1000, task.id) // make it due now
      const tick = (headers: Record<string, string>, method: 'POST' | 'GET' = 'POST') => app.inject({ method, url: '/internal/chronos/tick', headers })
      for (const headers of [{} as Record<string, string>,{ authorization: 'Bearer wrong' }, { authorization: `Bearer ${secret}x` }, { authorization: `Bearer ${secret.slice(1)}` }, { authorization: secret }, { authorization: `Basic ${secret}` }, { 'x-api-key': secret }]) {
        expect((await tick(headers)).statusCode, JSON.stringify(headers)).toBe(401)
      }
      expect(repo.chronos.runs(task.id)).toHaveLength(0) // unauthenticated calls had no effect
      const ok = await tick({ authorization: `Bearer ${secret}` })
      expect(ok.statusCode).toBe(200)
      expect(ok.json().data).toMatchObject({ started: 1 })
      expect(repo.chronos.runs(task.id)).toHaveLength(1)
      // Idempotent: an immediate second pass finds nothing due (the slot was already claimed).
      expect((await tick({ authorization: `Bearer ${secret}` }, 'GET')).json().data).toMatchObject({ started: 0, retried: 0 })
      // The user API does not accept the tick secret as a session.
      expect((await app.inject({ method: 'GET', url: '/api/v1/chronos/tasks', headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(401)
    } finally { await app.close() }
  })
  it('does not expose the tick endpoint without a strong secret', async () => {
    for (const secret of [undefined, '', 'short-secret']) {
      const app = Fastify()
      expect(registerChronosTick(app, repo, secret)).toBe(false)
      await app.ready()
      expect((await app.inject({ method: 'POST', url: '/internal/chronos/tick', headers: { authorization: `Bearer ${secret ?? ''}` } })).statusCode).toBe(404)
      await app.close()
    }
  })
})
