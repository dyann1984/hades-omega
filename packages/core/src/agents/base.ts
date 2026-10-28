import { v4 as uuidv4 } from 'uuid'
import type {
  AgentName,
  AgentStatus,
  Task,
  TaskResult,
  OperationProposal,
  GUARDDecision,
} from '../types/index.js'
import { bus } from '../mission-bus/index.js'
import { CerberusGUARD, type GUARDContext } from '../cerberus/guard.js'
import { CerberusAUDIT } from '../cerberus/audit.js'
import { NEARBridge } from '../near-bridge/index.js'

export interface AgentDependencies {
  guard:  CerberusGUARD
  audit:  CerberusAUDIT
  near:   NEARBridge
}

export abstract class AgentBase {
  readonly id:   string
  readonly name: AgentName
  protected status:      AgentStatus = 'IDLE'
  protected currentTask: Task | null = null
  protected deps:        AgentDependencies

  constructor(name: AgentName, deps: AgentDependencies) {
    this.name = name
    this.id   = `agent:${name.toLowerCase()}:001`
    this.deps = deps
  }

  getStatus(): AgentStatus { return this.status }
  getCurrentTask(): Task | null { return this.currentTask }

  protected setStatus(status: AgentStatus, taskDescription?: string): void {
    this.status = status
    bus.publish({
      type:    'AGENT_STATUS_CHANGED',
      payload: { agent: this.name, status, currentTask: taskDescription ?? null, missionId: this.currentTask?.missionId },
    })
  }

  protected async proposeOperation(
    operationType: string,
    payload:       unknown,
    missionId:     string,
    taskId:        string,
    ctx:           GUARDContext = {},
  ): Promise<{ decision: GUARDDecision; auditId: string }> {
    const proposal: OperationProposal = {
      id:            uuidv4(),
      agentId:       this.id,
      agentName:     this.name,
      operationType,
      payload,
      missionId,
      taskId,
      requestedAt:   Date.now(),
    }

    const decision = this.deps.guard.evaluate(proposal, ctx)
    const record   = this.deps.audit.createRecord(
      proposal,
      decision,
      this.deps.guard.getPolicyVersion(),
      this.deps.guard.getPolicyHash(),
    )

    // Register NEAR tx for PERMIT decisions on critical operations
    if (decision.outcome === 'PERMIT' && this.isCriticalOperation(operationType)) {
      const tx = await this.deps.near.storeAuditHash({
        auditId:       record.id,
        contentHash:   record.contentHash,
        operationType,
        agentName:     this.name,
        decision:      decision.outcome,
        timestampMs:   record.timestamp,
      })
      if (tx.mode === 'real') {
        this.deps.audit.setNearTx(record.id, tx.txHash, tx.explorerUrl)
        bus.publish({
          type: 'NEAR_TX_CONFIRMED',
          payload: { auditId: record.id, txHash: tx.txHash, explorerUrl: tx.explorerUrl },
        })
      }
    }

    bus.publish({ type: 'CERBERUS_DECISION', payload: { auditRecord: record } })

    return { decision, auditId: record.id }
  }

  private isCriticalOperation(type: string): boolean {
    return ['PURCHASE_ORDER', 'BUDGET_APPROVAL', 'VENDOR_EVALUATION'].includes(type)
  }

  abstract receiveTask(task: Task): Promise<TaskResult>
}
