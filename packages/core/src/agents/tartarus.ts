import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'node:crypto'
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
    const cryptoInput = (task.context?.['cryptoPayload'] ?? task.context?.['sha256Input'] ?? (task.context?.['cryptographicHash'] ? `${task.title}:${task.missionId}` : undefined)) as string | undefined
    if (cryptoInput !== undefined) return this.computeSha256(task, cryptoInput)

    const errors = task.context?.['errors'] as string[] | undefined
    const documentId = task.context?.['documentId'] as string | undefined
    if (errors !== undefined) return this.logErrors(task, errors, documentId)

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
      data:        { simulated: true, anomalies, auditStats, decision },
      cerberusIds: [auditId],
    }
  }

  private async logErrors(task: Task, errors: string[], documentId?: string): Promise<TaskResult> {
    this.setStatus('EXECUTING', 'Registrando errores del flujo')

    const anomalies: AnomalyReport[] = errors.map(msg => ({
      id:                  uuidv4(),
      detectedAt:          Date.now(),
      agentInvolved:       null,
      anomalyType:         'DOCUMENT_PROCESSING_ERROR',
      description:         msg,
      severity:            'MEDIUM' as const,
      evidence:            documentId ? [{ type: 'SYSTEM_EVENT' as const, referenceId: documentId, description: msg }] : [],
      recommendedResponse: 'WARN' as const,
    }))

    for (const a of anomalies) {
      this.activeAnomalies.set(a.id, a)
      bus.publish({ type: 'ANOMALY_DETECTED', payload: { anomaly: a } })
    }

    const { decision, auditId } = await this.proposeOperation(
      'ANOMALY_REPORT',
      { anomaliesFound: anomalies.length, source: 'DOCUMENT_PROCESSING', documentId },
      task.missionId, task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId: task.id,
      success: true,
      summary: errors.length === 0
        ? 'Sin errores en el flujo de procesamiento'
        : `${errors.length} error(s) registrado(s)`,
      data: { simulated: false, anomalies, decision },
      cerberusIds: [auditId],
    }
  }

  private async computeSha256(task: Task, input: string): Promise<TaskResult> {
    this.setStatus('EXECUTING', 'Calculando hash criptográfico SHA-256')
    const sha256 = createHash('sha256').update(input, 'utf8').digest('hex')
    const { decision, auditId } = await this.proposeOperation(
      'CRYPTO_HASH',
      { algorithm: 'sha256', inputBytes: Buffer.byteLength(input, 'utf8'), digest: sha256 },
      task.missionId,
      task.id,
    )
    this.setStatus('IDLE')
    this.currentTask = null
    return {
      taskId: task.id,
      success: decision.outcome !== 'DENY',
      summary: `Hash SHA-256 calculado determinísticamente por TARTARUS: ${sha256}`,
      data: {
        algorithm: 'sha256',
        encoding: 'utf8',
        sha256,
        inputBytes: Buffer.byteLength(input, 'utf8'),
        executor: 'TARTARUS',
        simulated: false,
      },
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
