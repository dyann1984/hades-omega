import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type {
  OperationProposal,
  GUARDDecision,
  GUARDOutcome,
} from '../types/index.js'
import type { CerberusPolicy, PolicyRule } from './policy.js'
import { DEFAULT_POLICY } from './policy.js'

const REGISTERED_OPERATIONS = new Set(['PURCHASE_ORDER', 'BUDGET_APPROVAL', 'VENDOR_EVALUATION', 'PLANNING', 'ANOMALY_REPORT', 'CRYPTO_HASH', 'DOCUMENT_INTAKE', 'BATCH_DOCUMENT_INTAKE', 'DOCUMENT_VALIDATION', 'BATCH_DOCUMENT_VALIDATION', 'DOCUMENT_SUMMARY', 'MULTI_DOCUMENT_COMPARISON', 'DOCUMENT_DELIVERABLE', 'DELIVERABLE_GENERATION'])

function hashPolicy(policy: Omit<CerberusPolicy, 'hash'>): string {
  return createHash('sha256').update(JSON.stringify({ rules: policy.rules, operationPermissions: policy.operationPermissions, vendorAllowlist: policy.vendorAllowlist, budgetCategories: policy.budgetCategories, registeredOperations: [...REGISTERED_OPERATIONS].sort() })).digest('hex')
}

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
    const merged = structuredClone({ ...DEFAULT_POLICY, ...policy })
    this.policyHash = hashPolicy(merged)
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

    return this.buildDecision(proposal, null, 'DENY')
  }

  private matchCondition(
    rule: PolicyRule,
    proposal: OperationProposal,
    ctx: GUARDContext,
  ): boolean {
    const cond = rule.condition
    const payload = (proposal.payload ?? {}) as Record<string, unknown>

    switch (cond.type) {
      case 'ALWAYS':
        return true

      case 'AGENT_PERMISSION': {
        const allowed = this.policy.operationPermissions?.[proposal.operationType]
        return !!allowed && !allowed.includes(proposal.agentName)
      }

      case 'INVALID_FINANCIAL_AMOUNT': {
        if (!['PAYMENT', 'TRANSFER'].includes(proposal.operationType)) return false
        const raw = payload.totalAmount ?? payload.amount
        return typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || payload.currency !== 'MXN'
      }
      case 'SENSITIVE_APPROVAL':
        return ['PAYMENT', 'TRANSFER', 'NEAR_TRANSACTION'].includes(proposal.operationType)
      case 'REGISTERED_OPERATION':
        return REGISTERED_OPERATIONS.has(proposal.operationType)
      case 'UNAUTHORIZED_TOOL':
        return ['TOOL_EXECUTION', 'SHELL_COMMAND', 'EXTERNAL_REQUEST'].includes(proposal.operationType)

      case 'AMOUNT_LIMIT': {
        const raw = payload.totalAmount ?? payload.amount
        if (raw === undefined || raw === null) return false
        const amount = Number(raw)
        // Fail closed: a non-numeric or negative amount is treated as over the limit.
        if (!Number.isFinite(amount) || amount < 0) return true
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

    if (rule.condition.type === 'AMOUNT_LIMIT') {
      const payload = (proposal.payload ?? {}) as Record<string, unknown>
      const amount = Number(payload.totalAmount ?? payload.amount ?? 0)
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
      reason:      rule ? `Regla ${rule.id}: ${rule.description}` : 'Sin regla coincidente — DENY por defecto',
      escalateTo:  outcome === 'ESCALATE' ? 'MINOS' : outcome === 'DENY' && rule?.id === 'R-007' ? 'TARTARUS' : null,
      decidedAt:   Date.now(),
    }
  }

  updatePolicy(patch: { vendorAllowlist?: string[]; budgetCategories?: Record<string, number> }): void {
    if (patch.vendorAllowlist) this.policy.vendorAllowlist = [...patch.vendorAllowlist]
    if (patch.budgetCategories) this.policy.budgetCategories = { ...patch.budgetCategories }
    this.policyHash = hashPolicy(this.policy)
    this.policy.hash = this.policyHash
    this.policy.version = `${this.policy.version.split('.')[0]}.${this.policy.version.split('.')[1]}.${parseInt(this.policy.version.split('.')[2] ?? '0') + 1}`
  }

  getPolicyVersion(): string { return this.policy.version }
  getPolicyHash(): string    { return this.policyHash }
  getEvaluationCount(): number { return this.evaluationCount }
  getPolicy(): CerberusPolicy  { return structuredClone(this.policy) }
}
