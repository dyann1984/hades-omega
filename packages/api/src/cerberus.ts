import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import { bus } from './mission-bus.js';
import { saveAuditRecord } from './db.js';
import { near } from './near.js';
import type {
  AuditRecord,
  CERBERUSGuardResult,
  OperationProposal,
  PolicyRule,
} from './types.js';

const POLICIES: PolicyRule[] = [
  {
    id: 'P001',
    operationType: 'PURCHASE_ORDER',
    field: 'amount',
    operator: 'gt',
    threshold: 50000,
    decision: 'DENY',
    reason: 'Purchase order exceeds maximum budget ($50,000 MXN)',
  },
  {
    id: 'P002',
    operationType: 'PURCHASE_ORDER',
    field: 'amount',
    operator: 'gt',
    threshold: 10000,
    decision: 'ESCALATE',
    reason: 'Purchase order exceeds autonomous approval limit ($10,000 MXN) — requires human review',
    isCritical: true,
  },
  {
    id: 'P003',
    operationType: 'BUDGET_COMMITMENT',
    field: 'amount',
    operator: 'gt',
    threshold: 40000,
    decision: 'ESCALATE',
    reason: 'Budget commitment exceeds 80% utilization threshold',
    isCritical: true,
  },
  {
    id: 'P004',
    operationType: 'VENDOR_SELECTION',
    decision: 'PERMIT',
    reason: 'Vendor evaluation approved by CHARON',
  },
  {
    id: 'P005',
    operationType: '*',
    decision: 'PERMIT',
    reason: 'Default policy: operation permitted',
  },
];

const CRITICAL_OPS = new Set(['PURCHASE_ORDER', 'BUDGET_COMMITMENT', 'HUMAN_APPROVAL']);

export const cerberus = {
  async guard(proposal: OperationProposal): Promise<CERBERUSGuardResult> {
    const matched = matchPolicy(proposal);
    const result: CERBERUSGuardResult = {
      proposalId: proposal.id,
      decision: matched.decision,
      reason: matched.reason,
      policyRuleId: matched.id,
      requiresHumanApproval: matched.decision === 'ESCALATE',
      timestamp: Date.now(),
    };

    bus.publish('cerberus:decision', { proposal, result });
    bus.publish('system:log', {
      level: result.decision === 'DENY' ? 'error' : result.decision === 'ESCALATE' ? 'warn' : 'info',
      source: 'CERBERUS.GUARD',
      message: `[${result.decision}] ${proposal.operationType} from ${proposal.agentName}: ${result.reason}`,
    });

    return result;
  },

  async audit(
    proposal: OperationProposal,
    guardResult: CERBERUSGuardResult,
    humanApprovedBy?: string
  ): Promise<AuditRecord> {
    const record: AuditRecord = {
      id: uuid(),
      proposalId: proposal.id,
      agentName: proposal.agentName,
      operationType: proposal.operationType,
      decision: guardResult.decision === 'ESCALATE' && humanApprovedBy ? 'PERMIT' : guardResult.decision,
      contentHash: '',
      metadata: {
        ...proposal.metadata,
        amount: proposal.amount,
        currency: proposal.currency,
        guardReason: guardResult.reason,
        policyRuleId: guardResult.policyRuleId,
      },
      humanApprovedBy,
      nearMode: (process.env.NEAR_EXECUTION_MODE ?? 'simulation') as 'simulation' | 'real',
      timestamp: Date.now(),
    };

    record.contentHash = sha256(record);
    saveAuditRecord(record);

    const isCritical = CRITICAL_OPS.has(proposal.operationType) || humanApprovedBy !== undefined;
    if (isCritical) {
      try {
        const nearResult = await near.submitAuditRecord(record);
        if (nearResult.txHash) {
          record.nearTxHash = nearResult.txHash;
          record.nearExplorerUrl = nearResult.explorerUrl ?? undefined;
          saveAuditRecord(record);
        }
        bus.publish('near:submission', { record, nearResult });
      } catch (err) {
        bus.publish('system:log', {
          level: 'warn',
          source: 'CERBERUS.AUDIT',
          message: `NEAR submission failed (non-blocking): ${err instanceof Error ? err.message : err}`,
        });
      }
    }

    bus.publish('cerberus:audit', record);
    bus.publish('system:log', {
      level: 'info',
      source: 'CERBERUS.AUDIT',
      message: `Audit record ${record.id.slice(0, 8)} — ${record.decision} — hash: ${record.contentHash.slice(0, 12)}…${isCritical ? ' → NEAR' : ''}`,
    });

    return record;
  },
};

function matchPolicy(proposal: OperationProposal): PolicyRule {
  for (const rule of POLICIES) {
    if (rule.operationType !== '*' && rule.operationType !== proposal.operationType) continue;
    if (rule.field && rule.operator && rule.threshold !== undefined) {
      const val = rule.field === 'amount' ? (proposal.amount ?? 0) : 0;
      if (!compareOp(val, rule.operator, rule.threshold)) continue;
    }
    return rule;
  }
  return POLICIES[POLICIES.length - 1];
}

function compareOp(val: number, op: string, threshold: number): boolean {
  switch (op) {
    case 'gt': return val > threshold;
    case 'lt': return val < threshold;
    case 'gte': return val >= threshold;
    case 'lte': return val <= threshold;
    case 'eq': return val === threshold;
    default: return false;
  }
}

function sha256(record: AuditRecord): string {
  const payload = JSON.stringify({
    id: record.id,
    proposalId: record.proposalId,
    agentName: record.agentName,
    operationType: record.operationType,
    decision: record.decision,
    metadata: record.metadata,
    humanApprovedBy: record.humanApprovedBy,
    timestamp: record.timestamp,
  });
  return createHash('sha256').update(payload).digest('hex');
}
