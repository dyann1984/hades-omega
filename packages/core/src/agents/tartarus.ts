import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskResult, AnomalyReport } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'
import { bus } from '../mission-bus/index.js'

export class TartarusAgent extends AgentBase {
  private activeAnomalies: Map<string, AnomalyReport> = new Map()

  constructor(deps: AgentDependencies) {
    super('TARTARUS', deps)
    this.setStatus('IDLE', 'Monitoreando sistema')
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
    this.setStatus('THINKING', 'Analizando anomalías')
    await delay(400)

    const auditStats = this.deps.audit.getStats()
    const denyCount  = auditStats.byOutcome['DENY'] ?? 0
    const anomalies: AnomalyReport[] = []

    if (denyCount > 0) {
      const anomaly: AnomalyReport = {
        id:            uuidv4(),
        detectedAt:    Date.now(),
        agentInvolved: 'CHARON',
        anomalyType:   'POLICY_VIOLATION_PATTERN',
        description:   `Se detectaron ${denyCount} operaciones denegadas en la sesión actual`,
        severity:      denyCount > 3 ? 'HIGH' : 'LOW',
        evidence:      [{ type: 'AUDIT_RECORD', referenceId: 'audit-stats', description: `${denyCount} DENY decisiones` }],
        recommendedResponse: denyCount > 3 ? 'BLOCK' : 'WARN',
      }
      anomalies.push(anomaly)
      this.activeAnomalies.set(anomaly.id, anomaly)
      bus.publish({ type: 'ANOMALY_DETECTED', payload: { anomaly } })
    }

    const { decision, auditId } = await this.proposeOperation(
      'ANOMALY_REPORT',
      { anomaliesFound: anomalies.length, denyCount },
      task.missionId,
      task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId:      task.id,
      success:     true,
      summary:     anomalies.length === 0
        ? 'Sin anomalías detectadas en la sesión [DEMO]'
        : `${anomalies.length} anomalía(s) detectada(s) — monitoreo activo [DEMO]`,
      data:        { anomalies, auditStats, decision },
      cerberusIds: [auditId],
    }
  }

  getActiveAnomalies(): AnomalyReport[] {
    return Array.from(this.activeAnomalies.values())
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
