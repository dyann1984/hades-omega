import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskResult, EscalationRequest } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'
import { bus } from '../mission-bus/index.js'

export class MinosAgent extends AgentBase {
  private pendingEscalations: Map<string, EscalationRequest> = new Map()
  private resolvedEscalations: Map<string, { approved: boolean; decidedBy: string; decidedAt: number }> = new Map()

  constructor(deps: AgentDependencies) {
    super('MINOS', deps)
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
    this.setStatus('WAITING', 'Esperando revisión humana')

    const escalation = this.createEscalation(task)
    this.pendingEscalations.set(escalation.id, escalation)

    bus.publish({ type: 'ESCALATION_CREATED', payload: { escalation } })

    // In demo mode, auto-resolve after 3 seconds
    await delay(3000)

    const decision = await this.autoResolveDemo(escalation.id)

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId:      task.id,
      success:     decision.approved,
      summary:     decision.approved
        ? `Escalación aprobada por ${decision.decidedBy} [DEMO]`
        : `Escalación rechazada por ${decision.decidedBy} [DEMO]`,
      data:        {
        escalationId: escalation.id,
        fromAgent:    escalation.fromAgent,
        reason:       escalation.reason,
        approved:     decision.approved,
        decidedBy:    decision.decidedBy,
      },
      cerberusIds: [],
    }
  }

  private createEscalation(task: Task): EscalationRequest {
    return {
      id:            uuidv4(),
      fromAgent:     'CHARON',
      operationType: 'PURCHASE_ORDER',
      payload:       { taskId: task.id, title: task.title, missionId: task.missionId },
      reason:        'Monto de compra requiere aprobación humana según política R-002',
      auditId:       uuidv4(),
      priority:      'HIGH',
      timeoutAt:     Date.now() + 300_000,
      createdAt:     Date.now(),
    }
  }

  private async autoResolveDemo(escalationId: string): Promise<{ approved: boolean; decidedBy: string; decidedAt: number }> {
    const decision = { approved: true, decidedBy: 'Operador DEMO', decidedAt: Date.now() }
    this.pendingEscalations.delete(escalationId)
    this.resolvedEscalations.set(escalationId, decision)
    return decision
  }

  async humanDecide(escalationId: string, approved: boolean, decidedBy: string): Promise<boolean> {
    if (!this.pendingEscalations.has(escalationId)) return false
    const decision = { approved, decidedBy, decidedAt: Date.now() }
    this.pendingEscalations.delete(escalationId)
    this.resolvedEscalations.set(escalationId, decision)
    return true
  }

  getPendingEscalations(): EscalationRequest[] {
    return Array.from(this.pendingEscalations.values())
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
