import { createHash } from 'node:crypto'
import type { Mission, Task } from '@hades/core'
import type { SqliteRepository } from './sqlite.js'
import type { NearSubmissionService } from './near/submission.js'

export type StageStatus = 'DONE' | 'PENDING' | 'WAITING_APPROVAL' | 'BLOCKED' | 'NOT_STARTED' | 'CONFIGURATION_PENDING'
export interface Stage {
  id: string; label: string; agent: string; status: StageStatus
  /** True only when the action itself took place. A scheduled or prepared step stays false until it has really run. */
  executed: boolean
  detail: string
  evidence?: Record<string, string | number | boolean | null>
}

export class AuditFlowError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'NOT_COMPLETED' | 'NO_EVIDENCE' | 'ALREADY_PREPARED', message: string) { super(message) }
}

const AGENT_TASKS: Array<[string, string, string]> = [
  ['intake', 'cap:doc:intake@1.0.0', 'Extracción de documentos'],
  ['validation', 'cap:doc:validate@1.0.0', 'Verificación de condiciones'],
  ['analysis', 'cap:doc:compare@1.0.0', 'Análisis comparativo'],
  ['report', 'cap:report:generate@1.0.0', 'Generación del informe'],
  ['seal', 'cap:crypto:hash@1.0.0', 'Sello SHA-256 del informe'],
]
const FOLLOWUP_CRON = '0 9 * * *'

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
const taskStatus = (t: Task | undefined): StageStatus => !t ? 'NOT_STARTED' : t.status === 'COMPLETED' ? 'DONE' : t.status === 'CERBERUS_REVIEW' ? 'WAITING_APPROVAL' : ['QUEUED', 'RUNNING'].includes(t.status) ? 'PENDING' : 'BLOCKED'

/**
 * Enterprise-audit flow over the existing persistent mission pipeline. It adds no new executor: it reads what the
 * pipeline really did, records evidence once, schedules a read-only CHRONOS follow-up and prepares (never submits)
 * a NEAR audit intent. Every stage reports `executed` so planned work is never presented as done.
 */
export class AuditFlowService {
  constructor(private readonly repository: SqliteRepository, private readonly near: NearSubmissionService) {}

  private mission(id: string): Mission {
    const m = this.repository.getMission(id)
    if (!m) throw new AuditFlowError('NOT_FOUND', 'mission not found')
    return m
  }

  view(missionId: string) {
    const m = this.mission(missionId)
    const tasks = AGENT_TASKS.map(([, cap]) => m.tasks.find(t => t.capabilityId === cap))
    const opState = this.repository.getLocalOperationState(missionId)
    const stages: Stage[] = []
    stages.push({ id: 'request', label: 'Solicitud recibida', agent: 'HADES', status: 'DONE', executed: true, detail: `Misión «${m.title}» creada por ${m.ownerId ?? 'desconocido'}.`, evidence: { missionId, createdAt: m.createdAt } })
    AGENT_TASKS.slice(0, 3).forEach(([, , label], i) => {
      const t = tasks[i]
      stages.push({ id: AGENT_TASKS[i]![0], label, agent: t?.assignedTo ?? '—', status: taskStatus(t), executed: t?.status === 'COMPLETED', detail: t?.result?.summary ?? 'Aún no ejecutada.', evidence: t ? { taskId: t.id, completedAt: t.completedAt } : undefined })
    })
    const guard = (m.context as { guardDecision?: { outcome?: string; ruleMatched?: string | null }; finalGuardDecision?: { outcome?: string } }) ?? {}
    const outcome = guard.finalGuardDecision?.outcome ?? guard.guardDecision?.outcome ?? null
    const rejected = m.status === 'FAILED' || m.status === 'CANCELLED'
    stages.push({
      id: 'cerberus', label: 'Validación de CERBERUS', agent: 'CERBERUS',
      status: !outcome ? 'NOT_STARTED' : rejected ? 'BLOCKED' : opState === 'WAITING_APPROVAL' ? 'WAITING_APPROVAL' : 'DONE',
      executed: !!outcome && !rejected && opState !== 'WAITING_APPROVAL',
      detail: !outcome ? 'Sin decisión registrada.' : rejected ? `Misión ${m.status}: la operación protegida no se ejecutó.` : opState === 'WAITING_APPROVAL' ? `Decisión ${outcome}: espera aprobación humana de un ADMIN (Command Center).` : `Decisión ${outcome}; aprobación humana registrada si fue requerida.`,
      evidence: { outcome, operationState: opState ?? null, rule: guard.guardDecision?.ruleMatched ?? null },
    })
    stages.push({ id: 'report', label: AGENT_TASKS[3]![2], agent: tasks[3]?.assignedTo ?? 'ELYSIUM', status: taskStatus(tasks[3]), executed: tasks[3]?.status === 'COMPLETED', detail: tasks[3]?.result?.summary ?? 'Aún no generado (requiere la aprobación previa).' })
    stages.push({ id: 'seal', label: AGENT_TASKS[4]![2], agent: tasks[4]?.assignedTo ?? 'TARTARUS', status: taskStatus(tasks[4]), executed: tasks[4]?.status === 'COMPLETED', detail: tasks[4]?.result?.summary ?? 'Aún no sellado.' })

    const ev = this.repository.getMissionEvidence(missionId)
    stages.push({
      id: 'evidence', label: 'Evidencia persistente', agent: 'TARTARUS', status: ev ? 'DONE' : m.status === 'COMPLETED' ? 'PENDING' : 'NOT_STARTED', executed: !!ev,
      detail: ev ? `Informe y hash guardados; recomputado ${sha256(ev.reportMarkdown) === ev.reportSha256 ? 'coincide' : 'NO COINCIDE'}.` : m.status === 'COMPLETED' ? 'La misión terminó; falta registrar la evidencia.' : 'Disponible cuando la misión se complete.',
      evidence: ev ? { reportSha256: ev.reportSha256, recordedBy: ev.recordedBy, recordedAt: ev.recordedAt, intact: sha256(ev.reportMarkdown) === ev.reportSha256 } : undefined,
    })

    const task = this.repository.chronos.list().find(t => t.kind === 'MISSION_FOLLOWUP' && t.missionId === missionId && t.status !== 'CANCELLED')
    const runs = task ? this.repository.chronos.runs(task.id, 5) : []
    const ok = runs.find(r => r.status === 'SUCCEEDED')
    stages.push({
      id: 'followup', label: 'Seguimiento en CHRONOS', agent: 'CHRONOS', status: task ? 'DONE' : 'NOT_STARTED', executed: !!ok,
      detail: !task ? 'No programado.' : ok ? 'Programado y con al menos una verificación ejecutada correctamente.' : 'Programado (cron UTC); todavía no se ha ejecutado ninguna verificación.',
      evidence: task ? { taskId: task.id, cron: task.cron, nextRunAt: task.nextRunAt, runs: runs.length, lastRunStatus: runs[0]?.status ?? null } : undefined,
    })

    const intent = ev?.nearIntentId ? this.repository.getNearIntentStore().get(ev.nearIntentId) : undefined
    const nearStatus: StageStatus = !ev?.nearState ? 'NOT_STARTED' : ev.nearState === 'CONFIGURATION_PENDING' ? 'CONFIGURATION_PENDING' : intent?.status === 'CONFIRMED' ? 'DONE' : 'WAITING_APPROVAL'
    stages.push({
      id: 'near', label: 'Registro de auditoría NEAR (preparado)', agent: 'HADES', status: nearStatus, executed: intent?.status === 'CONFIRMED',
      detail: !ev?.nearState ? 'No preparado.' : ev.nearState === 'CONFIGURATION_PENDING' ? `Configuración pendiente: ${ev.nearNote}. No se firmó ni se envió nada.` : intent ? `Operación ${intent.status}. ${intent.status === 'CONFIRMED' ? 'Confirmada on-chain.' : 'Preparada para aprobación; no se ha enviado a la red.'}` : (ev.nearNote ?? ev.nearState),
      evidence: ev?.nearState ? { plan: ev.nearState, intentId: ev.nearIntentId, intentStatus: intent?.status ?? null } : undefined,
    })
    return { missionId, missionStatus: m.status, title: m.title, stages, report: ev ? { sha256: ev.reportSha256, markdown: ev.reportMarkdown } : null }
  }

  /** Stores the sealed report and its hash once the mission has genuinely completed. Idempotent; never rewrites. */
  recordEvidence(missionId: string, actor: string) {
    const m = this.mission(missionId)
    if (m.status !== 'COMPLETED') throw new AuditFlowError('NOT_COMPLETED', 'the mission has not completed; there is nothing to record')
    const report = m.tasks.find(t => t.capabilityId === 'cap:report:generate@1.0.0')?.result?.data as { reportMarkdown?: string } | undefined
    const seal = m.tasks.find(t => t.capabilityId === 'cap:crypto:hash@1.0.0')
    const sealed = seal?.result?.data as { sha256?: string } | undefined
    if (!report?.reportMarkdown || !sealed?.sha256 || seal?.status !== 'COMPLETED') throw new AuditFlowError('NOT_COMPLETED', 'the report or its seal is missing')
    // Do not trust the stored seal: recompute it from the report text.
    if (sha256(report.reportMarkdown) !== sealed.sha256) throw new AuditFlowError('NOT_COMPLETED', 'the seal does not match the report text; refusing to record inconsistent evidence')
    const created = this.repository.saveMissionEvidence({ missionId, reportSha256: sealed.sha256, reportMarkdown: report.reportMarkdown, sealedTaskId: seal.id, recordedBy: actor })
    return { created, evidence: this.repository.getMissionEvidence(missionId)! }
  }

  /** Daily read-only re-verification in CHRONOS. One active follow-up per mission. */
  scheduleFollowUp(missionId: string, actor: string) {
    this.recordEvidence(missionId, actor)
    const existing = this.repository.chronos.list().find(t => t.kind === 'MISSION_FOLLOWUP' && t.missionId === missionId && t.status !== 'CANCELLED')
    if (existing) return { created: false, task: existing }
    const task = this.repository.chronos.create({ title: `Seguimiento de auditoría ${missionId.slice(0, 8)}`, description: 'Verifica que el informe guardado siga íntegro y que la cadena de auditoría verifique.', kind: 'MISSION_FOLLOWUP', params: { missionId }, cron: FOLLOWUP_CRON, missionId }, actor)
    return { created: true, task }
  }

  /**
   * Prepares the NEAR audit record for human approval. It creates and requests approval for an intent but never
   * signs or sends. Without a configured signer and contract it records CONFIGURATION_PENDING instead of inventing values.
   */
  prepareNearAudit(missionId: string, actor: string) {
    const { evidence } = this.recordEvidence(missionId, actor)
    if (evidence.nearIntentId) throw new AuditFlowError('ALREADY_PREPARED', 'a NEAR audit operation already exists for this mission')
    const cfg = this.near.status()
    const missing = [!cfg.signerAccountId && 'cuenta firmante (NEAR_SIGNER_ACCOUNT_ID)', !cfg.contractId && 'contrato de auditoría (NEAR_AUDIT_CONTRACT_ID)'].filter(Boolean) as string[]
    if (missing.length) {
      this.repository.setMissionNear(missionId, 'CONFIGURATION_PENDING', null, `falta ${missing.join(' y ')}`, actor)
      return { state: 'CONFIGURATION_PENDING' as const, intent: null, plannedContentHash: evidence.reportSha256, missing }
    }
    const m = this.mission(missionId)
    const g = m.context as { guardDecision?: { outcome?: string }; finalGuardDecision?: { outcome?: string } }
    const decision = g.finalGuardDecision?.outcome ?? g.guardDecision?.outcome ?? 'PERMIT'
    const store = this.repository.getNearIntentStore()
    const intent = store.create({
      network: 'testnet', signerId: cfg.signerAccountId, receiverId: cfg.contractId, type: 'AUDIT_HASH', amountYocto: '0',
      auditId: `mission-${missionId}`.slice(0, 64), contentHash: evidence.reportSha256, operationType: 'MISSION_AUDIT', agentName: 'HADES',
      decision: ['PERMIT', 'DENY', 'ESCALATE'].includes(decision) ? decision : 'PERMIT', timestampMs: Date.now(), gas: '30000000000000',
    }, actor)
    try {
      const requested = store.requestApproval(intent.id, actor)
      this.repository.setMissionNear(missionId, 'PREPARED', intent.id, null, actor)
      return { state: 'PREPARED' as const, intent: requested, plannedContentHash: evidence.reportSha256, missing: [] as string[] }
    } catch (e) {
      // Typically the contract is not on the CERBERUS recipient allowlist. The draft stays; an ADMIN can fix it and retry from the NEAR page.
      this.repository.setMissionNear(missionId, 'PREPARED', intent.id, `borrador sin solicitud de aprobación: ${(e as Error).message}`, actor)
      return { state: 'DRAFT_ONLY' as const, intent, plannedContentHash: evidence.reportSha256, missing: [] as string[], reason: (e as Error).message }
    }
  }
}
