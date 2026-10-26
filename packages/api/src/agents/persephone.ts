import { AgentBase } from './base.js';
import { cerberus } from '../cerberus.js';
import type { BudgetValidation, Task, TaskResult } from '../types.js';

interface BudgetState {
  category: string;
  total: number;
  committed: number;
  currency: string;
}

const BUDGET_LEDGER: Map<string, BudgetState> = new Map([
  ['INFRASTRUCTURE', { category: 'INFRASTRUCTURE', total: 50000, committed: 0, currency: 'MXN' }],
  ['OPERATIONS', { category: 'OPERATIONS', total: 20000, committed: 5000, currency: 'MXN' }],
  ['CONTINGENCY', { category: 'CONTINGENCY', total: 10000, committed: 0, currency: 'MXN' }],
]);

const SINGLE_TX_LIMIT = 10000;

export class PersephoneAgent extends AgentBase {
  constructor() {
    super('PERSEPHONE', '💰', 'Finance & Budget Control', 'Manages budgets, validates spending, issues alerts on threshold breaches and generates financial reports.');
  }

  async execute(task: Task): Promise<TaskResult> {
    this.setStatus('THINKING', 'Loading budget state');
    this.log(`Starting budget validation for task ${task.id.slice(0, 8)}`);
    await this.sleep(500);

    const category = 'INFRASTRUCTURE';
    const budget = BUDGET_LEDGER.get(category)!;
    const requestedAmount = this.extractAmount(task.description);

    const validation = this.validateBudget(budget, requestedAmount);

    this.log(`Budget validation: ${validation.approved ? 'APPROVED' : 'REJECTED'} — ${validation.utilizationPercent.toFixed(1)}% utilization`);

    const { guardResult, proposal } = await this.propose(
      'BUDGET_COMMITMENT',
      `Budget commitment: ${requestedAmount.toLocaleString()} MXN from ${category}`,
      {
        category,
        requestedAmount,
        availableBudget: budget.total - budget.committed,
        totalBudget: budget.total,
        utilizationPercent: validation.utilizationPercent,
        validation,
      },
      requestedAmount,
      'MXN'
    );

    const auditRecord = await cerberus.audit(proposal, guardResult);

    if (guardResult.decision === 'PERMIT' && validation.approved) {
      budget.committed += requestedAmount;
      BUDGET_LEDGER.set(category, budget);
    }

    this.setStatus('IDLE');
    return {
      success: guardResult.decision !== 'DENY',
      summary: `Budget validation for ${requestedAmount.toLocaleString()} MXN: ${guardResult.decision}. Available: ${(budget.total - budget.committed).toLocaleString()} MXN / ${budget.total.toLocaleString()} MXN (${validation.utilizationPercent.toFixed(1)}% utilization)`,
      data: { validation, budgetState: { ...budget }, decision: guardResult.decision },
      cerberusAuditId: auditRecord.id,
      nearTxHash: auditRecord.nearTxHash,
      nearExplorerUrl: auditRecord.nearExplorerUrl,
    };
  }

  private validateBudget(budget: BudgetState, amount: number): BudgetValidation {
    const available = budget.total - budget.committed;
    const utilizationAfter = ((budget.committed + amount) / budget.total) * 100;

    if (amount > available) {
      return {
        category: budget.category,
        requestedAmount: amount,
        availableBudget: available,
        currency: budget.currency,
        approved: false,
        utilizationPercent: utilizationAfter,
        requiresEscalation: false,
        reason: `Insufficient budget. Available: ${available.toLocaleString()} MXN, Requested: ${amount.toLocaleString()} MXN`,
      };
    }

    if (amount > SINGLE_TX_LIMIT) {
      return {
        category: budget.category,
        requestedAmount: amount,
        availableBudget: available,
        currency: budget.currency,
        approved: true,
        utilizationPercent: utilizationAfter,
        requiresEscalation: true,
        reason: `Amount ${amount.toLocaleString()} MXN exceeds single-transaction autonomous limit ${SINGLE_TX_LIMIT.toLocaleString()} MXN`,
      };
    }

    if (utilizationAfter > 80) {
      return {
        category: budget.category,
        requestedAmount: amount,
        availableBudget: available,
        currency: budget.currency,
        approved: true,
        utilizationPercent: utilizationAfter,
        requiresEscalation: false,
        reason: `ALERT: Budget utilization will reach ${utilizationAfter.toFixed(1)}% after this commitment`,
      };
    }

    return {
      category: budget.category,
      requestedAmount: amount,
      availableBudget: available,
      currency: budget.currency,
      approved: true,
      utilizationPercent: utilizationAfter,
      requiresEscalation: false,
      reason: 'Budget available and within operational limits',
    };
  }

  private extractAmount(description: string): number {
    const match = description.match(/\$?([\d,]+(?:\.\d{2})?)\s*(?:MXN)?/i);
    if (match) return parseFloat(match[1].replace(/,/g, ''));
    return 38500;
  }

  getBudgetStatus(): Array<BudgetState & { utilizationPercent: number }> {
    return Array.from(BUDGET_LEDGER.values()).map(b => ({
      ...b,
      utilizationPercent: Math.round((b.committed / b.total) * 1000) / 10,
    }));
  }
}
