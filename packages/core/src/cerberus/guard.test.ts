import { describe, it, expect, beforeEach } from 'vitest'
import { CerberusGUARD } from './guard.js'
import type { OperationProposal } from '../types/index.js'
import { v4 as uuidv4 } from 'uuid'

function makeProposal(overrides: Partial<OperationProposal> = {}): OperationProposal {
  return {
    id:            uuidv4(),
    agentId:       'agent:charon:001',
    agentName:     'CHARON',
    operationType: 'PURCHASE_ORDER',
    payload:       { totalAmount: 20000, currency: 'MXN', vendorId: 'cloudpro-standard' },
    missionId:     uuidv4(),
    taskId:        uuidv4(),
    requestedAt:   Date.now(),
    ...overrides,
  }
}

describe('CerberusGUARD', () => {
  let guard: CerberusGUARD

  beforeEach(() => {
    guard = new CerberusGUARD()
  })

  it('has policy version 1.0.0', () => {
    expect(guard.getPolicyVersion()).toBe('1.0.0')
  })

  it('generates a non-empty policy hash', () => {
    expect(guard.getPolicyHash()).toHaveLength(64)
  })

  it('PERMITs a purchase below $30,000 MXN from approved vendor', () => {
    const proposal = makeProposal({
      payload: { totalAmount: 20000, currency: 'MXN', vendorId: 'inframax' },
    })
    const decision = guard.evaluate(proposal, { budgetLimit: 50000, vendorAllowlist: ['inframax'] })
    expect(decision.outcome).toBe('PERMIT')
  })

  it('DENYs a purchase above $50,000 MXN (R-001)', () => {
    const proposal = makeProposal({
      payload: { totalAmount: 78500, currency: 'MXN', vendorId: 'cloudpro-premium' },
    })
    const decision = guard.evaluate(proposal, { budgetLimit: 50000, vendorAllowlist: ['cloudpro-premium'] })
    expect(decision.outcome).toBe('DENY')
    expect(decision.ruleMatched).toBe('R-001')
  })

  it('ESCALATEs a purchase between $30,000 and $50,000 MXN (R-002)', () => {
    const proposal = makeProposal({
      payload: { totalAmount: 42000, currency: 'MXN', vendorId: 'cloudpro-standard' },
    })
    const decision = guard.evaluate(proposal, { budgetLimit: 50000, vendorAllowlist: ['cloudpro-standard'] })
    expect(decision.outcome).toBe('ESCALATE')
    expect(decision.ruleMatched).toBe('R-002')
  })

  it('DENYs vendor not in allowlist (R-003)', () => {
    const proposal = makeProposal({
      payload: { totalAmount: 10000, currency: 'MXN', vendorId: 'unknown-corp' },
    })
    const decision = guard.evaluate(proposal, { vendorAllowlist: ['cloudpro-standard'] })
    expect(decision.outcome).toBe('DENY')
    expect(decision.ruleMatched).toBe('R-003')
  })

  it('PERMITs VENDOR_EVALUATION unconditionally (R-005)', () => {
    const proposal = makeProposal({ operationType: 'VENDOR_EVALUATION', payload: {} })
    const decision = guard.evaluate(proposal)
    expect(decision.outcome).toBe('PERMIT')
  })

  it('PERMITs PLANNING unconditionally (R-006)', () => {
    const proposal = makeProposal({ operationType: 'PLANNING', agentName: 'ELYSIUM', payload: {} })
    const decision = guard.evaluate(proposal)
    expect(decision.outcome).toBe('PERMIT')
  })

  it('PERMITs ANOMALY_REPORT unconditionally (R-007)', () => {
    const proposal = makeProposal({ operationType: 'ANOMALY_REPORT', agentName: 'TARTARUS', payload: {} })
    const decision = guard.evaluate(proposal)
    expect(decision.outcome).toBe('PERMIT')
  })

  it('increments evaluation count', () => {
    expect(guard.getEvaluationCount()).toBe(0)
    guard.evaluate(makeProposal())
    guard.evaluate(makeProposal())
    expect(guard.getEvaluationCount()).toBe(2)
  })

  it('decision includes decidedAt timestamp', () => {
    const before = Date.now()
    const decision = guard.evaluate(makeProposal())
    const after  = Date.now()
    expect(decision.decidedAt).toBeGreaterThanOrEqual(before)
    expect(decision.decidedAt).toBeLessThanOrEqual(after)
  })

  it('denies unknown operation types', () => {
    const proposal = makeProposal({ operationType: 'CUSTOM_OPERATION', payload: {} })
    const decision = guard.evaluate(proposal)
    expect(decision.outcome).toBe('DENY')
  })

  it('decision has valid auditId', () => {
    const decision = guard.evaluate(makeProposal())
    expect(decision.auditId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('R-008 hardening: controls by operation type, amount and permission (not by agent name)', () => {
  const guard = new CerberusGUARD()
  const ctx = { budgetLimit: 50000, vendorAllowlist: ['inframax', 'cloudpro-standard'] }
  const propose = (agentName: string, operationType: string, payload: unknown) =>
    guard.evaluate(makeProposal({ agentName: agentName as never, operationType, payload }), ctx)

  it('does not let a purchase bypass R-001/R-002 by swapping CHARON for another agent', () => {
    const asCharon = propose('CHARON', 'PURCHASE_ORDER', { totalAmount: 42000, vendorId: 'inframax' })
    expect(asCharon.outcome).toBe('ESCALATE')
    for (const agent of ['PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS', 'HADES', 'EVIL']) {
      const d = propose(agent, 'PURCHASE_ORDER', { totalAmount: 42000, vendorId: 'inframax' })
      expect(d.outcome, agent).not.toBe('PERMIT')
      expect(d.ruleMatched, agent).toBe('R-009') // only agents with the PURCHASE_ORDER permission may propose it
    }
  })
  it('applies the amount limits to any operation type and any agent', () => {
    expect(propose('PERSEPHONE', 'PAYMENT', { amount: 90000, currency: 'MXN' })).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-010' })
    expect(propose('PERSEPHONE', 'PAYMENT', { amount: 42000, currency: 'MXN' })).toMatchObject({ outcome: 'ESCALATE', ruleMatched: 'R-011' })
    expect(propose('PERSEPHONE', 'PAYMENT', { amount: 1000, currency: 'MXN' }).outcome).toBe('ESCALATE')
    expect(propose('ELYSIUM', 'CUSTOM_OPERATION', { totalAmount: 80000 })).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-010' })
  })
  it('requires the permission for sensitive operation types', () => {
    expect(propose('CHARON', 'PAYMENT', { amount: 10 })).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-009' })
    expect(propose('CHARON', 'NEAR_TRANSACTION', {})).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-009' })
    expect(propose('PERSEPHONE', 'NEAR_TRANSACTION', {}).outcome).toBe('ESCALATE')
  })
  it('fails closed on malformed amounts and tolerates a null payload', () => {
    expect(propose('CHARON', 'PURCHASE_ORDER', { totalAmount: 'abc', vendorId: 'inframax' }).outcome).toBe('DENY')
    expect(propose('CHARON', 'PURCHASE_ORDER', { totalAmount: -5, vendorId: 'inframax' }).outcome).toBe('DENY')
    expect(propose('CHARON', 'PURCHASE_ORDER', { totalAmount: '90000', vendorId: 'inframax' }).outcome).toBe('DENY')
    expect(() => propose('CHARON', 'CUSTOM_OPERATION', null)).not.toThrow()
  })
  it('denies unknown operations and is deterministic', () => {
    expect(propose('MINOS', 'CUSTOM_OPERATION', {})).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-008' })
    expect(propose('TARTARUS', 'CRYPTO_HASH', { algorithm: 'sha256' }).outcome).toBe('PERMIT')
    const a = propose('PERSEPHONE', 'PURCHASE_ORDER', { totalAmount: 42000 }), b = propose('PERSEPHONE', 'PURCHASE_ORDER', { totalAmount: 42000 })
    expect([a.outcome, a.ruleMatched]).toEqual([b.outcome, b.ruleMatched])
    expect(a.auditId).not.toBe(b.auditId)
  })
  it('includes the permission matrix in the policy hash', () => {
    const custom = new CerberusGUARD({ operationPermissions: { PURCHASE_ORDER: ['CHARON', 'PERSEPHONE'] } })
    expect(custom.getPolicyHash()).not.toBe(new CerberusGUARD().getPolicyHash())
  })
})

describe('policy isolation and classification', () => {
  it('denies unregistered actions', () => {
    const guard = new CerberusGUARD()
    for (const operationType of ['SEND_MONEY', 'WIRE_TRANSFER', 'RUN_COMMAND', 'IGNORE_POLICIES']) {
      expect(guard.evaluate(makeProposal({ operationType, payload: {} }))).toMatchObject({ outcome: 'DENY', ruleMatched: 'R-008' })
    }
  })
  it('hashes configuration changes and isolates mutable state', () => {
    const guard = new CerberusGUARD()
    const initial = guard.getPolicyHash()
    guard.getPolicy().vendorAllowlist.push('attacker')
    expect(guard.getPolicy().vendorAllowlist).not.toContain('attacker')
    guard.updatePolicy({ vendorAllowlist: ['approved'] })
    expect(guard.getPolicyHash()).not.toBe(initial)
    const updated = guard.getPolicyHash()
    guard.updatePolicy({ budgetCategories: { SERVICES: 42 } })
    expect(guard.getPolicyHash()).not.toBe(updated)
    expect(new CerberusGUARD().getPolicy().vendorAllowlist).not.toContain('approved')
  })
})

describe('sensitive operations fail closed', () => {
  const guard = new CerberusGUARD()
  it('denies missing, invalid or unsupported financial amounts', () => {
    for (const payload of [{}, { amount: 0, currency: 'MXN' }, { amount: '10', currency: 'MXN' }, { amount: 10, currency: 'USD' }]) {
      expect(guard.evaluate(makeProposal({agentName:'PERSEPHONE', operationType:'PAYMENT', payload}))).toMatchObject({outcome:'DENY', ruleMatched:'R-012'})
    }
  })
  it('requires review of authorized sensitive operations and denies generic tools', () => {
    expect(guard.evaluate(makeProposal({agentName:'PERSEPHONE', operationType:'TRANSFER', payload:{amount:1,currency:'MXN'}}))).toMatchObject({outcome:'ESCALATE', ruleMatched:'R-013'})
    expect(guard.evaluate(makeProposal({agentName:'HADES', operationType:'NEAR_TRANSACTION', payload:{}}))).toMatchObject({outcome:'ESCALATE', ruleMatched:'R-013'})
    expect(guard.evaluate(makeProposal({agentName:'HADES', operationType:'TOOL_EXECUTION', payload:{}}))).toMatchObject({outcome:'DENY', ruleMatched:'R-014'})
  })
})
