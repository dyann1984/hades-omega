import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskResult, VendorEvaluation, PurchaseOrderProposal, DocumentPayload, DocumentIntakeResult } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'

const DEMO_VENDORS = [
  { vendorId: 'cloudpro-premium',   name: 'CloudPro Premium',   price: 78500, priceScore: 45, qualityScore: 95, deliveryScore: 90, compliant: true  },
  { vendorId: 'cloudpro-standard',  name: 'CloudPro Standard',  price: 42000, priceScore: 75, qualityScore: 80, deliveryScore: 85, compliant: true  },
  { vendorId: 'techvision',         name: 'TechVision Corp',     price: 38000, priceScore: 82, qualityScore: 78, deliveryScore: 80, compliant: true  },
  { vendorId: 'inframax',           name: 'InfraMax Solutions',  price: 29500, priceScore: 90, qualityScore: 72, deliveryScore: 75, compliant: true  },
  { vendorId: 'unregistered-corp',  name: 'Proveedor No Aprobado', price: 25000, priceScore: 95, qualityScore: 65, deliveryScore: 60, compliant: false },
]

export class CharonAgent extends AgentBase {
  constructor(deps: AgentDependencies) {
    super('CHARON', deps)
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
    const batchDocs = task.context?.['documents'] as DocumentPayload[] | undefined
    if (batchDocs && Array.isArray(batchDocs) && batchDocs.length > 0) {
      return this.intakeBatchDocuments(task, batchDocs)
    }

    const doc = task.context?.['document'] as DocumentPayload | undefined
    if (doc) return this.intakeDocument(task, doc)

    this.setStatus('THINKING', task.title)
    await delay(800)

    const evaluations = await this.evaluateVendors(task)
    const bestVendor  = evaluations.find(v => v.recommendation === 'APPROVE')
      ?? evaluations.find(v => v.recommendation === 'ESCALATE')
      ?? evaluations[0]!

    this.setStatus('EXECUTING', 'Generando orden de compra')
    await delay(500)

    const { decision, auditId } = await this.proposeOperation(
      'PURCHASE_ORDER',
      {
        vendorId:     bestVendor.vendorId,
        vendorName:   bestVendor.vendorName,
        totalAmount:  bestVendor.price,
        currency:     'MXN',
        justification: `Proveedor seleccionado con puntuación total ${bestVendor.totalScore}/100`,
      } satisfies Partial<PurchaseOrderProposal>,
      task.missionId,
      task.id,
      { budgetLimit: 50000, vendorAllowlist: this.deps.guard.getPolicy().vendorAllowlist },
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId:      task.id,
      success:     decision.outcome !== 'DENY',
      summary:     this.buildSummary(decision.outcome, bestVendor),
      data:        { simulated: true, evaluations, selectedVendor: bestVendor, decision },
      cerberusIds: [auditId],
    }
  }

  private async intakeDocument(task: Task, doc: DocumentPayload): Promise<TaskResult> {
    this.setStatus('EXECUTING', `Procesando documento: ${doc.filename}`)

    const documentId = uuidv4()
    const wordCount = doc.content.split(/\s+/).filter(Boolean).length
    const lineCount = doc.content.split('\n').length
    const charCount = doc.content.length

    let detectedFormat: DocumentIntakeResult['detectedFormat'] = 'unknown'
    const nameLower = doc.filename.toLowerCase()
    if (nameLower.endsWith('.json') || doc.mimeType === 'application/json') detectedFormat = 'json'
    else if (nameLower.endsWith('.csv') || doc.mimeType === 'text/csv') detectedFormat = 'csv'
    else if (nameLower.endsWith('.md')) detectedFormat = 'md'
    else if (nameLower.endsWith('.txt') || doc.mimeType === 'text/plain') detectedFormat = 'txt'
    else if (nameLower.endsWith('.pdf') || doc.mimeType === 'application/pdf') detectedFormat = 'pdf'
    else if (nameLower.endsWith('.docx') || doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') detectedFormat = 'docx'

    const metadata: Record<string, unknown> = { filename: doc.filename, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, extractionMethod: doc.extractionMethod ?? 'text' }
    if (detectedFormat === 'json') {
      try {
        const parsed = JSON.parse(doc.content) as unknown
        metadata['topKeys'] = Object.keys(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as object) : {}).slice(0, 10)
        metadata['isArray'] = Array.isArray(parsed)
        if (Array.isArray(parsed)) metadata['arrayLength'] = parsed.length
      } catch { metadata['jsonParseError'] = true }
    }
    if (detectedFormat === 'csv') {
      const lines = doc.content.split('\n').filter(Boolean)
      metadata['rowCount'] = lines.length
      metadata['columns'] = lines[0]?.split(',').map(c => c.trim()) ?? []
    }
    if (detectedFormat === 'pdf' && doc.extractionMetadata) {
      if (doc.extractionMetadata['pageCount']) metadata['pageCount'] = doc.extractionMetadata['pageCount']
      if (doc.extractionMetadata['pdfTitle']) metadata['pdfTitle'] = doc.extractionMetadata['pdfTitle']
    }
    if (detectedFormat === 'docx' && doc.extractionMetadata) {
      if (doc.extractionMetadata['warnings']) metadata['docxWarnings'] = doc.extractionMetadata['warnings']
    }

    const intakeResult: DocumentIntakeResult = { documentId, filename: doc.filename, wordCount, lineCount, charCount, detectedFormat, metadata }

    const { decision, auditId } = await this.proposeOperation(
      'DOCUMENT_INTAKE',
      { documentId, filename: doc.filename, format: detectedFormat, sizeBytes: doc.sizeBytes },
      task.missionId, task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId: task.id,
      success: true,
      summary: `Documento "${doc.filename}" procesado — ${wordCount} palabras, formato: ${detectedFormat}`,
      data: { simulated: false, intakeResult, decision },
      cerberusIds: [auditId],
    }
  }

  private async intakeBatchDocuments(task: Task, docs: DocumentPayload[]): Promise<TaskResult> {
    this.setStatus('EXECUTING', `Procesando lote de ${docs.length} documentos`)
    const intakeResults: DocumentIntakeResult[] = []
    const auditIds: string[] = []
    let totalWords = 0

    for (const doc of docs) {
      const documentId = uuidv4()
      const wordCount = doc.content.split(/\s+/).filter(Boolean).length
      const lineCount = doc.content.split('\n').length
      const charCount = doc.content.length
      totalWords += wordCount

      let detectedFormat: DocumentIntakeResult['detectedFormat'] = 'txt'
      const nameLower = doc.filename.toLowerCase()
      if (nameLower.endsWith('.json') || doc.mimeType === 'application/json') detectedFormat = 'json'
      else if (nameLower.endsWith('.pdf') || doc.mimeType === 'application/pdf') detectedFormat = 'pdf'
      else if (nameLower.endsWith('.docx') || doc.mimeType?.includes('word')) detectedFormat = 'docx'

      const intakeResult: DocumentIntakeResult = {
        documentId,
        filename: doc.filename,
        wordCount,
        lineCount,
        charCount,
        detectedFormat,
        metadata: { filename: doc.filename, sizeBytes: doc.sizeBytes ?? doc.content.length },
      }
      intakeResults.push(intakeResult)

      const { auditId } = await this.proposeOperation(
        'BATCH_DOCUMENT_INTAKE',
        { documentId, filename: doc.filename, format: detectedFormat },
        task.missionId,
        task.id,
      )
      auditIds.push(auditId)
    }

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId: task.id,
      success: true,
      summary: `Lote de ${docs.length} documentos procesado exitosamente por CHARON (${totalWords} palabras totales)`,
      data: {
        simulated: false,
        totalDocuments: docs.length,
        totalWords,
        intakeResults,
      },
      cerberusIds: auditIds,
    }
  }

  private async evaluateVendors(task: Task): Promise<VendorEvaluation[]> {
    await delay(600)
    return DEMO_VENDORS.map(v => {
      const total =
        v.priceScore   * 0.4 +
        v.qualityScore * 0.3 +
        v.deliveryScore * 0.2 +
        (v.compliant ? 100 : 0) * 0.1

      const rec: VendorEvaluation['recommendation'] =
        !v.compliant    ? 'REJECT'
        : v.price > 50000 ? 'REJECT'
        : v.price > 30000 ? 'ESCALATE'
        : 'APPROVE'

      return {
        vendorId:       v.vendorId,
        vendorName:     v.name,
        price:          v.price,
        priceScore:     v.priceScore,
        qualityScore:   v.qualityScore,
        deliveryScore:  v.deliveryScore,
        complianceOk:   v.compliant,
        totalScore:     Math.round(total),
        recommendation: rec,
        notes:          rec === 'REJECT' && !v.compliant ? 'Proveedor no en lista aprobada' : '',
      } satisfies VendorEvaluation
    })
  }

  private buildSummary(outcome: string, vendor: VendorEvaluation): string {
    switch (outcome) {
      case 'PERMIT':   return `Orden de compra aprobada para ${vendor.vendorName} — $${vendor.price.toLocaleString()} MXN [DEMO]`
      case 'ESCALATE': return `Orden de compra escalada para revisión humana — $${vendor.price.toLocaleString()} MXN [DEMO]`
      case 'DENY':     return `Orden de compra rechazada — $${vendor.price.toLocaleString()} MXN supera el límite`
      default:         return 'Evaluación completada'
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
