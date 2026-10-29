import Database from 'better-sqlite3'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { AuditRecord, Mission, Task, AgentName } from '@hades/core'
import { defaultCapabilityRegistry } from '@hades/core'
import { JsonRepository, type StoredApproval, type SystemEvent } from './persistence.js'
import { analyzeDocuments } from './document-analysis.js'

type Legacy = { missions: Mission[]; audits: AuditRecord[]; approvals: StoredApproval[]; events: SystemEvent[]; idempotency: Record<string, { fingerprint: string; missionId: string }> }
type Row = { data: string }
export interface ExecutionEvent {
  eventId: string; missionId: string; taskId: string | null; agentId: string | null
  type: string; status: string; timestamp: number; sequence: number; correlationId: string
}

/** SQLite-backed repository. Legacy JSON is imported once, after a separate backup. */
export class SqliteRepository extends JsonRepository {
  private db!: Database.Database
  constructor(private readonly databasePath: string, private readonly legacyPath: string) { super(legacyPath) }
  override async init(): Promise<void> {
    await mkdir(dirname(this.databasePath), { recursive: true })
    this.db = new Database(this.databasePath)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 1').get()) {
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE missions (id TEXT PRIMARY KEY, owner_id TEXT, data TEXT NOT NULL);
          CREATE TABLE tasks (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE, data TEXT NOT NULL);
          CREATE TABLE audits (id TEXT PRIMARY KEY, data TEXT NOT NULL);
          CREATE TABLE approvals (id TEXT PRIMARY KEY, escalation_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
          CREATE TABLE events (id TEXT PRIMARY KEY, data TEXT NOT NULL);
          CREATE TABLE idempotency (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, mission_id TEXT NOT NULL REFERENCES missions(id));`)
        this.db.prepare('INSERT INTO schema_migrations VALUES (1)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 2').get()) {
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE local_operations (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL UNIQUE REFERENCES missions(id), owner_id TEXT NOT NULL, input TEXT NOT NULL, state TEXT NOT NULL, result TEXT, decided_by TEXT, decided_at INTEGER);`)
        this.db.prepare('INSERT INTO schema_migrations VALUES (2)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 3').get()) {
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1); CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, revoked_at INTEGER);`)
        this.db.prepare('INSERT INTO schema_migrations VALUES (3)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 4').get()) {
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE document_results (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, filename TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL);`)
        this.db.prepare('INSERT INTO schema_migrations VALUES (4)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 5').get()) {
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor TEXT NOT NULL, mission_id TEXT, action TEXT NOT NULL, result TEXT NOT NULL, correlation_id TEXT NOT NULL, timestamp INTEGER NOT NULL); CREATE INDEX audit_events_time ON audit_events(timestamp DESC); CREATE INDEX audit_events_mission ON audit_events(mission_id,timestamp DESC);`)
        this.db.prepare('INSERT INTO schema_migrations VALUES (5)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 6').get()) {
      this.db.transaction(() => {
        // Añadir prev_hash y hash para cadena criptográfica de integridad en audit_events
        const cols = (this.db.prepare("PRAGMA table_info(audit_events)").all() as Array<{ name: string }>).map(c => c.name)
        if (!cols.includes('prev_hash')) {
          this.db.exec(`ALTER TABLE audit_events ADD COLUMN prev_hash TEXT;`)
        }
        if (!cols.includes('hash')) {
          this.db.exec(`ALTER TABLE audit_events ADD COLUMN hash TEXT;`)
        }
        this.db.prepare('INSERT INTO schema_migrations VALUES (6)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 7').get()) {
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE execution_events (sequence INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, mission_id TEXT NOT NULL REFERENCES missions(id), task_id TEXT, agent_id TEXT, type TEXT NOT NULL, status TEXT NOT NULL, timestamp INTEGER NOT NULL, correlation_id TEXT NOT NULL, PRIMARY KEY (mission_id, sequence));`)
        this.db.prepare('INSERT INTO schema_migrations VALUES (7)').run()
      })()
    }
    if (this.db.prepare("SELECT 1 FROM metadata WHERE key = 'legacy_import'").get()) return
    let raw: string | undefined
    try { raw = await readFile(this.legacyPath, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (raw === undefined) { this.db.prepare("INSERT INTO metadata VALUES ('legacy_import', 'no-source')").run(); return }
    const legacy = JSON.parse(raw) as Legacy
    if (!Array.isArray(legacy.missions) || !Array.isArray(legacy.audits) || !Array.isArray(legacy.approvals) || !Array.isArray(legacy.events) || !legacy.idempotency || typeof legacy.idempotency !== 'object') throw new Error('Invalid legacy JSON: migration aborted')
    const backup = `${this.legacyPath}.backup-${Date.now()}-${crypto.randomUUID()}`
    await copyFile(this.legacyPath, backup)
    this.db.transaction(() => {
      for (const mission of legacy.missions) this.putMission(mission)
      for (const audit of legacy.audits) this.db.prepare('INSERT INTO audits VALUES (?, ?)').run(audit.id, JSON.stringify(audit))
      for (const approval of legacy.approvals) this.db.prepare('INSERT INTO approvals VALUES (?, ?, ?)').run(approval.id, approval.escalationId, JSON.stringify(approval))
      for (const event of legacy.events) this.db.prepare('INSERT INTO events VALUES (?, ?)').run(event.id, JSON.stringify(event))
      for (const [key, item] of Object.entries(legacy.idempotency)) this.db.prepare('INSERT INTO idempotency VALUES (?, ?, ?)').run(key, item.fingerprint, item.missionId)
      for (const [table, count] of [['missions',legacy.missions.length],['audits',legacy.audits.length],['approvals',legacy.approvals.length],['events',legacy.events.length]] as const) {
        if ((this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n !== count) throw new Error(`Import count mismatch: ${table}`)
      }
      const expectedTasks = legacy.missions.reduce((count, mission) => count + mission.tasks.length, 0)
      if ((this.db.prepare('SELECT count(*) AS n FROM tasks').get() as {n:number}).n !== expectedTasks || (this.db.prepare('SELECT count(*) AS n FROM idempotency').get() as {n:number}).n !== Object.keys(legacy.idempotency).length || this.db.pragma('foreign_key_check') instanceof Array && (this.db.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('Import integrity check failed')
      this.db.prepare("INSERT INTO metadata VALUES ('legacy_import', ?)").run(backup)
    })()
  }
  private putMission(mission: Mission): void {
    this.db.prepare('INSERT INTO missions (id,owner_id,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,data=excluded.data').run(mission.id, mission.ownerId ?? null, JSON.stringify(mission))
    this.db.prepare('DELETE FROM tasks WHERE mission_id=?').run(mission.id)
    for (const task of mission.tasks) this.db.prepare('INSERT INTO tasks VALUES (?,?,?)').run(task.id, mission.id, JSON.stringify(task))
  }
  override listMissions(): Mission[] { return (this.db.prepare('SELECT data FROM missions ORDER BY rowid DESC').all() as Row[]).map(r => JSON.parse(r.data)) }
  override getMission(id: string): Mission | undefined { const row = this.db.prepare('SELECT data FROM missions WHERE id=?').get(id) as Row | undefined; return row && JSON.parse(row.data) }
  listExecutionEvents(missionId: string, after: number, limit = 200): ExecutionEvent[] {
    return this.db.prepare(`SELECT event_id AS eventId, mission_id AS missionId, task_id AS taskId, agent_id AS agentId, type, status, timestamp, sequence, correlation_id AS correlationId FROM execution_events WHERE mission_id=? AND sequence>? ORDER BY sequence LIMIT ?`).all(missionId, after, limit) as ExecutionEvent[]
  }
  executionCursor(missionId: string): number {
    return (this.db.prepare('SELECT COALESCE(MAX(sequence), 0) AS cursor FROM execution_events WHERE mission_id=?').get(missionId) as {cursor:number}).cursor
  }
  override getIdempotent(key: string, fingerprint: string): Mission | undefined { const row = this.db.prepare('SELECT mission_id FROM idempotency WHERE key=? AND fingerprint=?').get(key, fingerprint) as { mission_id: string } | undefined; return row && this.getMission(row.mission_id) }
  override async saveMission(mission: Mission, idempotency?: {key: string; fingerprint: string}): Promise<void> {
    this.db.transaction(() => { this.putMission(mission); this.recordAuditEvent({actor:mission.ownerId ?? 'legacy',missionId:mission.id,action:'MISSION_SAVED',result:mission.status}); if (idempotency) this.db.prepare('INSERT INTO idempotency VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET fingerprint=excluded.fingerprint, mission_id=excluded.mission_id').run(idempotency.key,idempotency.fingerprint,mission.id) })()
  }
  override async recordMissionEvidence(audits: AuditRecord[], actor: string): Promise<void> {
    this.db.transaction(() => { for (const item of audits) this.db.prepare('INSERT OR IGNORE INTO audits VALUES (?,?)').run(item.id,JSON.stringify(item)); const event = {id:crypto.randomUUID(),type:'MISSION_EVIDENCE_RECORDED',actor,timestamp:Date.now(),payload:{count:audits.length}}; this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id,JSON.stringify(event)) })()
  }
  override listAudits(): AuditRecord[] { return (this.db.prepare('SELECT data FROM audits').all() as Row[]).map(r => JSON.parse(r.data)) }
  override hasPendingEscalation(id: string): boolean { if (this.db.prepare('SELECT 1 FROM local_operations WHERE id=?').get(id)) return false; return this.listMissions().some(m => m.tasks.some(t => t.status === 'CERBERUS_REVIEW' && (t.result?.data as {escalationId?: unknown} | undefined)?.escalationId === id)) }
  override listApprovals(): StoredApproval[] { return (this.db.prepare('SELECT data FROM approvals ORDER BY rowid DESC').all() as Row[]).map(r => JSON.parse(r.data)) }
  override async decideApproval(input: Omit<StoredApproval, 'id' | 'decidedAt' | 'executionAuthorized'>): Promise<StoredApproval> {
    return this.db.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM approvals WHERE escalation_id=?').get(input.escalationId)) throw new Error('APPROVAL_ALREADY_RESOLVED')
      if (!this.hasPendingEscalation(input.escalationId)) throw new Error('ESCALATION_NOT_FOUND')
      const approval: StoredApproval = {...input,id:crypto.randomUUID(),decidedAt:Date.now(),executionAuthorized:false}
      const event = {id:crypto.randomUUID(),type:'HUMAN_APPROVAL_RECORDED',actor:input.decidedBy,timestamp:approval.decidedAt,payload:approval}
      this.db.prepare('INSERT INTO approvals VALUES (?,?,?)').run(approval.id,approval.escalationId,JSON.stringify(approval))
      this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id,JSON.stringify(event)); return approval
    })()
  }
  recordAuditEvent(input: { actor: string; missionId?: string | null; action: string; result: string; correlationId?: string }): { id: string; hash: string; prevHash: string | null } {
    const id = randomUUID()
    const now = Date.now()
    const missionId = input.missionId ?? null
    const correlationId = input.correlationId ?? input.missionId ?? randomUUID()

    // Obtener el hash del último evento registrado para formar la cadena (blockchain local de auditoría)
    const lastRow = this.db.prepare('SELECT hash FROM audit_events ORDER BY rowid DESC LIMIT 1').get() as { hash: string | null } | undefined
    const prevHash = lastRow?.hash ?? 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000'
    const payload = `${prevHash}|${id}|${input.actor}|${missionId}|${input.action}|${input.result}|${correlationId}|${now}`
    const hash = createHash('sha256').update(payload, 'utf8').digest('hex')

    this.db.prepare('INSERT INTO audit_events (id,actor,mission_id,action,result,correlation_id,timestamp,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, input.actor, missionId, input.action, input.result, correlationId, now, prevHash, hash)

    return { id, hash, prevHash }
  }
  listAuditEvents(filter: { action?: string; missionId?: string; limit: number; offset: number }): Array<{id:string;actor:string;missionId:string|null;action:string;result:string;correlationId:string;timestamp:number;prev_hash?:string|null;hash?:string|null}> {
    return this.db.prepare('SELECT id,actor,mission_id AS missionId,action,result,correlation_id AS correlationId,timestamp,prev_hash,hash FROM audit_events WHERE (? IS NULL OR action=?) AND (? IS NULL OR mission_id=?) ORDER BY timestamp DESC, rowid DESC LIMIT ? OFFSET ?').all(filter.action ?? null,filter.action ?? null,filter.missionId ?? null,filter.missionId ?? null,filter.limit,filter.offset) as Array<{id:string;actor:string;missionId:string|null;action:string;result:string;correlationId:string;timestamp:number;prev_hash?:string|null;hash?:string|null}>
  }
  verifyAuditIntegrity(): { verified: boolean; totalEvents: number; brokenAtId: string | null; error: string | null } {
    const events = this.db.prepare('SELECT id,actor,mission_id,action,result,correlation_id,timestamp,prev_hash,hash FROM audit_events ORDER BY rowid ASC').all() as Array<{
      id: string; actor: string; mission_id: string | null; action: string; result: string; correlation_id: string; timestamp: number; prev_hash: string | null; hash: string | null
    }>
    let currentPrev = 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000'
    for (const evt of events) {
      if (!evt.hash) {
        // Evento pre-migración v6: no rompe, pero se salta
        continue
      }
      if (evt.prev_hash !== currentPrev) {
        return { verified: false, totalEvents: events.length, brokenAtId: evt.id, error: `Discrepancia en cadena: prev_hash esperado ${currentPrev}, encontrado ${evt.prev_hash}` }
      }
      const payload = `${evt.prev_hash}|${evt.id}|${evt.actor}|${evt.mission_id}|${evt.action}|${evt.result}|${evt.correlation_id}|${evt.timestamp}`
      const expectedHash = createHash('sha256').update(payload, 'utf8').digest('hex')
      if (evt.hash !== expectedHash) {
        return { verified: false, totalEvents: events.length, brokenAtId: evt.id, error: `Hash alterado o no coincidente para evento ${evt.id}` }
      }
      currentPrev = evt.hash
    }
    return { verified: true, totalEvents: events.length, brokenAtId: null, error: null }
  }
  private workflowEvent(missionId: string, actor: string, state: string): void {
    const event = { id: randomUUID(), type: 'LOCAL_EXECUTION_STATE', actor, timestamp: Date.now(), payload: { missionId, state } }
    this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id, JSON.stringify(event))
    this.recordAuditEvent({ actor, missionId, action: 'MISSION_STATE', result: state })
    const eventType = state === 'WAITING_APPROVAL' ? 'approval.requested' : state === 'APPROVED' ? 'approval.granted' : state === 'REJECTED' ? 'approval.denied' : null
    if (eventType) {
      const mission = this.getMission(missionId)
      const task = mission?.tasks.find(item => item.status === 'CERBERUS_REVIEW')
      this.db.prepare('INSERT INTO execution_events (sequence,event_id,mission_id,task_id,agent_id,type,status,timestamp,correlation_id) VALUES ((SELECT COALESCE(MAX(sequence),0)+1 FROM execution_events WHERE mission_id=?),?,?,?,?,?,?,?,?)')
        .run(missionId, randomUUID(), missionId, task?.id ?? null, task?.assignedTo ?? null, eventType, state, Date.now(), missionId)
    }
  }
  getLocalOperationMissionId(operationId: string): string | undefined {
    const row = this.db.prepare('SELECT mission_id FROM local_operations WHERE id=?').get(operationId) as {mission_id:string} | undefined
    return row?.mission_id
  }
  listMissionEvents(missionId: string): SystemEvent[] {
    return (this.db.prepare('SELECT data FROM events ORDER BY rowid').all() as Row[]).map(row => JSON.parse(row.data) as SystemEvent).filter(event => (event.payload as {missionId?: string} | null)?.missionId === missionId)
  }
  listPendingLocalOperations(): Array<{ id: string; missionId: string; ownerId: string; input: string }> {
    return (this.db.prepare("SELECT id, mission_id, owner_id, input FROM local_operations WHERE state='WAITING_APPROVAL'").all() as Array<{id:string;mission_id:string;owner_id:string;input:string}>).map(row => ({id:row.id,missionId:row.mission_id,ownerId:row.owner_id,input:row.input}))
  }
  async createLocalMission(owner: string, title: string, input: string): Promise<{mission: Mission; approvalId: string}> {
    const id = randomUUID(), taskId = randomUUID(), approvalId = randomUUID(), now = Date.now()
    const mission: Mission = { id, ownerId: owner, title, description: 'Calcular SHA-256 de la entrada autorizada', context: { organizationId: '', budgetLimit: null, currency: 'MXN', deadline: null, priority: 'MEDIUM', tags: ['local-sha256'] }, status: 'PARTIAL_COMPLETE', createdAt: now, updatedAt: now, completedAt: null, tasks: [{ id: taskId, missionId: id, title: 'Calcular SHA-256', description: 'Procesamiento local determinista', assignedTo: 'HADES', status: 'CERBERUS_REVIEW', priority: 'P1', dependsOn: [], createdAt: now, startedAt: null, completedAt: null, result: { taskId, success: false, summary: 'Esperando aprobación', data: { pendingApproval: true, escalationId: approvalId }, cerberusIds: [] } }], report: null }
    this.db.transaction(() => {
      this.putMission(mission)
      this.db.prepare('INSERT INTO local_operations (id,mission_id,owner_id,input,state) VALUES (?,?,?,?,?)').run(approvalId,id,owner,input,'WAITING_APPROVAL')
      for (const state of ['CREATED','WAITING_APPROVAL']) this.workflowEvent(id,owner,state)
    })()
    return { mission, approvalId }
  }
  async decideLocalOperation(id: string, decision: 'APPROVED' | 'REJECTED', actor: string, justification: string): Promise<Mission> {
    return this.db.transaction(() => {
      const op = this.db.prepare('SELECT * FROM local_operations WHERE id=?').get(id) as { mission_id: string; input: string; state: string } | undefined
      if (!op) throw new Error('ESCALATION_NOT_FOUND')
      if (op.state !== 'WAITING_APPROVAL') throw new Error('APPROVAL_ALREADY_RESOLVED')
      const mission = this.getMission(op.mission_id)!
      const task = mission.tasks.find(t => t.status === 'CERBERUS_REVIEW') ?? mission.tasks[0]!
      const at = Date.now()
      const approval: StoredApproval = { id: randomUUID(), escalationId: id, status: decision, justification, decidedBy: actor, decidedAt: at, executionAuthorized: decision === 'APPROVED' }
      this.db.prepare('INSERT INTO approvals VALUES (?,?,?)').run(approval.id,id,JSON.stringify(approval))
      this.workflowEvent(mission.id,actor,decision)
      if (decision === 'APPROVED') {
        if (task.capabilityId && !defaultCapabilityRegistry.canExecute(task.assignedTo, task.capabilityId)) throw new Error('CAPABILITY_NOT_AVAILABLE')
        this.workflowEvent(mission.id,actor,'RESUMING'); this.workflowEvent(mission.id,actor,'RUNNING')
        const sha256 = createHash('sha256').update(op.input,'utf8').digest('hex')
        task.status = 'EXECUTED'; task.startedAt = at; task.completedAt = Date.now()
        task.result = { taskId: task.id, success: true, summary: `${task.assignedTo}: SHA-256 calculado localmente`, data: { algorithm: 'sha256', encoding: 'utf8', sha256, inputBytes: Buffer.byteLength(op.input,'utf8'), executor: task.assignedTo, simulated: false }, cerberusIds: [] }

        // Si existen tareas subsiguientes dependientes en la misión, ejecutarlas determinísticamente
        for (const nextTask of mission.tasks) {
          if (nextTask.id !== task.id && (nextTask.status === 'ASSIGNED' || nextTask.status === 'ACCEPTED')) {
            if (!nextTask.capabilityId || !defaultCapabilityRegistry.canExecute(nextTask.assignedTo, nextTask.capabilityId)) throw new Error('CAPABILITY_NOT_AVAILABLE')
            nextTask.startedAt = Date.now()
            nextTask.completedAt = Date.now()
            nextTask.status = 'EXECUTED'

            if (nextTask.capabilityId === 'cap:report:generate@1.0.0') {
              const cleanDocs = (mission.context as { documents?: Array<{filename:string;content:string}> }).documents ?? []
              const evidence = analyzeDocuments(cleanDocs)
              const reportMarkdown = `# Informe documental determinista\n\nMisión: ${mission.title}\nID: ${mission.id}\n\n` +
                `Los hallazgos son coincidencias textuales, no un dictamen jurídico ni análisis generativo.\n\n` +
                evidence.map(item => `## ${item.filename}\nSHA-256 del texto: ${item.sha256}\n` +
                  `Importes encontrados: ${item.amounts.map(x => x.text).join(', ') || 'ninguno'}\n` +
                  `Porcentajes encontrados: ${item.percentages.map(x => x.text).join(', ') || 'ninguno'}\n` +
                  `Términos encontrados: ${item.clauses.map(x => x.text).join(', ') || 'ninguno'}\n`).join('\n')

              nextTask.result = {
                taskId: nextTask.id,
                success: true,
                summary: 'Informe local determinista generado; despacho de ELYSIUM no implementado',
                data: {
                  executor: 'local-rule-engine', intendedAgent: nextTask.assignedTo,
                  mode: 'RULE_BASED',
                  simulated: true, executionMode: 'DEMO',
                  reportMarkdown,
                  generatedAt: Date.now(),
                },
                cerberusIds: [],
              }
            } else if (nextTask.capabilityId === 'cap:crypto:hash@1.0.0') {
              const report = mission.tasks.find(t => t.capabilityId === 'cap:report:generate@1.0.0')?.result?.data as {reportMarkdown?: string} | undefined
              if (!report?.reportMarkdown) throw new Error('REPORT_NOT_READY')
              const deliverableHash = createHash('sha256').update(report.reportMarkdown, 'utf8').digest('hex')
              nextTask.result = {
                taskId: nextTask.id,
                success: true,
                summary: 'Hash local del informe calculado; despacho de TARTARUS no implementado',
                data: {
                  executor: 'local-rule-engine', intendedAgent: nextTask.assignedTo,
                  simulated: true, executionMode: 'DEMO',
                  sha256: deliverableHash,
                  sealedAt: Date.now(),
                },
                cerberusIds: [],
              }
            } else {
              throw new Error('CAPABILITY_NOT_IMPLEMENTED')
            }
          }
        }

        mission.status='COMPLETED'; mission.completedAt=Date.now()
        this.db.prepare("UPDATE local_operations SET state='COMPLETED',result=?,decided_by=?,decided_at=? WHERE id=?").run(JSON.stringify(task.result),actor,at,id)
        this.workflowEvent(mission.id,actor,'COMPLETED')
      } else {
        task.status='SUSPENDED'; task.completedAt=at; task.result={taskId:task.id,success:false,summary:'Operación rechazada y cancelada',data:{cancelled:true},cerberusIds:[]}
        mission.status='FAILED'; mission.completedAt=at
        this.db.prepare("UPDATE local_operations SET state='CANCELLED',decided_by=?,decided_at=? WHERE id=?").run(actor,at,id)
        this.workflowEvent(mission.id,actor,'CANCELLED')
      }
      mission.updatedAt=Date.now(); this.putMission(mission); return mission
    })()
  }
  reassignTask(missionId: string, taskId: string, newAssignee: AgentName, actor: string, justification: string): { mission: Mission; task: Task } {
    return this.db.transaction(() => {
      const mission = this.getMission(missionId)
      if (!mission) throw new Error('MISSION_NOT_FOUND')
      const task = mission.tasks.find(t => t.id === taskId)
      if (!task) throw new Error('TASK_NOT_FOUND')
      if (task.status === 'EXECUTED') {
        throw new Error('CANNOT_REASSIGN_COMPLETED_TASK')
      }

      const capabilityId = task.capabilityId ?? 'cap:crypto:hash@1.0.0'
      const check = defaultCapabilityRegistry.canReassign(task.assignedTo, newAssignee, capabilityId)
      if (!check.allowed) {
        this.recordAuditEvent({
          actor,
          missionId,
          action: 'REASSIGNMENT_REJECTED',
          result: `BLOCKED:${task.assignedTo}->${newAssignee}`,
          correlationId: taskId,
        })
        throw new Error(check.reason ?? 'REASSIGNMENT_DISALLOWED')
      }

      const oldAssignee = task.assignedTo
      task.assignedTo = newAssignee
      task.justification = `Reasignado de ${oldAssignee} a ${newAssignee}: ${justification}`
      mission.updatedAt = Date.now()
      this.putMission(mission)

      this.recordAuditEvent({
        actor,
        missionId,
        action: 'TASK_REASSIGNED',
        result: `${oldAssignee}->${newAssignee}`,
        correlationId: taskId,
      })

      return { mission, task }
    })()
  }
  async createMultiDocumentMission(
    owner: string,
    title: string,
    documents: Array<{ filename: string; content: string; mimeType?: string }>,
    budgetLimit = 150000,
  ): Promise<{ mission: Mission; approvalId: string }> {
    const id = randomUUID(), approvalId = randomUUID(), now = Date.now()
    const docCount = documents.length
    const cleanDocs = documents.map(d => ({
      filename: d.filename,
      content: d.content,
      mimeType: d.mimeType ?? 'text/plain',
      sizeBytes: Buffer.byteLength(d.content, 'utf8'),
    }))
    const documentEvidence = analyzeDocuments(cleanDocs)

    const t1Id = randomUUID(), t2Id = randomUUID(), t3Id = randomUUID()
    const t4Id = randomUUID(), t5Id = randomUUID(), t6Id = randomUUID()

    const tasks: Task[] = [
      {
        id: t1Id,
        missionId: id,
        title: `Ingesta y extracción de ${docCount} documentos`,
        description: `Recepción, parsing estructurado y normalización del lote por CHARON.`,
        assignedTo: 'CHARON',
        status: 'EXECUTED',
        priority: 'P0',
        dependsOn: [],
        createdAt: now,
        startedAt: now,
        completedAt: now,
        capabilityId: 'cap:doc:intake@1.0.0',
        result: {
          taskId: t1Id,
          success: true,
          summary: `Análisis local de ${docCount} textos; despacho de CHARON no implementado`,
          data: { simulated: true, executionMode: 'DEMO', totalDocuments: docCount, totalWords: cleanDocs.reduce((sum, d) => sum + d.content.split(/\s+/).length, 0) },
          cerberusIds: [],
        },
      },
      {
        id: t2Id,
        missionId: id,
        title: 'Validación de cumplimiento y detección de cláusulas de riesgo',
        description: 'Inspección de integridad normativa, términos de mora y causales de rescisión por MINOS.',
        assignedTo: 'MINOS',
        status: 'EXECUTED',
        priority: 'P0',
        dependsOn: [t1Id],
        createdAt: now,
        startedAt: now,
        completedAt: now,
        capabilityId: 'cap:doc:validate@1.0.0',
        result: {
          taskId: t2Id,
          success: true,
          summary: `Búsqueda textual básica; validación normativa por MINOS no implementada`,
          data: {
            simulated: true,
            executionMode: 'DEMO',
            totalChecked: docCount,
            highRiskDetected: cleanDocs.some(d => d.content.toLowerCase().includes('sin garantía') || d.content.toLowerCase().includes('0%')),
          },
          cerberusIds: [],
        },
      },
      {
        id: t3Id,
        missionId: id,
        title: 'Comparación multi-documental y análisis financiero cruzado',
        description: 'Síntesis comparativa de ofertas: contraste de precios, penalizaciones y SLA por PERSEPHONE.',
        assignedTo: 'PERSEPHONE',
        status: 'EXECUTED',
        priority: 'P1',
        dependsOn: [t2Id],
        createdAt: now,
        startedAt: now,
        completedAt: now,
        capabilityId: 'cap:doc:compare@1.0.0',
        result: {
          taskId: t3Id,
          success: true,
          summary: `Coincidencias textuales extraídas de ${docCount} documentos; comparación semántica no implementada`,
          data: {
            simulated: true,
            executionMode: 'DEMO',
            documentsAnalyzed: cleanDocs.map(d => d.filename),
            evidence: documentEvidence,
            mode: 'RULE_BASED',
          },
          cerberusIds: [],
        },
      },
      {
        id: t4Id,
        missionId: id,
        title: 'Gobernanza de políticas y control de aprobación ejecutiva',
        description: 'Supervisión de CERBERUS y autorización administrativa obligatoria.',
        assignedTo: 'HADES',
        status: 'CERBERUS_REVIEW',
        priority: 'P1',
        dependsOn: [t3Id],
        createdAt: now,
        startedAt: now,
        completedAt: null,
        capabilityId: 'cap:crypto:hash@1.0.0',
        requiresApproval: true,
        result: {
          taskId: t4Id,
          success: false,
          summary: 'Esperando aprobación de administrador para autorizar dictamen y sellado',
          data: { pendingApproval: true, escalationId: approvalId, simulated: false },
          cerberusIds: [],
        },
      },
      {
        id: t5Id,
        missionId: id,
        title: 'Generación de informe consolidado ejecutivo',
        description: 'Elaboración de entregable final con tabla comparativa de proveedores y dictamen por ELYSIUM.',
        assignedTo: 'ELYSIUM',
        status: 'ASSIGNED',
        priority: 'P1',
        dependsOn: [t4Id],
        createdAt: now,
        startedAt: null,
        completedAt: null,
        capabilityId: 'cap:report:generate@1.0.0',
        result: null,
      },
      {
        id: t6Id,
        missionId: id,
        title: 'Custodia, archivo resiliente y sellado criptográfico SHA-256',
        description: 'Generación determinista de hash SHA-256 de evidencia por HADES o TARTARUS.',
        assignedTo: 'TARTARUS',
        status: 'ASSIGNED',
        priority: 'P2',
        dependsOn: [t5Id],
        createdAt: now,
        startedAt: null,
        completedAt: null,
        capabilityId: 'cap:crypto:hash@1.0.0',
        result: null,
      },
    ]

    const mission: Mission = {
      id,
      ownerId: owner,
      title,
      description: `Comparación multiagente de ${docCount} documentos contractuales`,
      context: {
        organizationId: 'techcore-enterprise',
        budgetLimit,
        currency: 'MXN',
        deadline: null,
        priority: 'HIGH',
        tags: ['multi-doc', 'enterprise-comparison', 'phase8'],
        documents: cleanDocs,
      },
      status: 'PARTIAL_COMPLETE',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      tasks,
      report: null,
    }

    const inputData = cleanDocs.map(d => `${d.filename}:${d.content.slice(0, 100)}`).join('|')

    this.db.transaction(() => {
      this.putMission(mission)
      this.db.prepare('INSERT INTO local_operations (id,mission_id,owner_id,input,state) VALUES (?,?,?,?,?)')
        .run(approvalId, id, owner, inputData, 'WAITING_APPROVAL')
      for (const state of ['CREATED', 'WAITING_APPROVAL']) this.workflowEvent(id, owner, state)
    })()

    return { mission, approvalId }
  }
  hasUsers(): boolean { return !!(this.db.prepare('SELECT 1 FROM users LIMIT 1').get()) }
  getMeta(key: string): string | undefined { const row = this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key) as { value: string } | undefined; return row?.value }
  setMeta(key: string, value: string): void { this.db.prepare('INSERT INTO metadata (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value) }
  setupFirstAdmin(username: string, hash: string, token: string): boolean {
    return this.db.transaction(() => {
      const raw = this.getMeta('setup_token')
      if (!raw) return false
      let stored: string
      try { stored = (JSON.parse(raw) as {token:string}).token } catch { return false }
      if (stored !== token) return false
      if ((this.db.prepare('SELECT 1 FROM users LIMIT 1').get())) return false
      const event = { id: randomUUID(), type: 'SETUP_ADMIN_CREATED', actor: 'bootstrap', timestamp: Date.now(), payload: { username } }
      this.createUser(username, hash, 'ADMIN')
      this.db.prepare('DELETE FROM metadata WHERE key=?').run('setup_token')
      this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id, JSON.stringify(event))
      return true
    })()
  }
  createUser(username: string, passwordHash: string, role: string): string {
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username) || !['ADMIN','OPERATOR','AUDITOR','VIEWER'].includes(role)) throw new Error('INVALID_USER')
    const id=randomUUID(); this.db.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id,username.toLowerCase(),passwordHash,role); return id
  }
  findUser(username: string): {id:string; password_hash:string; role:string; active:number} | undefined {
    return this.db.prepare('SELECT id,password_hash,role,active FROM users WHERE username=?').get(username.toLowerCase()) as {id:string;password_hash:string;role:string;active:number} | undefined
  }
  resetPassword(username: string, passwordHash: string): boolean {
    return this.db.transaction(() => {
      const user=this.db.prepare('SELECT id FROM users WHERE username=?').get(username.toLowerCase()) as {id:string} | undefined
      if (!user) return false
      this.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash,user.id)
      this.db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(Date.now(),user.id)
      const event={id:randomUUID(),type:'LOCAL_PASSWORD_RESET',actor:'local-operator',timestamp:Date.now(),payload:{userId:user.id}}
      this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id,JSON.stringify(event)); return true
    })()
  }
  createSession(userId: string, expiresAt: number): string { return this.db.transaction(() => { const id=randomUUID(); this.db.prepare('INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)').run(id,userId,expiresAt); this.recordAuditEvent({actor:userId,action:'LOGIN',result:'SUCCESS'}); return id })() }
  getActiveSession(id: string): {sub:string;roles:string[]} | undefined {
    const row=this.db.prepare('SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.active=1').get(id,Date.now()) as {id:string;role:string} | undefined
    return row ? {sub:row.id,roles:[row.role]} : undefined
  }
  revokeSession(id: string): void { this.db.transaction(() => { const row=this.db.prepare('SELECT user_id FROM sessions WHERE id=? AND revoked_at IS NULL').get(id) as {user_id:string} | undefined; this.db.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(Date.now(),id); if(row) this.recordAuditEvent({actor:row.user_id,action:'LOGOUT',result:'SUCCESS'}) })() }
  cancelLocalMission(missionId: string, actor: string, admin: boolean, reason: string): Mission {
    return this.db.transaction(() => {
      const mission = this.getMission(missionId)
      if (!mission || (!admin && mission.ownerId !== actor)) throw new Error('MISSION_NOT_FOUND')
      const op = this.db.prepare('SELECT id,state FROM local_operations WHERE mission_id=?').get(missionId) as {id:string;state:string} | undefined
      if (!op) throw new Error('CANNOT_CANCEL')
      if (op.state !== 'WAITING_APPROVAL') throw new Error('CANNOT_CANCEL')
      const now=Date.now(), task=mission.tasks[0]!
      task.status='CANCELLED'; task.completedAt=now; task.result={taskId:task.id,success:false,summary:'Cancelada antes de la ejecución',data:{cancelled:true},cerberusIds:[]}
      mission.status='CANCELLED'; mission.updatedAt=now; mission.completedAt=now
      this.db.prepare("UPDATE local_operations SET state='CANCELLED',decided_by=?,decided_at=? WHERE id=? AND state='WAITING_APPROVAL'").run(actor,now,op.id)
      const event = {id:randomUUID(),type:'LOCAL_EXECUTION_STATE',actor,timestamp:now,payload:{missionId,state:'CANCELLED',reason}}
      this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id,JSON.stringify(event)); this.recordAuditEvent({actor,missionId,action:'MISSION_STATE',result:'CANCELLED'}); this.putMission(mission); return mission
    })()
  }
  saveDocumentResult(id: string, ownerId: string, filename: string, status: string, data: unknown): void {
    this.db.transaction(() => { this.db.prepare('INSERT INTO document_results (id,owner_id,filename,status,created_at,data) VALUES (?,?,?,?,?,?)').run(id, ownerId, filename, status, Date.now(), JSON.stringify(data)); const missionId=(data as {missionId?:string})?.missionId; this.recordAuditEvent({actor:ownerId,missionId,action:'DOCUMENT_PROCESSED',result:status,correlationId:missionId ?? id}) })()
  }
  getDocumentResult(id: string, ownerId: string): { id: string; filename: string; status: string; createdAt: number; data: unknown } | undefined {
    const row = this.db.prepare('SELECT id,filename,status,created_at,data FROM document_results WHERE id=? AND owner_id=?').get(id, ownerId) as {id:string;filename:string;status:string;created_at:number;data:string} | undefined
    if (!row) return undefined
    return { id: row.id, filename: row.filename, status: row.status, createdAt: row.created_at, data: JSON.parse(row.data) }
  }
  listDocumentResults(ownerId: string, limit = 50): Array<{ id: string; filename: string; status: string; createdAt: number; data: unknown }> {
    const rows = this.db.prepare('SELECT id,filename,status,created_at,data FROM document_results WHERE owner_id=? ORDER BY created_at DESC LIMIT ?').all(ownerId, limit) as Array<{id:string;filename:string;status:string;created_at:number;data:string}>
    return rows.map(r => ({ id: r.id, filename: r.filename, status: r.status, createdAt: r.created_at, data: JSON.parse(r.data) }))
  }
  close(): void { this.db.close() }
}
