import { describe, expect, it } from 'vitest'
import { CerberusGUARD } from './guard.js'
import { DEFAULT_POLICY, type PolicyRule } from './policy.js'
import { DECISION_CODES, GATE_CODES, GUARD_CODES, ruleReasonCode } from './decision-codes.js'
import type { AgentName, OperationProposal } from '../types/index.js'

const proposal = (operationType: string, payload: unknown, agentName: AgentName = 'CHARON', extra: Partial<OperationProposal> = {}): OperationProposal =>
  ({ id: 'p', agentId: `agent:${agentName.toLowerCase()}`, agentName, operationType, payload, missionId: 'm', taskId: 't', requestedAt: 1, ...extra })

describe('C-1: GUARD fails closed on internal errors', () => {
  it('turns an exception while evaluating into DENY GUARD_INTERNAL_ERROR instead of throwing', () => {
    const hostile = { get amount(): number { throw new Error('boom') } }
    const d = new CerberusGUARD().evaluate(proposal('PURCHASE_ORDER', hostile))
    expect(d).toMatchObject({ outcome: 'DENY', ruleMatched: null, reasonCode: 'GUARD_INTERNAL_ERROR' })
    expect(d.reason).toContain('GUARD_INTERNAL_ERROR')
    expect(d.reason).not.toContain('boom') // internal detail is not exposed in the decision
  })
  it('keeps counting evaluations and keeps working after an internal error', () => {
    const g = new CerberusGUARD()
    g.evaluate(proposal('PURCHASE_ORDER', { get amount(): number { throw new Error('x') } }))
    expect(g.getEvaluationCount()).toBe(1)
    expect(g.evaluate(proposal('PLANNING', {})).outcome).toBe('PERMIT')
  })
})

describe('C-2: total, deterministic rule order', () => {
  const rule = (id: string, outcome: 'PERMIT' | 'DENY' | 'ESCALATE', priority = 50): PolicyRule => ({ id, name: id, description: id, operationType: 'PLANNING', condition: { type: 'ALWAYS' }, outcome, priority, active: true })
  it('on equal priority DENY beats ESCALATE beats PERMIT, whatever order the rules are listed in', () => {
    const rules = [rule('A-PERMIT', 'PERMIT'), rule('B-ESC', 'ESCALATE'), rule('C-DENY', 'DENY')]
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2], [0, 2, 1]]) {
      const g = new CerberusGUARD({ rules: order.map(i => rules[i]!) })
      expect(g.evaluate(proposal('PLANNING', {}))).toMatchObject({ outcome: 'DENY', ruleMatched: 'C-DENY' })
    }
  })
  it('on equal priority and outcome the rule id decides, not the position', () => {
    const a = new CerberusGUARD({ rules: [rule('Z', 'DENY'), rule('A', 'DENY')] }).evaluate(proposal('PLANNING', {}))
    const b = new CerberusGUARD({ rules: [rule('A', 'DENY'), rule('Z', 'DENY')] }).evaluate(proposal('PLANNING', {}))
    expect(a.ruleMatched).toBe('A'); expect(b.ruleMatched).toBe('A')
  })
  it('property: same input gives the same verdict, and shuffling the default rules never changes it (seeded, 400 cases)', () => {
    let s = 20261105
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
    const agents: AgentName[] = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS']
    const ops = ['PURCHASE_ORDER', 'PAYMENT', 'TRANSFER', 'NEAR_TRANSACTION', 'PLANNING', 'CRYPTO_HASH', 'TOOL_EXECUTION', 'UNKNOWN_OP', 'BUDGET_APPROVAL', 'VENDOR_EVALUATION']
    const shuffled = (): PolicyRule[] => { const r = structuredClone(DEFAULT_POLICY.rules); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!] } return r }
    const base = new CerberusGUARD()
    for (let n = 0; n < 400; n++) {
      const payload: Record<string, unknown> = {}
      if (rnd() < 0.7) payload['amount'] = pick([0, 100, 29999, 30001, 49999, 50001, -5, 'abc', '12000', null])
      if (rnd() < 0.3) payload['vendorId'] = pick(['techvision', 'evilcorp'])
      if (rnd() < 0.3) payload['currency'] = pick(['MXN', 'USD'])
      if (rnd() < 0.15) payload['recipient'] = 'x'
      const p = proposal(pick(ops), payload, pick(agents))
      const a = base.evaluate(p), b = base.evaluate(p), c = new CerberusGUARD({ rules: shuffled() }).evaluate(p)
      expect([b.outcome, b.ruleMatched]).toEqual([a.outcome, a.ruleMatched])
      expect([c.outcome, c.ruleMatched], JSON.stringify(p)).toEqual([a.outcome, a.ruleMatched])
    }
  })
})

describe('C-4: the proposal may pin the policy it was evaluated against', () => {
  it('denies a proposal bound to a different policy hash (stale approval path) and accepts the current one or none', () => {
    const g = new CerberusGUARD()
    const stale = g.evaluate(proposal('PLANNING', {}, 'HADES', { policyHash: 'f'.repeat(64) }))
    expect(stale).toMatchObject({ outcome: 'DENY', ruleMatched: null, reasonCode: 'GUARD_POLICY_STALE' })
    expect(g.evaluate(proposal('PLANNING', {}, 'HADES', { policyHash: g.getPolicyHash() })).outcome).toBe('PERMIT')
    expect(g.evaluate(proposal('PLANNING', {}, 'HADES')).outcome).toBe('PERMIT') // existing callers are unaffected
  })
})

describe('C-5: sensitivity is never taken from the caller', () => {
  it('ignores sensitivity flags smuggled into the payload or proposal', () => {
    const g = new CerberusGUARD()
    const plain = g.evaluate(proposal('PAYMENT', { amount: 100, currency: 'MXN' }, 'PERSEPHONE'))
    for (const flags of [{ sensitive: false }, { isSensitive: false }, { requiresApproval: false }, { classification: 'public' }]) {
      const d = g.evaluate(proposal('PAYMENT', { amount: 100, currency: 'MXN', ...flags }, 'PERSEPHONE', { ...flags } as never))
      expect([d.outcome, d.ruleMatched]).toEqual([plain.outcome, plain.ruleMatched])
    }
    expect(plain.outcome).toBe('ESCALATE')
  })
})

describe('C-7: stable decision-code catalog', () => {
  it('pins the gate code set: adding, renaming or removing a code must be a deliberate change here and in docs', () => {
    expect(Object.keys(GATE_CODES).sort()).toEqual([
      'AGENT_NOT_PERMITTED', 'AMOUNT_LIMIT', 'APPROVAL_EXPIRED', 'APPROVAL_NOT_FOUND', 'APPROVAL_PENDING', 'APPROVAL_REJECTED', 'APPROVAL_REQUIRED', 'APPROVAL_REUSED',
      'BUDGET_EXCEEDED', 'EGRESS_NOT_AUTHORIZED', 'EMERGENCY_STOP', 'GATE_INTERNAL_ERROR', 'INVALID_AMOUNT', 'INVALID_PARAMS', 'OK', 'PARAMS_ALTERED', 'POLICY_CHANGED',
      'RECIPIENT_NOT_ALLOWED', 'ROLE_NOT_PERMITTED', 'UNKNOWN_TOOL',
    ])
  })
  it('pins the guard code set', () => {
    expect(Object.keys(GUARD_CODES).sort()).toEqual([
      'GUARD_INTERNAL_ERROR', 'GUARD_POLICY_STALE', 'POLICY_AGENT_NOT_PERMITTED', 'POLICY_AMOUNT_ESCALATION', 'POLICY_AMOUNT_LIMIT', 'POLICY_APPROVAL_REQUIRED',
      'POLICY_BUDGET_EXCEEDED', 'POLICY_CUSTOM_RULE', 'POLICY_DEFAULT_DENY', 'POLICY_HIDDEN_EFFECT', 'POLICY_INVALID_AMOUNT', 'POLICY_PERMITTED', 'POLICY_TOOL_NOT_AUTHORIZED',
      'POLICY_VENDOR_NOT_ALLOWED',
    ])
  })
  it('documents every code (description, outcome, http) with no gate/guard overlap', () => {
    const keys = Object.keys(DECISION_CODES)
    expect(new Set(keys).size).toBe(Object.keys(GATE_CODES).length + Object.keys(GUARD_CODES).length)
    for (const [code, info] of Object.entries(DECISION_CODES)) {
      expect(info.description.length, code).toBeGreaterThan(10)
      expect(['PERMIT', 'DENY', 'ESCALATE'], code).toContain(info.outcome)
      expect([200, 400, 403, 409, 423], code).toContain(info.http)
    }
  })
  it('maps every default policy rule to a catalogued code and every decision carries one', () => {
    for (const r of DEFAULT_POLICY.rules) expect(Object.keys(GUARD_CODES), r.id).toContain(ruleReasonCode(r.id))
    const g = new CerberusGUARD()
    for (const [op, payload] of [['PLANNING', {}], ['PAYMENT', {}], ['PURCHASE_ORDER', { amount: 60000 }], ['PURCHASE_ORDER', { amount: 35000 }], ['TOOL_EXECUTION', {}], ['NOPE', {}], ['PLANNING', { recipient: 'x' }]] as const) {
      const d = g.evaluate(proposal(op, payload, 'CHARON'))
      expect(Object.keys(GUARD_CODES), `${op} ${d.ruleMatched}`).toContain(d.reasonCode)
    }
    expect(ruleReasonCode('X-999')).toBe('POLICY_CUSTOM_RULE')
    expect(ruleReasonCode(null)).toBe('POLICY_DEFAULT_DENY')
  })
})
