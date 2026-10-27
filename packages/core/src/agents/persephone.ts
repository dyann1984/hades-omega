import type { Task, TaskResult } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'

export class PersephoneAgent extends AgentBase {
  private availableBudget = 50000
  private currency = 'MXN'

  constructor(deps: AgentDependencies) {
    super('PERSEPHONE', deps)
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
    this.setStatus('THINKING', task.title)

    await delay(400)

    const requestedAmount = (task as any).budgetAmount ?? 50000
    const categoryLimit   = 50000

    this.setStatus('EXECUTING', 'Validando presupuesto')
    await delay(300)

    const sufficient = requestedAmount <= this.availableBudget

    const { decision, auditId } = await this.proposeOperation(
      'BUDGET_APPROVAL',
      {
        amount:      requestedAmount,
        currency:    this.currency,
        category:    'INFRASTRUCTURE',
        description: task.description,
      },
      task.missionId,
      task.id,
      { currentBudget: this.availableBudget, budgetLimit: categoryLimit },
    )

    if (decision.outcome === 'PERMIT') {
      this.availableBudget -= requestedAmount
    }

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId:      task.id,
      success:     decision.outcome === 'PERMIT',
      summary:     sufficient
        ? `Presupuesto validado: $${requestedAmount.toLocaleString()} ${this.currency} disponible [DEMO]`
        : `Presupuesto insuficiente: se solicitaron $${requestedAmount.toLocaleString()} — disponibles $${this.availableBudget.toLocaleString()}`,
      data: { simulated: true,
        requestedAmount,
        availableBefore: this.availableBudget + (decision.outcome === 'PERMIT' ? requestedAmount : 0),
        availableAfter:  this.availableBudget,
        currency:        this.currency,
        decision,
      },
      cerberusIds: [auditId],
    }
  }

  resetBudget(amount: number): void {
    this.availableBudget = amount
  }

  getAvailableBudget(): number { return this.availableBudget }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
