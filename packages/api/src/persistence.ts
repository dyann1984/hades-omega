import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AuditRecord, Mission } from '@hades/core'

export type Role = 'ADMIN' | 'OPERATOR' | 'AUDITOR' | 'VIEWER'
export interface StoredApproval {
  id: string; escalationId: string; status: 'APPROVED' | 'REJECTED'
  justification: string; decidedBy: string; decidedAt: number; executionAuthorized: false
}
export interface SystemEvent { id: string; type: string; actor: string; timestamp: number; payload: unknown }
interface StoreData {
  version: 1; missions: Mission[]; audits: AuditRecord[]; approvals: StoredApproval[]
  events: SystemEvent[]; idempotency: Record<string, { fingerprint: string; missionId: string }>
}
const empty = (): StoreData => ({ version: 1, missions: [], audits: [], approvals: [], events: [], idempotency: {} })

/** Local durable store. Atomic replace prevents a partial JSON file on process interruption. */
export class JsonRepository {
  private state: StoreData = empty()
  private writeQueue: Promise<void> = Promise.resolve()
  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    try { this.state = JSON.parse(await readFile(this.filePath, 'utf8')) as StoreData }
    catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await mkdir(dirname(this.filePath), { recursive: true }); await this.flush()
    }
  }
  listMissions(): Mission[] { return structuredClone(this.state.missions) }
  getMission(id: string): Mission | undefined { return structuredClone(this.state.missions.find(item => item.id === id)) }
  getIdempotent(key: string, fingerprint: string): Mission | undefined {
    const record = this.state.idempotency[key]
    return record?.fingerprint === fingerprint ? this.getMission(record.missionId) : undefined
  }
  async saveMission(mission: Mission, idempotency?: { key: string; fingerprint: string }): Promise<void> {
    const index = this.state.missions.findIndex(item => item.id === mission.id)
    if (index >= 0) this.state.missions[index] = structuredClone(mission); else this.state.missions.unshift(structuredClone(mission))
    if (idempotency) this.state.idempotency[idempotency.key] = { fingerprint: idempotency.fingerprint, missionId: mission.id }
    await this.flush()
  }
  async recordMissionEvidence(audits: AuditRecord[], actor: string): Promise<void> {
    this.state.audits.push(...structuredClone(audits))
    this.state.events.unshift({ id: crypto.randomUUID(), type: 'MISSION_EVIDENCE_RECORDED', actor, timestamp: Date.now(), payload: { count: audits.length } })
    await this.flush()
  }
  listAudits(): AuditRecord[] { return structuredClone(this.state.audits) }
  hasPendingEscalation(id: string): boolean {
    return this.state.missions.some(mission => mission.tasks.some(task =>
      task.status === 'CERBERUS_REVIEW' && (task.result?.data as { escalationId?: unknown } | undefined)?.escalationId === id
    ))
  }
  listApprovals(): StoredApproval[] { return structuredClone(this.state.approvals) }
  async decideApproval(input: Omit<StoredApproval, 'id' | 'decidedAt' | 'executionAuthorized'>): Promise<StoredApproval> {
    if (this.state.approvals.some(item => item.escalationId === input.escalationId)) throw new Error('APPROVAL_ALREADY_RESOLVED')
    if (!this.hasPendingEscalation(input.escalationId)) throw new Error('ESCALATION_NOT_FOUND')
    const approval: StoredApproval = { ...input, id: crypto.randomUUID(), decidedAt: Date.now(), executionAuthorized: false }
    this.state.approvals.unshift(approval)
    this.state.events.unshift({ id: crypto.randomUUID(), type: 'HUMAN_APPROVAL_RECORDED', actor: input.decidedBy, timestamp: approval.decidedAt, payload: approval })
    await this.flush(); return structuredClone(approval)
  }
  private async flush(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })
      const temp = `${this.filePath}.${crypto.randomUUID()}.tmp`
      await writeFile(temp, JSON.stringify(this.state), { encoding: 'utf8', mode: 0o600 })
      await rename(temp, this.filePath)
    })
    return this.writeQueue
  }
}
