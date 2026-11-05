import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type {
  OperationProposal,
  GUARDDecision,
  GUARDOutcome,
} from '../types/index.js'
import type { CerberusPolicy, PolicyRule } from './policy.js'
import { DEFAULT_POLICY } from './policy.js'
import { collectAmounts, findHiddenEffectKeys } from './tools.js'
import { ruleReasonCode, type GuardReasonCode } from './decision-codes.js'

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

  /**
   * Fail-secure: this method never throws. Any internal error (hostile payload, broken rule, bug) is answered with
   * DENY / GUARD_INTERNAL_ERROR, which the audit trail records like any other decision.
   */
  evaluate(proposal: OperationProposal, ctx: GUARDContext = {}): GUARDDecision {
    this.evaluationCount++
    try {
      return this.evaluateRules(proposal, ctx)
    } catch {
      let id = 'unknown'
      try { id = String(proposal.id) } catch { /* proposal itself is hostile */ }
      return { proposalId: id, auditId: uuidv4(), outcome: 'DENY', ruleMatched: null, reason: 'GUARD_INTERNAL_ERROR: la evaluación falló; denegado por seguridad (fail-secure)', reasonCode: 'GUARD_INTERNAL_ERROR', escalateTo: null, decidedAt: Date.now() }
    }
  }

  /** Total order: priority (high first), then the stricter outcome (DENY > ESCALATE > PERMIT), then rule id. Never the array position. */
  private static readonly OUTCOME_RANK: Record<GUARDOutcome, number> = { DENY: 0, ESCALATE: 1, PERMIT: 2 }
  private static compareRules(a: PolicyRule, b: PolicyRule): number {
    return (b.priority - a.priority) || (CerberusGUARD.OUTCOME_RANK[a.outcome] - CerberusGUARD.OUTCOME_RANK[b.outcome]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }

  private evaluateRules(proposal: OperationProposal, ctx: GUARDContext): GUARDDecision {
    if (proposal.policyHash !== undefined && proposal.policyHash !== this.policyHash) {
      return this.buildDecision(proposal, null, 'DENY', 'GUARD_POLICY_STALE', 'GUARD_POLICY_STALE: la propuesta se preparó con otra política que la vigente')
    }
    const activeRules = this.policy.rules
      .filter(r => r.active)
      .filter(r => r.operationType === '*' || r.operationType === proposal.operationType)
      .filter(r => !r.agent || r.agent === '*' || r.agent === proposal.agentName)
      .sort(CerberusGUARD.compareRules)

    for (const rule of activeRules) {
      const matches = this.matchCondition(rule, proposal, ctx)
      if (matches) {
        const outcome = this.resolveOutcome(rule, proposal, ctx)
        // An ESCALATE rule that resolves to DENY (invalid or over-budget amount) is an amount-limit denial.
        return this.buildDecision(proposal, rule, outcome, outcome !== rule.outcome && outcome === 'DENY' ? 'POLICY_AMOUNT_LIMIT' : undefined)
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
        // Own-property lookup only: names such as "constructor" or "__proto__" must not resolve to prototype members.
        const perms = this.policy.operationPermissions
        const allowed = perms && Object.hasOwn(perms, proposal.operationType) ? perms[proposal.operationType] : undefined
        return !!allowed && !allowed.includes(proposal.agentName)
      }

      case 'INVALID_FINANCIAL_AMOUNT': {
        if (!['PAYMENT', 'TRANSFER'].includes(proposal.operationType)) return false
        // Every amount-like value must be valid; checking only the first one lets a bad figure hide behind a good one.
        const amounts = collectAmounts(payload)
        return amounts.length === 0 || amounts.some(raw => typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) || payload.currency !== 'MXN'
      }
      case 'HIDDEN_EFFECT':
        return REGISTERED_OPERATIONS.has(proposal.operationType) && findHiddenEffectKeys(payload).length > 0
      case 'SENSITIVE_APPROVAL':
        return ['PAYMENT', 'TRANSFER', 'NEAR_TRANSACTION'].includes(proposal.operationType)
      case 'REGISTERED_OPERATION':
        return REGISTERED_OPERATIONS.has(proposal.operationType)
      case 'UNAUTHORIZED_TOOL':
        return ['TOOL_EXECUTION', 'SHELL_COMMAND', 'EXTERNAL_REQUEST'].includes(proposal.operationType)

      case 'AMOUNT_LIMIT': {
        const max = this.highestAmount(payload)
        // Fail closed: a non-numeric or negative amount is treated as over the limit.
        if (max === 'INVALID') return true
        return max !== null && max > (cond.maxAmount ?? Infinity)
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
      const max = this.highestAmount((proposal.payload ?? {}) as Record<string, unknown>)
      if (max === 'INVALID' || (ctx.budgetLimit && max !== null && max > ctx.budgetLimit)) return 'DENY'
    }

    return 'ESCALATE'
  }

  /** Largest amount-like value anywhere in the payload; 'INVALID' if any is non-numeric or negative; null if none. */
  private highestAmount(payload: unknown): number | 'INVALID' | null {
    let max: number | null = null
    for (const raw of collectAmounts(payload)) {
      if (raw === undefined || raw === null) continue
      const n = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw)
      if (!Number.isFinite(n) || n < 0) return 'INVALID'
      max = max === null ? n : Math.max(max, n)
    }
    return max
  }

  private buildDecision(
    proposal: OperationProposal,
    rule: PolicyRule | null,
    outcome: GUARDOutcome,
    code?: GuardReasonCode,
    reasonText?: string,
  ): GUARDDecision {
    return {
      proposalId:  proposal.id,
      auditId:     uuidv4(),
      outcome,
      ruleMatched: rule?.id ?? null,
      reasonCode:  code ?? ruleReasonCode(rule?.id ?? null),
      reason:      reasonText ?? (rule ? `Regla ${rule.id}: ${rule.description}` : 'Sin regla coincidente — DENY por defecto'),
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
