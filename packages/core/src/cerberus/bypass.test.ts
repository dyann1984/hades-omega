import { afterEach, describe, expect, it } from 'vitest'
import { CerberusGUARD } from './guard.js'
import { CerberusAUDIT } from './audit.js'
import { AgentBase } from '../agents/base.js'
import { NEARBridge, type ExecutionGate } from '../near-bridge/index.js'
import { createDefaultToolRegistry, ToolRegistry, canonicalJson } from './tools.js'
import type { AgentName, Task, TaskResult } from '../types/index.js'

const guard = new CerberusGUARD()
const propose = (agentName: AgentName, operationType: string, payload: unknown) =>
  guard.evaluate({ id: 'p', agentId: `agent:${agentName.toLowerCase()}`, agentName, operationType, payload, missionId: 'm', taskId: 't', requestedAt: 1 })

describe('CERBERUS cannot be bypassed through arguments', () => {
  it('checks every amount in the payload, not just the first key found', () => {
    for (const payload of [
      { totalAmount: 1, amount: 90_000, vendorId: 'inframax' },
      { amount: 1, totalAmount: 90_000, vendorId: 'inframax' },
      { totalAmount: 1, order: { lines: [{ amount: 90_000 }] }, vendorId: 'inframax' },
      { totalAmount: 1, total: '90000', vendorId: 'inframax' },
    ]) expect(propose('CHARON', 'PURCHASE_ORDER', payload), JSON.stringify(payload)).toMatchObject({ outcome: 'DENY' })
  })
  it('fails closed on malformed amounts instead of ignoring them', () => {
    for (const payload of [{ totalAmount: 'abc' }, { amount: -1 }, { amount: { value: 1 } }, { totalAmount: 5, amount: NaN }]) {
      expect(propose('CHARON', 'PURCHASE_ORDER', { vendorId: 'inframax', ...payload }).outcome).toBe('DENY')
    }
  })
  it('requires every figure in a payment to be a positive MXN number', () => {
    expect(propose('PERSEPHONE', 'PAYMENT', { totalAmount: 10, amount: -5, currency: 'MXN' })).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-012' })
    expect(propose('PERSEPHONE', 'PAYMENT', { totalAmount: 10, amount: '20', currency: 'MXN' })).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-012' })
    expect(propose('PERSEPHONE', 'PAYMENT', { amount: 10, currency: 'MXN' })).toMatchObject({ outcome: 'ESCALATE' })
  })
  it('denies an internal operation that carries a hidden external effect', () => {
    for (const [op, payload] of [
      ['PLANNING', { goal: 'x', recipient: 'attacker.testnet' }],
      ['CRYPTO_HASH', { nested: { receiverId: 'attacker.testnet' } }],
      ['VENDOR_EVALUATION', { vendorId: 'inframax', iban: 'MX00' }],
      ['ANOMALY_REPORT', { items: [{ privateKey: 'ed25519:abc' }] }],
      ['DOCUMENT_SUMMARY', { deposit: '1000000' }],
    ] as const) expect(propose('HADES', op, payload), op).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-016' })
  })
  it('still permits legitimate internal operations', () => {
    expect(propose('HADES', 'PLANNING', { goal: 'review the vendor documents' })).toMatchObject({ outcome: 'PERMIT' })
    expect(propose('TARTARUS', 'CRYPTO_HASH', { inputBytes: 120 })).toMatchObject({ outcome: 'PERMIT' })
  })
})

describe('CERBERUS cannot be bypassed by renaming the operation', () => {
  it('denies every spelling of a sensitive or unknown operation', () => {
    for (const op of ['payment', 'Payment', 'PAYMENT ', ' PAYMENT', 'PAY​MENT', 'PAYMENT\n', 'ΡAYMENT', 'TRANSFER_FUNDS', 'near_transaction', 'NEAR_TRANSACTION\0', 'SEND_PAYMENT', '', 'constructor', '__proto__', 'toString']) {
      const d = propose('PERSEPHONE', op, { amount: 1, currency: 'MXN' })
      expect(d.outcome, JSON.stringify(op)).toBe('DENY')
      expect(d.ruleMatched, JSON.stringify(op)).toBe('R-008')
    }
  })
  it('denies tool-like operations outright', () => {
    for (const op of ['TOOL_EXECUTION', 'SHELL_COMMAND', 'EXTERNAL_REQUEST']) expect(propose('HADES', op, {})).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-014' })
  })
})

class ProbeAgent extends AgentBase {
  constructor(name: AgentName, deps: ConstructorParameters<typeof Object> extends never ? never : { guard: CerberusGUARD; audit: CerberusAUDIT; near: NEARBridge }) { super(name, deps) }
  receiveTask(_task: Task): Promise<TaskResult> { throw new Error('unused') }
  attempt(op: string, payload: unknown) { return this.proposeOperation(op, payload, 'm1', 't1') }
}

describe('agents cannot evade CERBERUS', () => {
  const deps = () => ({ guard: new CerberusGUARD(), audit: new CerberusAUDIT(), near: new NEARBridge() })
  it('blocks an agent proposing an operation it is not permitted to, and records the audit trail', async () => {
    const d = deps()
    const charon = new ProbeAgent('CHARON', d), minos = new ProbeAgent('MINOS', d)
    expect((await charon.attempt('PAYMENT', { amount: 10, currency: 'MXN' })).decision).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-009' })
    expect((await minos.attempt('NEAR_TRANSACTION', {})).decision).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-009' })
    expect((await minos.attempt('SHELL_COMMAND', { cmd: 'rm -rf /' })).decision.outcome).toBe('DENY')
    expect(d.audit.getTotalCount()).toBe(3)
  })
  it('lets an authorized agent reach approval, never execution, for a sensitive operation', async () => {
    const persephone = new ProbeAgent('PERSEPHONE', deps())
    expect((await persephone.attempt('PAYMENT', { amount: 10, currency: 'MXN' })).decision.outcome).toBe('ESCALATE')
  })
})

describe('tool registry', () => {
  it('has no aliases: lookup is exact and case-sensitive', () => {
    const r = createDefaultToolRegistry()
    expect(r.get('payment.execute')?.effect).toBe('FINANCIAL')
    for (const id of ['Payment.execute', 'payment.execute ', 'payment', 'PAYMENT.EXECUTE', 'constructor', '__proto__', undefined, 42, {}]) expect(r.get(id)).toBeUndefined()
  })
  it('refuses unsafe registrations and changes its hash when a limit changes', () => {
    const r = new ToolRegistry()
    expect(() => r.register({ id: 'Bad Id', description: '', effect: 'READ', agents: [], roles: [], allowedParams: [] })).toThrow()
    expect(() => r.register({ id: 'x.pay', description: '', effect: 'FINANCIAL', agents: ['PERSEPHONE'], roles: ['ADMIN'], allowedParams: [] })).toThrow(/amountField/)
    expect(() => r.register({ id: 'x.chain', description: '', effect: 'BLOCKCHAIN', agents: ['HADES'], roles: ['VIEWER'], allowedParams: [] })).toThrow(/VIEWER/)
    const a = createDefaultToolRegistry().hash(), b = new ToolRegistry([...createDefaultToolRegistry().list().map(t => t.id === 'payment.execute' ? { ...t, maxAmount: 999_999 } : t)]).hash()
    expect(a).not.toBe(b)
  })
  it('canonicalizes parameters independent of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(canonicalJson({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }))
  })
})

describe('NEAR bridge cannot execute without CERBERUS', () => {
  const previous = process.env['NEAR_EXECUTION_MODE']
  afterEach(() => { if (previous === undefined) delete process.env['NEAR_EXECUTION_MODE']; else process.env['NEAR_EXECUTION_MODE'] = previous })
  const tx = { auditId: 'a', contentHash: 'h', operationType: 'PLANNING', agentName: 'HADES', decision: 'PERMIT', timestampMs: 1 }
  const fakeGate = (accept: boolean, calls: string[] = []): ExecutionGate => ({ consumeGrant: (id, tool) => { calls.push(`${id}:${tool}`); if (!accept) throw new Error('GRANT_INVALID') } })

  it('real mode fails closed without a gate or without a grant', async () => {
    process.env['NEAR_EXECUTION_MODE'] = 'testnet'
    const bridge = new NEARBridge()
    await expect(bridge.storeAuditHash(tx)).rejects.toThrow('CERBERUS_GATE_REQUIRED')
    bridge.attachGate(fakeGate(true))
    await expect(bridge.storeAuditHash(tx)).rejects.toThrow('CERBERUS_GRANT_REQUIRED')
    await expect(bridge.storeAuditHash(tx, 'g1')).rejects.toThrow('CERBERUS_GRANT_REQUIRED')
  })
  it('real mode rejects a grant the gate does not accept, and the gate cannot be swapped', async () => {
    process.env['NEAR_EXECUTION_MODE'] = 'testnet'
    const bridge = new NEARBridge(), rejecting = fakeGate(false)
    bridge.attachGate(rejecting)
    await expect(bridge.storeAuditHash(tx, 'forged', { any: 1 })).rejects.toThrow('GRANT_INVALID')
    expect(() => bridge.attachGate(fakeGate(true))).toThrow('CERBERUS_GATE_ALREADY_ATTACHED')
  })
  it('even with a valid grant nothing is transmitted without signing credentials', async () => {
    process.env['NEAR_EXECUTION_MODE'] = 'testnet'
    const calls: string[] = [], bridge = new NEARBridge()
    bridge.attachGate(fakeGate(true, calls))
    await expect(bridge.storeAuditHash(tx, 'g1', { any: 1 })).rejects.toThrow(/requires credentials/)
    expect(calls).toEqual(['g1:near.audit_hash_submit'])
    expect(bridge.getAllTransactions()).toHaveLength(0)
  })
  it('simulation mode has no external effect and records a labelled DEMO transaction', async () => {
    process.env['NEAR_EXECUTION_MODE'] = 'simulation'
    const record = await new NEARBridge().storeAuditHash(tx)
    expect(record).toMatchObject({ mode: 'simulation', explorerUrl: '', blockHeight: 0 })
    expect(record.txHash.startsWith('DEMO-')).toBe(true)
  })
})
