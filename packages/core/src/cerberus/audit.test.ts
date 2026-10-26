import { describe, it, expect, beforeEach } from 'vitest'
import { CerberusAUDIT } from './audit.js'
import { CerberusGUARD } from './guard.js'
import type { OperationProposal } from '../types/index.js'
import { v4 as uuidv4 } from 'uuid'

function makeProposal(operationType = 'PURCHASE_ORDER'): OperationProposal {
  return {
    id:            uuidv4(),
    agentId:       'agent:charon:001',
    agentName:     'CHARON',
    operationType,
    payload:       { totalAmount: 20000, currency: 'MXN', vendorId: 'inframax' },
    missionId:     uuidv4(),
    taskId:        uuidv4(),
    requestedAt:   Date.now(),
  }
}

describe('CerberusAUDIT', () => {
  let audit: CerberusAUDIT
  let guard: CerberusGUARD

  beforeEach(() => {
    audit = new CerberusAUDIT()
    guard = new CerberusGUARD()
  })

  it('creates a record with content hash', () => {
    const proposal = makeProposal()
    const decision = guard.evaluate(proposal)
    const record   = audit.createRecord(proposal, decision, guard.getPolicyVersion(), guard.getPolicyHash())
    expect(record.contentHash).toHaveLength(64)
    expect(record.guardDecision).toBe(decision.outcome)
  })

  it('retrieves record by id', () => {
    const proposal = makeProposal()
    const decision = guard.evaluate(proposal)
    const record   = audit.createRecord(proposal, decision, '1.0.0', 'hash123')
    expect(audit.getRecord(record.id)).toEqual(record)
  })

  it('returns null for unknown id', () => {
    expect(audit.getRecord('unknown')).toBeNull()
  })

  it('queries records by agentName', () => {
    const p1 = makeProposal(); const d1 = guard.evaluate(p1)
    audit.createRecord(p1, d1, '1.0.0', 'h')

    const p2: OperationProposal = { ...makeProposal(), agentName: 'PERSEPHONE', agentId: 'agent:persephone:001' }
    const d2 = guard.evaluate(p2)
    audit.createRecord(p2, d2, '1.0.0', 'h')

    const results = audit.query({ agentName: 'PERSEPHONE' })
    expect(results.every(r => r.agentName === 'PERSEPHONE')).toBe(true)
  })

  it('queries records by outcome', () => {
    for (let i = 0; i < 3; i++) {
      const p = { ...makeProposal(), id: uuidv4(), payload: { totalAmount: 5000, vendorId: 'inframax' } }
      const d = guard.evaluate(p, { vendorAllowlist: ['inframax'] })
      audit.createRecord(p, d, '1.0.0', 'h')
    }
    const permits = audit.query({ outcome: 'PERMIT' })
    expect(permits.length).toBeGreaterThanOrEqual(1)
  })

  it('sets NEAR tx hash on record', () => {
    const p = makeProposal(); const d = guard.evaluate(p)
    const record = audit.createRecord(p, d, '1.0.0', 'h')
    const updated = audit.setNearTx(record.id, 'txHash123', 'https://near/txHash123')
    expect(updated?.nearTxHash).toBe('txHash123')
    expect(updated?.nearExplorerUrl).toBe('https://near/txHash123')
  })

  it('returns null when setting NEAR tx on unknown record', () => {
    expect(audit.setNearTx('nonexistent', 'hash', 'url')).toBeNull()
  })

  it('generates stats', () => {
    const p = makeProposal(); const d = guard.evaluate(p)
    audit.createRecord(p, d, '1.0.0', 'h')
    const stats = audit.getStats()
    expect(stats.totalDecisions).toBeGreaterThanOrEqual(1)
    expect(typeof stats.byOutcome).toBe('object')
  })

  it('respects limit in query', () => {
    for (let i = 0; i < 10; i++) {
      const p = { ...makeProposal(), id: uuidv4() }
      audit.createRecord(p, guard.evaluate(p), '1.0.0', 'h')
    }
    const results = audit.query({ limit: 3 })
    expect(results.length).toBeLessThanOrEqual(3)
  })
})
