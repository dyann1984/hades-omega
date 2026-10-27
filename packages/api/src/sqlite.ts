import Database from 'better-sqlite3'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { AuditRecord, Mission } from '@hades/core'
import { JsonRepository, type StoredApproval, type SystemEvent } from './persistence.js'

type Legacy = { missions: Mission[]; audits: AuditRecord[]; approvals: StoredApproval[]; events: SystemEvent[]; idempotency: Record<string, { fingerprint: string; missionId: string }> }
type Row = { data: string }

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
  override getIdempotent(key: string, fingerprint: string): Mission | undefined { const row = this.db.prepare('SELECT mission_id FROM idempotency WHERE key=? AND fingerprint=?').get(key, fingerprint) as { mission_id: string } | undefined; return row && this.getMission(row.mission_id) }
  override async saveMission(mission: Mission, idempotency?: {key: string; fingerprint: string}): Promise<void> {
    this.db.transaction(() => { this.putMission(mission); if (idempotency) this.db.prepare('INSERT INTO idempotency VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET fingerprint=excluded.fingerprint, mission_id=excluded.mission_id').run(idempotency.key,idempotency.fingerprint,mission.id) })()
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
  private workflowEvent(missionId: string, actor: string, state: string): void {
    const event = { id: randomUUID(), type: 'LOCAL_EXECUTION_STATE', actor, timestamp: Date.now(), payload: { missionId, state } }
    this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id, JSON.stringify(event))
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
      for (const state of ['CREATED','QUEUED','RUNNING','WAITING_APPROVAL']) this.workflowEvent(id,owner,state)
    })()
    return { mission, approvalId }
  }
  async decideLocalOperation(id: string, decision: 'APPROVED' | 'REJECTED', actor: string, justification: string): Promise<Mission> {
    return this.db.transaction(() => {
      const op = this.db.prepare('SELECT * FROM local_operations WHERE id=?').get(id) as { mission_id: string; input: string; state: string } | undefined
      if (!op) throw new Error('ESCALATION_NOT_FOUND')
      if (op.state !== 'WAITING_APPROVAL') throw new Error('APPROVAL_ALREADY_RESOLVED')
      const mission = this.getMission(op.mission_id)!
      const task = mission.tasks[0]!
      const at = Date.now()
      const approval: StoredApproval = { id: randomUUID(), escalationId: id, status: decision, justification, decidedBy: actor, decidedAt: at, executionAuthorized: decision === 'APPROVED' }
      this.db.prepare('INSERT INTO approvals VALUES (?,?,?)').run(approval.id,id,JSON.stringify(approval))
      this.workflowEvent(mission.id,actor,decision)
      if (decision === 'APPROVED') {
        this.workflowEvent(mission.id,actor,'RESUMING'); this.workflowEvent(mission.id,actor,'RUNNING')
        const sha256 = createHash('sha256').update(op.input,'utf8').digest('hex')
        task.status = 'EXECUTED'; task.startedAt = at; task.completedAt = Date.now()
        task.result = { taskId: task.id, success: true, summary: 'SHA-256 calculado localmente', data: { algorithm: 'sha256', encoding: 'utf8', sha256, inputBytes: Buffer.byteLength(op.input,'utf8'), simulated: false }, cerberusIds: [] }
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
  createSession(userId: string, expiresAt: number): string { const id=randomUUID(); this.db.prepare('INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)').run(id,userId,expiresAt); return id }
  getActiveSession(id: string): {sub:string;roles:string[]} | undefined {
    const row=this.db.prepare('SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.active=1').get(id,Date.now()) as {id:string;role:string} | undefined
    return row ? {sub:row.id,roles:[row.role]} : undefined
  }
  revokeSession(id: string): void { this.db.prepare('UPDATE sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(Date.now(),id) }
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
      this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id,JSON.stringify(event)); this.putMission(mission); return mission
    })()
  }
  close(): void { this.db.close() }
}
