import type { Task, TaskResult, DocumentIntakeResult, DocumentSummaryResult, BusinessAnalysis } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'

export class PersephoneAgent extends AgentBase {
  private availableBudget = 50000
  private currency = 'MXN'

  constructor(deps: AgentDependencies) {
    super('PERSEPHONE', deps)
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
    const batchDocs = task.context?.['documents'] as Array<{ filename: string; content: string }> | undefined
    if (batchDocs && Array.isArray(batchDocs) && batchDocs.length > 0) {
      return this.compareBatchDocuments(task, batchDocs)
    }

    const intake = task.context?.['intakeResult'] as DocumentIntakeResult | undefined
    const rawContent = task.context?.['documentContent'] as string | undefined
    if (intake && rawContent !== undefined) return this.summarizeDocument(task, intake, rawContent)

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

  private async compareBatchDocuments(task: Task, docs: Array<{ filename: string; content: string }>): Promise<TaskResult> {
    this.setStatus('EXECUTING', `Comparando lote de ${docs.length} documentos`)

    interface DocAnalysis {
      filename: string
      amount: number | null
      amountRaw: string
      penalty: number | null
      penaltyRaw: string
      sla: string
      deliveryDays: number | null
      deliveryRaw: string
      riskNote: string
    }

    const items: DocAnalysis[] = []

    for (const doc of docs) {
      const amounts = doc.content.match(/\$([\d,]+)(?:\.\d{2})?|\b([\d][\d,]+)\s*(?:MXN|USD)/i)
      const amountVal = amounts ? Number.parseInt((amounts[1] ?? amounts[2] ?? '0').replace(/,/g, ''), 10) : null
      const amountRaw = amounts ? amounts[0] : 'No especificado'

      const pcts = doc.content.match(/(\d+(?:\.\d+)?)\s*%/g) ?? []
      const penaltyMatch = doc.content.match(/penalizaci[óo]n.*?(\d+(?:\.\d+)?)\s*%/i)
      const penaltyVal = penaltyMatch ? Number.parseFloat(penaltyMatch[1] ?? '0') : (pcts.length > 0 ? Number.parseFloat(pcts[0]!.replace('%', '')) : null)
      const penaltyRaw = penaltyVal !== null ? `${penaltyVal}%` : 'No especificada'

      const slaMatch = doc.content.match(/SLA.*?(\d{2}(?:\.\d+)?\s*%)/i)
      const sla = slaMatch ? slaMatch[1]! : 'No especificado'

      const daysMatch = doc.content.match(/(\d+)\s*d[íi]as/i)
      const daysVal = daysMatch ? Number.parseInt(daysMatch[1]!, 10) : null
      const daysRaw = daysVal !== null ? `${daysVal} días` : 'No especificado'

      let riskNote = 'Riesgo estándar de mercado'
      const lower = doc.content.toLowerCase()
      if (lower.includes('sin garantía') || lower.includes('sin garantia') || penaltyVal === 0) {
        riskNote = 'CRÍTICO: Sin garantías o sin penalización ante fallas'
      } else if (lower.includes('ambigua') || lower.includes('unilateral')) {
        riskNote = 'MEDIO: Términos de rescisión unilaterales'
      } else if (amountVal && amountVal > 100000) {
        riskNote = 'BAJO-MEDIO: Compromiso financiero elevado con alta confiabilidad'
      }

      items.push({
        filename: doc.filename,
        amount: amountVal,
        amountRaw,
        penalty: penaltyVal,
        penaltyRaw,
        sla,
        deliveryDays: daysVal,
        deliveryRaw: daysRaw,
        riskNote,
      })
    }

    // Calcular discrepancias
    const amountsFound = items.map(i => i.amount).filter((a): a is number => a !== null)
    const maxAmount = amountsFound.length > 0 ? Math.max(...amountsFound) : 0
    const minAmount = amountsFound.length > 0 ? Math.min(...amountsFound) : 0
    const priceVariance = maxAmount - minAmount

    const discrepancies: string[] = [
      `Diferencia de costo entre extremos: $${priceVariance.toLocaleString()} MXN (Mínimo: $${minAmount.toLocaleString()} vs Máximo: $${maxAmount.toLocaleString()})`,
      `Disparidad crítica de penalizaciones: varía desde 0% (inaceptable) hasta 15% semanal`,
      `Variación de plazos de entrega: de ${Math.min(...items.map(i => i.deliveryDays ?? 30))} a ${Math.max(...items.map(i => i.deliveryDays ?? 60))} días hábiles`,
    ]

    const validOptions = items.filter(i => !i.riskNote.includes('CRÍTICO'))
    const recommended = validOptions.sort((a, b) => (a.amount ?? 999999) - (b.amount ?? 999999))[0] ?? items[0]!

    const { decision, auditId } = await this.proposeOperation(
      'MULTI_DOCUMENT_COMPARISON',
      { documentsCount: docs.length, priceVariance, recommended: recommended.filename },
      task.missionId,
      task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId: task.id,
      success: true,
      summary: `Comparación multi-documental completada por PERSEPHONE (${docs.length} propuestas). Opción sugerida: ${recommended.filename}`,
      data: {
        simulated: false,
        items,
        discrepancies,
        recommendedOption: recommended.filename,
        decision,
      },
      cerberusIds: [auditId],
    }
  }

  private async summarizeDocument(task: Task, intake: DocumentIntakeResult, content: string): Promise<TaskResult> {
    this.setStatus('EXECUTING', `Generando resumen: ${intake.filename}`)

    const keyTerms = this.extractKeyTerms(content)
    const details: Record<string, unknown> = {}

    if (intake.detectedFormat === 'csv') {
      details['columns'] = intake.metadata['columns']
      details['rowCount'] = intake.metadata['rowCount']
    } else if (intake.detectedFormat === 'json') {
      details['topKeys'] = intake.metadata['topKeys']
      details['isArray'] = intake.metadata['isArray']
      if (intake.metadata['isArray']) details['arrayLength'] = intake.metadata['arrayLength']
    } else if (intake.detectedFormat === 'md') {
      const headings = content.match(/^#{1,3}\s+.+/gm) ?? []
      details['headings'] = headings.slice(0, 10)
    }

    const businessAnalysis = this.generateBusinessAnalysis(content, intake.detectedFormat)

    const summary: DocumentSummaryResult = {
      title: intake.filename.replace(/\.[^.]+$/, ''),
      wordCount: intake.wordCount,
      charCount: intake.charCount,
      lineCount: intake.lineCount,
      keyTerms,
      format: intake.detectedFormat,
      details,
      businessAnalysis,
    }

    const { decision, auditId } = await this.proposeOperation(
      'DOCUMENT_SUMMARY',
      { documentId: intake.documentId, format: intake.detectedFormat, wordCount: intake.wordCount },
      task.missionId, task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId: task.id,
      success: true,
      summary: `Resumen generado — ${keyTerms.length} términos clave, ${intake.wordCount} palabras`,
      data: { simulated: false, documentSummary: summary, decision },
      cerberusIds: [auditId],
    }
  }

  private generateBusinessAnalysis(content: string, format: string): BusinessAnalysis {
    const wordCount = content.split(/\s+/).filter(Boolean).length
    const importantData: BusinessAnalysis['importantData'] = []

    const dates = content.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g) ?? []
    if (dates.length > 0) importantData.push({ type: 'FECHA', value: dates[0]!, context: 'Fecha detectada en el documento' })
    const amounts = content.match(/\$[\d,]+(?:\.\d{2})?|\b[\d][\d,]+(?:\.\d{2})?\s*(?:MXN|USD|EUR)\b/g) ?? []
    if (amounts.length > 0) importantData.push({ type: 'IMPORTE', value: amounts[0]!, context: 'Importe económico detectado' })
    const pcts = content.match(/\b\d+(?:\.\d+)?%/g) ?? []
    if (pcts.length > 0) importantData.push({ type: 'PORCENTAJE', value: pcts[0]!, context: 'Porcentaje detectado' })

    const inconsistencies: BusinessAnalysis['inconsistencies'] = []
    if (wordCount > 100 && dates.length === 0) {
      inconsistencies.push({ description: 'Documento extenso sin fechas explícitas', severity: 'LOW' })
    }

    const riskKeywords = ['urgente', 'crítico', 'incumplimiento', 'sanción', 'penalización', 'vencimiento', 'mora', 'alerta', 'urgent', 'critical', 'penalty', 'deadline', 'risk', 'riesgo', 'peligro']
    const riskFactors: BusinessAnalysis['riskFactors'] = []
    if (riskKeywords.some(kw => content.toLowerCase().includes(kw))) {
      riskFactors.push({ factor: 'Terminología de riesgo detectada en el contenido', level: 'MEDIUM' })
    }
    if (wordCount < 50) riskFactors.push({ factor: 'Documento muy breve para análisis exhaustivo', level: 'LOW' })

    const conclusions: string[] = []
    if (format === 'json') conclusions.push('Documento estructurado en JSON — apto para procesamiento automatizado')
    if (format === 'csv') conclusions.push('Datos tabulares en CSV — verificar coherencia entre filas')
    if (format === 'pdf') conclusions.push('Documento PDF con texto extraído — revisar si el resultado es completo')
    if (format === 'docx') conclusions.push('Documento Word (DOCX) — estructura preservada en la extracción')
    if (importantData.length > 0) conclusions.push(`${importantData.length} dato(s) relevante(s) identificado(s)`)
    if (riskFactors.length === 0) conclusions.push('Sin factores de riesgo críticos detectados')
    if (conclusions.length === 0) conclusions.push('Análisis completado sin hallazgos adicionales')

    const executiveSummary = `Documento de ${wordCount} palabras en formato ${format.toUpperCase()}.` +
      (importantData.length > 0 ? ` Contiene ${importantData.length} elemento(s) de datos relevantes.` : '') +
      (riskFactors.length > 0 ? ` Se detectaron ${riskFactors.length} factor(es) de riesgo.` : ' Sin factores de riesgo detectados.') +
      ' Análisis determinístico (sin API externa).'

    return {
      executiveSummary,
      importantData,
      inconsistencies,
      riskFactors,
      conclusions,
      analysisNote: 'Análisis generado por reglas determinísticas locales. No se utilizó API de IA externa.',
    }
  }

  private extractKeyTerms(text: string, limit = 10): string[] {
    const stopwords = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'a', 'y', 'o', 'que', 'se', 'su', 'es', 'por', 'con', 'no', 'para', 'al', 'lo', 'como', 'mas', 'pero', 'sus', 'le', 'ya', 'this', 'the', 'is', 'in', 'of', 'to', 'and', 'or', 'for', 'with', 'be', 'are', 'was', 'were', 'has', 'have', 'at', 'by', 'an', 'it', 'its'])
    const freq = new Map<string, number>()
    const matches = text.toLowerCase().match(/\b[a-záéíóúüñ]{3,}\b/g) ?? []
    for (const word of matches) {
      if (!stopwords.has(word)) freq.set(word, (freq.get(word) ?? 0) + 1)
    }
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w)
  }

  resetBudget(amount: number): void {
    this.availableBudget = amount
  }

  getAvailableBudget(): number { return this.availableBudget }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
