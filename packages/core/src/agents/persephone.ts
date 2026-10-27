import type { Task, TaskResult, DocumentIntakeResult, DocumentSummaryResult } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'

export class PersephoneAgent extends AgentBase {
  private availableBudget = 50000
  private currency = 'MXN'

  constructor(deps: AgentDependencies) {
    super('PERSEPHONE', deps)
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
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

    const summary: DocumentSummaryResult = {
      title: intake.filename.replace(/\.[^.]+$/, ''),
      wordCount: intake.wordCount,
      charCount: intake.charCount,
      lineCount: intake.lineCount,
      keyTerms,
      format: intake.detectedFormat,
      details,
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
