import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskResult, EscalationRequest, DocumentPayload, DocumentIntakeResult, DocumentValidationResult, ValidationIssue } from '../types/index.js'
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
    const doc = task.context?.['document'] as DocumentPayload | undefined
    const intake = task.context?.['intakeResult'] as DocumentIntakeResult | undefined
    if (doc && intake) return this.validateDocument(task, doc, intake)

    this.setStatus('WAITING', 'Esperando revisión humana')

    const escalation = this.createEscalation(task)
    this.pendingEscalations.set(escalation.id, escalation)

    bus.publish({ type: 'ESCALATION_CREATED', payload: { escalation } })

    return {
      taskId:      task.id,
      success:     false,
      summary:     'Escalación pendiente de decisión humana verificable',
      data:        {
        escalationId: escalation.id,
        fromAgent:    escalation.fromAgent,
        reason:       escalation.reason,
        pendingApproval: true,
      },
      cerberusIds: [],
    }
  }

  private async validateDocument(task: Task, doc: DocumentPayload, intake: DocumentIntakeResult): Promise<TaskResult> {
    this.setStatus('EXECUTING', `Validando: ${doc.filename}`)

    const issues: ValidationIssue[] = []
    const rulesPassed: string[] = []
    const rulesFailed: string[] = []

    const MAX_SIZE = 5 * 1024 * 1024
    if (doc.sizeBytes > MAX_SIZE) {
      issues.push({ severity: 'HIGH', code: 'V-001', message: `Tamaño excede límite: ${doc.sizeBytes} > ${MAX_SIZE} bytes` })
      rulesFailed.push('V-001: SIZE_LIMIT')
    } else {
      rulesPassed.push('V-001: SIZE_LIMIT')
    }

    const ALLOWED_TYPES = [
      'text/plain', 'application/json', 'text/csv', 'text/markdown', 'text/x-markdown',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!ALLOWED_TYPES.includes(doc.mimeType)) {
      issues.push({ severity: 'HIGH', code: 'V-002', message: `Tipo MIME no permitido: ${doc.mimeType}` })
      rulesFailed.push('V-002: ALLOWED_TYPES')
    } else {
      rulesPassed.push('V-002: ALLOWED_TYPES')
    }

    if (doc.content.trim().length === 0) {
      issues.push({ severity: 'HIGH', code: 'V-003', message: 'Contenido vacío' })
      rulesFailed.push('V-003: NON_EMPTY')
    } else {
      rulesPassed.push('V-003: NON_EMPTY')
    }

    if (intake.detectedFormat === 'json' && intake.metadata['jsonParseError']) {
      issues.push({ severity: 'HIGH', code: 'V-004', message: 'JSON inválido' })
      rulesFailed.push('V-004: JSON_VALID')
    } else if (intake.detectedFormat === 'json') {
      rulesPassed.push('V-004: JSON_VALID')
    }

    if (intake.wordCount < 3) {
      issues.push({ severity: 'LOW', code: 'V-005', message: `Contenido muy corto: ${intake.wordCount} palabras` })
      rulesFailed.push('V-005: MIN_WORDS')
    } else {
      rulesPassed.push('V-005: MIN_WORDS')
    }

    if (intake.detectedFormat === 'pdf') {
      const exMethod = intake.metadata['extractionMethod'] as string | undefined
      if (exMethod === 'pdf-parse' && intake.wordCount < 10) {
        issues.push({ severity: 'MEDIUM', code: 'V-006', message: 'PDF posiblemente escaneado (< 10 palabras extraídas) — OCR no disponible' })
        rulesFailed.push('V-006: PDF_SCANNED_DETECTION')
      } else {
        rulesPassed.push('V-006: PDF_SCANNED_DETECTION')
      }
    }

    const highCount = issues.filter(i => i.severity === 'HIGH').length
    const medCount = issues.filter(i => i.severity === 'MEDIUM').length
    const riskScore = Math.min(100, highCount * 40 + medCount * 15 + rulesFailed.length * 5)
    const valid = highCount === 0

    const validationResult: DocumentValidationResult = { valid, riskScore, issues, rulesPassed, rulesFailed }

    const { decision, auditId } = await this.proposeOperation(
      'DOCUMENT_VALIDATION',
      { documentId: intake.documentId, valid, riskScore, issueCount: issues.length },
      task.missionId, task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId: task.id,
      success: valid,
      summary: valid
        ? `Documento validado — ${rulesPassed.length} reglas OK, riesgo: ${riskScore}/100`
        : `Validación fallida — ${highCount} error(es) crítico(s)`,
      data: { simulated: false, validationResult, decision },
      cerberusIds: [auditId],
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
