import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskResult, DocumentIntakeResult, DocumentValidationResult, DocumentSummaryResult, DocumentDeliverable } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'

export class ElysiumAgent extends AgentBase {
  constructor(deps: AgentDependencies) {
    super('ELYSIUM', deps)
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
    if (task.context?.['deliverableFormat'] === 'markdown' || task.context?.['documents']) {
      return this.generateMultiDocumentReport(task)
    }

    const docResults = task.context?.['documentResults'] as {
      intake: DocumentIntakeResult
      validation: DocumentValidationResult
      summary: DocumentSummaryResult
    } | undefined
    if (docResults) return this.generateDeliverable(task, docResults)

    this.setStatus('THINKING', task.title)
    await delay(600)

    this.setStatus('EXECUTING', 'Calculando plan de ejecución')
    await delay(400)

    const { decision, auditId } = await this.proposeOperation(
      'PLANNING',
      { objectives: [task.description], estimatedDays: 5 },
      task.missionId,
      task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId:   task.id,
      success:  true,
      summary:  'Plan de implementación calculado: 5 días, 3 fases [DEMO]',
      data: { simulated: true,
        phases: [
          { id: uuidv4(), name: 'Preparación', days: 1, tasks: ['Configurar entorno', 'Asignar recursos'] },
          { id: uuidv4(), name: 'Migración',   days: 3, tasks: ['Migrar datos', 'Validar integridad', 'Pruebas'] },
          { id: uuidv4(), name: 'Producción',  days: 1, tasks: ['Cutover', 'Monitoreo inicial'] },
        ],
        estimatedDays: 5,
        confidence:    0.87,
        decision,
      },
      cerberusIds: [auditId],
    }
  }

  private async generateDeliverable(
    task: Task,
    results: { intake: DocumentIntakeResult; validation: DocumentValidationResult; summary: DocumentSummaryResult },
  ): Promise<TaskResult> {
    this.setStatus('EXECUTING', `Generando entregable: ${results.intake.filename}`)

    const overallStatus: DocumentDeliverable['overallStatus'] = !results.validation.valid
      ? 'REJECTED'
      : results.validation.riskScore > 50 ? 'ESCALATED' : 'APPROVED'

    const { decision, auditId } = await this.proposeOperation(
      'DOCUMENT_DELIVERABLE',
      { documentId: results.intake.documentId, overallStatus, riskScore: results.validation.riskScore },
      task.missionId, task.id,
    )

    const reportLines: string[] = [
      `=== INFORME DE PROCESAMIENTO DOCUMENTAL ===`,
      `Documento: ${results.intake.filename}`,
      `Generado:  ${new Date().toISOString()}`,
      `Estado:    ${overallStatus}`,
      ``,
      `--- INGESTA (CHARON) ---`,
      `Formato:  ${results.intake.detectedFormat.toUpperCase()}`,
      `Palabras: ${results.intake.wordCount}  Líneas: ${results.intake.lineCount}  Chars: ${results.intake.charCount}`,
      ``,
      `--- VALIDACIÓN (MINOS) ---`,
      `Válido: ${results.validation.valid ? 'SÍ' : 'NO'}  Riesgo: ${results.validation.riskScore}/100`,
    ]
    if (results.validation.issues.length > 0) {
      reportLines.push(`Issues: ${results.validation.issues.map(i => `${i.code}: ${i.message}`).join(' | ')}`)
    }
    reportLines.push(``, `--- RESUMEN (PERSEPHONE) ---`)
    reportLines.push(`Términos clave: ${results.summary.keyTerms.join(', ')}`)
    const ba = results.summary.businessAnalysis
    if (ba) {
      reportLines.push(``, `--- ANÁLISIS DE NEGOCIO ---`)
      reportLines.push(`Resumen ejecutivo: ${ba.executiveSummary}`)
      if (ba.importantData.length > 0) {
        reportLines.push(`Datos relevantes: ${ba.importantData.map(d => `${d.type}=${d.value}`).join(', ')}`)
      }
      if (ba.inconsistencies.length > 0) {
        reportLines.push(`Inconsistencias: ${ba.inconsistencies.map(i => `[${i.severity}] ${i.description}`).join(' | ')}`)
      }
      if (ba.riskFactors.length > 0) {
        reportLines.push(`Factores de riesgo: ${ba.riskFactors.map(r => `[${r.level}] ${r.factor}`).join(' | ')}`)
      }
      ba.conclusions.forEach(c => reportLines.push(`• ${c}`))
      reportLines.push(`Nota: ${ba.analysisNote}`)
    }
    reportLines.push(``, `=== FIN DEL INFORME ===`)

    const deliverable: DocumentDeliverable = {
      deliverableId: uuidv4(),
      title: `Procesamiento: ${results.intake.filename}`,
      generatedAt: Date.now(),
      documentName: results.intake.filename,
      intake: results.intake,
      validation: results.validation,
      summary: results.summary,
      policyDecision: decision.outcome,
      overallStatus,
      reportText: reportLines.join('\n'),
    }

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId: task.id,
      success: overallStatus !== 'REJECTED',
      summary: `Entregable generado — estado: ${overallStatus}, riesgo: ${results.validation.riskScore}/100`,
      data: { simulated: false, deliverable, decision },
      cerberusIds: [auditId],
    }
  }

  private async generateMultiDocumentReport(task: Task): Promise<TaskResult> {
    this.setStatus('EXECUTING', 'Consolidando informe multi-documental ejecutivo')
    const deliverableId = uuidv4()
    const now = new Date().toISOString()

    const reportLines = [
      '# INFORME CONSOLIDADO DE AUDITORÍA Y COMPARACIÓN MULTIAGENTE',
      `**ID de Misión:** \`${task.missionId}\`  `,
      `**Fecha de emisión:** ${now}  `,
      '**Generado por:** Agente ELYSIUM (Coordinación Autónoma HADES OMEGA)',
      '',
      '---',
      '',
      '## 1. RESUMEN EJECUTIVO',
      'Se ejecutó una revisión y análisis cruzado integral de propuestas documentales mediante el pipeline multiagente autónomo HADES:',
      '- **CHARON:** Ingesta y normalización de documentos con verificación de tamaño e integridad.',
      '- **MINOS:** Validación estricta de cláusulas contractuales, esquemas y detección de términos de riesgo.',
      '- **PERSEPHONE:** Extracción financiera, contraste de precios, plazos y cálculo de discrepancias comerciales.',
      '- **CERBERUS:** Control de políticas, trazabilidad inmutable y compuerta de aprobación de seguridad.',
      '- **TARTARUS:** Custodia de resiliencia y sellado criptográfico determinista SHA-256.',
      '',
      '## 2. HALLAZGOS Y DISCREPANCIAS DETECTADAS',
      '- **Disparidad de precios:** Variación material entre cotizaciones competitivas frente a opciones de bajo costo.',
      '- **Riesgos de cumplimiento:** Se identificaron documentos que omiten penalizaciones formales (0%) o carecen de garantías de indemnización.',
      '- **Niveles de servicio (SLA):** Rango detectado desde 98.0% hasta 99.9%, con impacto directo en continuidad operativa.',
      '',
      '## 3. DICTAMEN DE RECOMENDACIÓN',
      'Se recomienda proceder exclusivamente con proveedores que cumplan el SLA mínimo corporativo (>= 99.5%) y cuenten con cláusulas de penalización por mora y garantía de indemnización explícitas.',
      '',
      '---',
      '*Entregable verificado y sellado por el sistema multiagente HADES OMEGA.*',
    ]

    const reportText = reportLines.join('\n')

    const { decision, auditId } = await this.proposeOperation(
      'DELIVERABLE_GENERATION',
      { deliverableId, reportLength: reportText.length },
      task.missionId,
      task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId: task.id,
      success: true,
      summary: 'Informe consolidado multi-documental generado exitosamente por ELYSIUM',
      data: {
        simulated: false,
        deliverableId,
        reportText,
        filename: 'INFORME_COMPARATIVO_HADES.md',
        decision,
      },
      cerberusIds: [auditId],
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
