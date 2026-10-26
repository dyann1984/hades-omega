import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type {
  OperationProposal,
  GUARDDecision,
  GUARDOutcome,
} from '../types/index.js'
import type { CerberusPolicy, PolicyRule } from './policy.js'
import { DEFAULT_POLICY } from './policy.js'

export interface GUARDContext {
  currentBudget?:  number
  budgetLimit?:    number
  vendorAllowlist?: string[]
}

export class CerberusGUARD {
  private policy: CerberusPolicy
  private policyHash: string
  private evaluationCount = 0

  constructor(policy?: Partial<CerberusPolicy>) {
    const merged = { ...DEFAULT_POLICY, ...policy }
    this.policyHash = createHash('sha256')
      .update(JSON.stringify(merged.rules))
      .digest('hex')
    this.policy = { ...merged, hash: this.policyHash }
  }

  evaluate(proposal: OperationProposal, ctx: GUARDContext = {}): GUARDDecision {
    this.evaluationCount++

    const activeRules = this.policy.rules
      .filter(r => r.active)
      .filter(r => r.operationType === '*' || r.operationType === proposal.operationType)
      .filter(r => !r.agent || r.agent === '*' || r.agent === proposal.agentName)
      .sort((a, b) => b.priority - a.priority)

    for (const rule of activeRules) {
      const matches = this.matchCondition(rule, proposal, ctx)
      if (matches) {
        const outcome = this.resolveOutcome(rule, proposal, ctx)
        return this.buildDecision(proposal, rule, outcome)
      }
    }

    return this.buildDecision(proposal, null, 'PERMIT')
  }

  private matchCondition(
    rule: PolicyRule,
    proposal: OperationProposal,
    ctx: GUARDContext,
  ): boolean {
    const cond = rule.condition
    const payload = proposal.payload as Record<string, unknown>

    switch (cond.type) {
      case 'ALWAYS':
        return true

      case 'AMOUNT_LIMIT': {
        const amount = (payload.totalAmount as number) ?? (payload.amount as number) ?? 0
        return amount > (cond.maxAmount ?? Infinity)
      }

      case 'VENDOR_ALLOWLIST': {
        const vendorId = payload.vendorId as string
        if (!vendorId) return false
        const list = ctx.vendorAllowlist ?? this.policy.vendorAllowlist
        return !list.includes(vendorId)
      }

      case 'BUDGET_THRESHOLD': {
        const amount = (payload.amount as number) ?? 0
        const available = ctx.currentBudget ?? ctx.budgetLimit ?? Infinity
        const threshold = (cond.budgetPercent ?? 100) / 100
        return amount > available * threshold
      }

      case 'COMPOUND': {
        const results = (cond.conditions ?? []).map(c =>
          this.matchCondition({ ...rule, condition: c }, proposal, ctx),
        )
        return cond.operator === 'AND'
          ? results.every(Boolean)
          : results.some(Boolean)
      }

      default:
        return false
    }
  }

  private resolveOutcome(
    rule: PolicyRule,
    proposal: OperationProposal,
    ctx: GUARDContext,
  ): GUARDOutcome {
    if (rule.outcome !== 'ESCALATE') return rule.outcome

    if (rule.id === 'R-002') {
      const payload = proposal.payload as Record<string, unknown>
      const amount = (payload.totalAmount as number) ?? 0
      if (ctx.budgetLimit && amount > ctx.budgetLimit) return 'DENY'
    }

    return 'ESCALATE'
  }

  private buildDecision(
    proposal: OperationProposal,
    rule: PolicyRule | null,
    outcome: GUARDOutcome,
  ): GUARDDecision {
    return {
      proposalId:  proposal.id,
      auditId:     uuidv4(),
      outcome,
      ruleMatched: rule?.id ?? null,
      reason:      rule ? `Regla ${rule.id}: ${rule.description}` : 'Sin regla coincidente — PERMIT por defecto',
      escalateTo:  outcome === 'ESCALATE' ? 'MINOS' : outcome === 'DENY' && rule?.id === 'R-007' ? 'TARTARUS' : null,
      decidedAt:   Date.now(),
    }
  }

  getPolicyVersion(): string { return this.policy.version }
  getPolicyHash(): string    { return this.policyHash }
  getEvaluationCount(): number { return this.evaluationCount }
  getPolicy(): CerberusPolicy  { return { ...this.policy } }
}
