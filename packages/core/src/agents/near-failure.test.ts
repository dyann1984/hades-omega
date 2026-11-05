import { describe, expect, it } from 'vitest'
import { CerberusGUARD } from '../cerberus/guard.js'
import { CerberusAUDIT } from '../cerberus/audit.js'
import { NEARBridge } from '../near-bridge/index.js'
import { AgentBase, type AgentDependencies } from './base.js'
import { bus } from '../mission-bus/index.js'
import type { Task, TaskResult } from '../types/index.js'

class ProbeAgent extends AgentBase {
  constructor(deps: AgentDependencies) { super('CHARON', deps) }
  async receiveTask(_task: Task): Promise<TaskResult> { throw new Error('unused') }
  propose(op: string, payload: unknown) { return this.proposeOperation(op, payload, 'm1', 't1') }
}
const make = (near: NEARBridge) => { const guard = new CerberusGUARD(), audit = new CerberusAUDIT(); return { guard, audit, agent: new ProbeAgent({ guard, audit, near }) } }

describe('C-6: a failing NEAR bridge never loses the CERBERUS decision (legacy agent path)', () => {
  it('keeps the decision, publishes it, and marks the audit record as pending on-chain', async () => {
    const near = new NEARBridge()
    near.storeAuditHash = async () => { throw new Error('RPC down: secret-detail') }
    const { audit, agent } = make(near)
    const seen: string[] = []
    const off = bus.subscribe(e => { if (e.type === 'CERBERUS_DECISION') seen.push(e.payload.auditRecord.id) })
    try {
      const { decision, auditId } = await agent.propose('PURCHASE_ORDER', { vendorId: 'techvision', amount: 1000 })
      expect(decision.outcome).toBe('PERMIT') // the decision stands; only the attestation is pending
      expect(seen).toEqual([auditId])
      const rec = audit.getRecord(auditId)!
      expect(rec.nearTxHash).toBeNull()
      expect(rec.nearPending).toMatchObject({ reason: 'NEAR_ATTESTATION_FAILED' })
      expect(JSON.stringify(rec.nearPending)).not.toContain('secret-detail') // no internal detail in the record
    } finally { off() }
  })
  it('does not mark anything pending when the bridge succeeds', async () => {
    const { audit, agent } = make(new NEARBridge())
    const { auditId } = await agent.propose('PURCHASE_ORDER', { vendorId: 'techvision', amount: 1000 })
    expect(audit.getRecord(auditId)!.nearPending ?? null).toBeNull()
  })
})

describe('C-4: agents pin the policy hash in the proposal', () => {
  it('sends the policy hash in force with every proposal and stores it in the audit record', async () => {
    const { guard, agent, audit } = make(new NEARBridge())
    const pinned: Array<string | undefined> = []
    const original = guard.evaluate.bind(guard)
    guard.evaluate = (p, ctx) => { pinned.push(p.policyHash); return original(p, ctx) }
    const { auditId } = await agent.propose('PLANNING', {})
    expect(pinned).toEqual([guard.getPolicyHash()])
    expect(audit.getRecord(auditId)!.policyHash).toBe(guard.getPolicyHash())
  })
})
