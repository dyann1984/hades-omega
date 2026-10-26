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

  it('default permit for unknown operation type', () => {
    const proposal = makeProposal({ operationType: 'CUSTOM_OPERATION', payload: {} })
    const decision = guard.evaluate(proposal)
    expect(decision.outcome).toBe('PERMIT')
  })

  it('decision has valid auditId', () => {
    const decision = guard.evaluate(makeProposal())
    expect(decision.auditId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
