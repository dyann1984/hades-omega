import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type {
  AuditRecord,
  AuditFilter,
  AuditStats,
  OperationProposal,
  GUARDDecision,
  GUARDOutcome,
  AgentName,
  ExecutionMode,
} from '../types/index.js'

export class CerberusAUDIT {
  private records: Map<string, AuditRecord> = new Map()

  createRecord(
    proposal: OperationProposal,
    decision: GUARDDecision,
    policyVersion: string,
    policyHash: string,
    executionMode: ExecutionMode = 'simulation',
  ): AuditRecord {
    const payload = proposal.payload as object

    const recordData = {
      id:               uuidv4(),
      missionId:        proposal.missionId,
      taskId:           proposal.taskId,
      timestamp:        Date.now(),
      agentId:          proposal.agentId,
      agentName:        proposal.agentName,
      operationType:    proposal.operationType,
      operationPayload: { ...payload },
      policyVersion,
      policyHash,
      guardDecision:    decision.outcome,
      ruleMatched:      decision.ruleMatched,
      reason:           decision.reason,
      nearTxHash:       null,
      nearExplorerUrl:  null,
      humanApprovedBy:  null,
      humanDecisionAt:  null,
      executionMode,
    }

    const contentHash = createHash('sha256')
      .update(JSON.stringify(recordData))
      .digest('hex')

    const record: AuditRecord = { ...recordData, contentHash }
    this.records.set(record.id, record)
    return record
  }

  setNearTx(auditId: string, txHash: string, explorerUrl: string): AuditRecord | null {
    const record = this.records.get(auditId)
    if (!record) return null
    const updated = { ...record, nearTxHash: txHash, nearExplorerUrl: explorerUrl }
    this.records.set(auditId, updated)
    return updated
  }

  setHumanDecision(auditId: string, approvedBy: string): AuditRecord | null {
    const record = this.records.get(auditId)
    if (!record) return null
    const updated = { ...record, humanApprovedBy: approvedBy, humanDecisionAt: Date.now() }
    this.records.set(auditId, updated)
    return updated
  }

  getRecord(id: string): AuditRecord | null {
    return this.records.get(id) ?? null
  }

  query(filter: AuditFilter = {}): AuditRecord[] {
    const all = Array.from(this.records.values())
      .sort((a, b) => b.timestamp - a.timestamp)

    return all
      .filter(r => !filter.agentName     || r.agentName === filter.agentName)
      .filter(r => !filter.operationType || r.operationType === filter.operationType)
      .filter(r => !filter.outcome       || r.guardDecision === filter.outcome)
      .filter(r => !filter.fromTimestamp || r.timestamp >= filter.fromTimestamp)
      .filter(r => !filter.toTimestamp   || r.timestamp <= filter.toTimestamp)
      .filter(r => filter.hasNearTx === undefined || Boolean(r.nearTxHash) === filter.hasNearTx)
      .slice(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50))
  }

  getStats(from?: number, to?: number): AuditStats {
    const now = Date.now()
    const fromTs = from ?? now - 86400000
    const toTs   = to   ?? now
    const records = Array.from(this.records.values()).filter(
      r => r.timestamp >= fromTs && r.timestamp <= toTs,
    )

    const byOutcome = records.reduce(
      (acc, r) => { acc[r.guardDecision] = (acc[r.guardDecision] ?? 0) + 1; return acc },
      {} as Record<GUARDOutcome, number>,
    )

    const byAgent = records.reduce(
      (acc, r) => { acc[r.agentName] = (acc[r.agentName] ?? 0) + 1; return acc },
      {} as Partial<Record<AgentName, number>>,
    )

    const opCounts = records.reduce(
      (acc, r) => { acc[r.operationType] = (acc[r.operationType] ?? 0) + 1; return acc },
      {} as Record<string, number>,
    )

    return {
      period:           { from: fromTs, to: toTs },
      totalDecisions:   records.length,
      byOutcome,
      byAgent,
      nearTxCount:      records.filter(r => r.nearTxHash).length,
      topOperationTypes: Object.entries(opCounts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    }
  }

  getTotalCount(): number { return this.records.size }
}
