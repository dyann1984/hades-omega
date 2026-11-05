import Database from 'better-sqlite3'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { AuditRecord, Mission, Task, AgentName } from '@hades/core'
import { LlmPolicyStore } from './llm-governor.js'
import { defaultCapabilityRegistry, bus, createDefaultToolRegistry } from '@hades/core'
import { CerberusGate } from './cerberus-gate.js'
import { NearSubmissionService } from './near/submission.js'
import { JsonRepository, type StoredApproval, type SystemEvent } from './persistence.js'
import { analyzeDocuments } from './document-analysis.js'
import { dispatchCapability } from './capability-dispatcher.js'
import { guard } from './runtime.js'
import { NearIntentStore } from './near-intents.js'
import { ChronosService, CHRONOS_MIGRATION_SQL } from './chronos/chronos.js'
import { SecretVault } from './secret-vault.js'

type Legacy = { missions: Mission[]; audits: AuditRecord[]; approvals: StoredApproval[]; events: SystemEvent[]; idempotency: Record<string, { fingerprint: string; missionId: string }> }
type Row = { data: string }
const AUDIT_GENESIS = 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000'
export interface AuditIntegrity {
  verified: boolean
  /** Why verification failed; absent when verified. Stable identifiers for UIs and indexers. */
  code?: 'HASH_MISSING' | 'CHAIN_BROKEN' | 'HASH_MISMATCH' | 'TRUNCATED' | 'ANCHOR_BEHIND' | 'HEAD_MISMATCH'
  totalEvents: number; brokenAtId: string | null; error: string | null
  /** Hash of the last chained event, and how many events are chained (legacy unhashed rows excluded). */
  headHash: string | null; hashedEvents: number
  /** Local anchor kept in the database; null only on databases that predate it. */
  anchor: { count: number; headHash: string | null } | null
}
export interface ExecutionEvent {
  eventId: string; missionId: string; taskId: string | null; agentId: string | null
  type: string; status: string; timestamp: number; sequence: number; correlationId: string
}

export interface MissionEvidence { missionId: string; reportSha256: string; reportMarkdown: string; sealedTaskId: string; recordedBy: string; recordedAt: number; nearIntentId: string | null; nearState: string | null; nearNote: string | null; nearUpdatedAt: number | null }

/** SQLite-backed repository. Legacy JSON is imported once, after a separate backup. */
export class SqliteRepository extends JsonRepository {
  private db!: Database.Database
  private nearIntents!: NearIntentStore
  private chronosService!: ChronosService
  private gateInstance!: CerberusGate
  /** The single authorization boundary for external effects. */
  get gate(): CerberusGate { return this.gateInstance }
  private llmPolicyStore!: LlmPolicyStore
  get llmPolicy(): LlmPolicyStore { return this.llmPolicyStore }
  get chronos(): ChronosService { return this.chronosService }
  createSecretVault(key: string | undefined): SecretVault { return new SecretVault(this.db, key, (actor, action, result) => { this.recordAuditEvent({ actor, action, result }) }) }
  /** Builds the NEAR submission service over this repository's database (kept here so `db` stays private). */
  createNearSubmissionService(deps: Omit<ConstructorParameters<typeof NearSubmissionService>[0], 'db' | 'repository'>): NearSubmissionService {
    return new NearSubmissionService({ ...deps, db: this.db, repository: this })
  }
  /** Cheap liveness probe of the live database handle. */
  ping(): boolean { try { return (this.db.prepare('SELECT 1 AS ok').get() as { ok: number }).ok === 1 } catch { return false } }
  /** Second service over the same database with its own clock; used by tests to simulate time and extra processes. */
  createChronos(clock: () => number): ChronosService { return new ChronosService(this.db, this, clock) }
  /** Where execution events are delivered. Defaults to the global bus; isolated demo repositories override it. */
  eventSink: (event: {type:'EXECUTION_EVENT'; payload: any}) => void = event => bus.publish(event as any)
  constructor(private readonly databasePath: string, private readonly legacyPath: string, private readonly policyGuard = guard) { super(legacyPath) }
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
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 8').get()) {
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE task_leases (attempt_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, mission_id TEXT NOT NULL, process_id TEXT NOT NULL, acquired_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, released_at INTEGER, outcome TEXT); CREATE INDEX idx_task_leases_active ON task_leases(task_id, mission_id, released_at);`)
        this.db.prepare('INSERT INTO schema_migrations VALUES (8)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 9').get()) {
      this.db.transaction(() => {
        this.db.exec(CHRONOS_MIGRATION_SQL)
        this.db.prepare('INSERT INTO schema_migrations VALUES (9)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 10').get()) {
      this.db.transaction(() => {
        this.db.exec(`CREATE TABLE mission_evidence (mission_id TEXT PRIMARY KEY, report_sha256 TEXT NOT NULL, report_markdown TEXT NOT NULL, sealed_task_id TEXT NOT NULL, recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL, near_intent_id TEXT, near_state TEXT, near_note TEXT, near_updated_at INTEGER);`)
        this.db.prepare('INSERT INTO schema_migrations VALUES (10)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 11').get()) {
      this.db.transaction(() => {
        this.db.exec('CREATE TABLE vault_secrets (name TEXT PRIMARY KEY, nonce BLOB NOT NULL, ciphertext BLOB NOT NULL, tag BLOB NOT NULL, updated_at INTEGER NOT NULL)')
        this.db.prepare('INSERT INTO schema_migrations VALUES (11)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 12').get()) {
      this.db.transaction(() => {
        // Claim timestamp lets recovery distinguish a live run owned by another process from an orphaned one.
        this.db.exec('ALTER TABLE chronos_runs ADD COLUMN claimed_at INTEGER')
        this.db.prepare('INSERT INTO schema_migrations VALUES (12)').run()
      })()
    }
    if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 13').get()) {
      this.db.transaction(() => {
        // Local anchor of the audit chain: how many hashed events exist and which hash is the head. Updated in the same
        // transaction as every event so truncation and replacement of the tail become detectable. Seeded from current data.
        this.db.exec('CREATE TABLE IF NOT EXISTS audit_anchor (id INTEGER PRIMARY KEY CHECK(id = 1), count INTEGER NOT NULL, head_hash TEXT, updated_at INTEGER NOT NULL)')
        const n = (this.db.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE hash IS NOT NULL').get() as { n: number }).n
        const head = (this.db.prepare('SELECT hash FROM audit_events WHERE hash IS NOT NULL ORDER BY rowid DESC LIMIT 1').get() as { hash: string } | undefined)?.hash ?? null
        this.db.prepare('INSERT OR REPLACE INTO audit_anchor (id,count,head_hash,updated_at) VALUES (1,?,?,?)').run(n, head, Date.now())
        this.db.prepare('INSERT INTO schema_migrations VALUES (13)').run()
      })()
    }
    this.chronosService = new ChronosService(this.db, this)
    this.llmPolicyStore = new LlmPolicyStore(this.db)
    this.gateInstance = new CerberusGate(this.db, createDefaultToolRegistry(), { policyHash: () => this.policyGuard.getPolicyHash(), audit: e => { this.recordAuditEvent(e) }, egressAllowed: tool => tool === 'llm.plan' && this.llmPolicyStore.isEnabled() })
    this.nearIntents = new NearIntentStore(this.db, this.policyGuard, this.gateInstance)
    this.reconcileOnStartup()
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
  getNearIntentStore(): NearIntentStore { return this.nearIntents }
  /** Persistent evidence of a finished audit mission: the report text and its SHA-256, plus the state of the NEAR audit plan. */
  getMissionEvidence(missionId: string): MissionEvidence | undefined {
    const r = this.db.prepare('SELECT * FROM mission_evidence WHERE mission_id=?').get(missionId) as { mission_id: string; report_sha256: string; report_markdown: string; sealed_task_id: string; recorded_by: string; recorded_at: number; near_intent_id: string | null; near_state: string | null; near_note: string | null; near_updated_at: number | null } | undefined
    return r && { missionId: r.mission_id, reportSha256: r.report_sha256, reportMarkdown: r.report_markdown, sealedTaskId: r.sealed_task_id, recordedBy: r.recorded_by, recordedAt: r.recorded_at, nearIntentId: r.near_intent_id, nearState: r.near_state, nearNote: r.near_note, nearUpdatedAt: r.near_updated_at }
  }
  /** Insert-only: evidence is never rewritten once recorded. Returns false if it already existed. */
  saveMissionEvidence(e: { missionId: string; reportSha256: string; reportMarkdown: string; sealedTaskId: string; recordedBy: string }): boolean {
    return this.db.transaction(() => {
      const res = this.db.prepare('INSERT OR IGNORE INTO mission_evidence (mission_id,report_sha256,report_markdown,sealed_task_id,recorded_by,recorded_at) VALUES (?,?,?,?,?,?)').run(e.missionId, e.reportSha256, e.reportMarkdown, e.sealedTaskId, e.recordedBy, Date.now())
      if (res.changes === 1) this.recordAuditEvent({ actor: e.recordedBy, missionId: e.missionId, action: 'MISSION_EVIDENCE_RECORDED', result: e.reportSha256 })
      return res.changes === 1
    })()
  }
  setMissionNear(missionId: string, state: string, intentId: string | null, note: string | null, actor: string): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE mission_evidence SET near_state=?, near_intent_id=?, near_note=?, near_updated_at=? WHERE mission_id=?').run(state, intentId, note, Date.now(), missionId)
      this.recordAuditEvent({ actor, missionId, action: 'MISSION_NEAR_AUDIT_PLAN', result: state })
    })()
  }
  getLocalOperationState(missionId: string): string | undefined { return (this.db.prepare('SELECT state FROM local_operations WHERE mission_id=?').get(missionId) as { state: string } | undefined)?.state }
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

    // Read-the-head, insert and anchor update are one transaction: with WAL a second process that read a stale head cannot
    // commit (SQLITE_BUSY) instead of forking the chain. Inside a caller's transaction this becomes a savepoint.
    const append = this.db.transaction((): { id: string; hash: string; prevHash: string | null } => {
      const lastRow = this.db.prepare('SELECT hash FROM audit_events ORDER BY rowid DESC LIMIT 1').get() as { hash: string | null } | undefined
      const prevHash = lastRow?.hash ?? AUDIT_GENESIS
      const payload = `${prevHash}|${id}|${input.actor}|${missionId}|${input.action}|${input.result}|${correlationId}|${now}`
      const hash = createHash('sha256').update(payload, 'utf8').digest('hex')
      this.db.prepare('INSERT INTO audit_events (id,actor,mission_id,action,result,correlation_id,timestamp,prev_hash,hash) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, input.actor, missionId, input.action, input.result, correlationId, now, prevHash, hash)
      const moved = this.db.prepare('UPDATE audit_anchor SET count = count + 1, head_hash = ?, updated_at = ? WHERE id = 1').run(hash, now)
      if (moved.changes !== 1) this.db.prepare('INSERT INTO audit_anchor (id,count,head_hash,updated_at) VALUES (1,1,?,?)').run(hash, now)
      return { id, hash, prevHash }
    })
    return this.db.inTransaction ? append() : append.immediate()
  }
  listAuditEvents(filter: { action?: string; missionId?: string; limit: number; offset: number }): Array<{id:string;actor:string;missionId:string|null;action:string;result:string;correlationId:string;timestamp:number;prev_hash?:string|null;hash?:string|null}> {
    return this.db.prepare('SELECT id,actor,mission_id AS missionId,action,result,correlation_id AS correlationId,timestamp,prev_hash,hash FROM audit_events WHERE (? IS NULL OR action=?) AND (? IS NULL OR mission_id=?) ORDER BY timestamp DESC, rowid DESC LIMIT ? OFFSET ?').all(filter.action ?? null,filter.action ?? null,filter.missionId ?? null,filter.missionId ?? null,filter.limit,filter.offset) as Array<{id:string;actor:string;missionId:string|null;action:string;result:string;correlationId:string;timestamp:number;prev_hash?:string|null;hash?:string|null}>
  }
  /**
   * Recomputes the audit chain. Legacy rows without a hash are accepted ONLY before the first hashed event (pre-migration
   * data); a missing hash afterwards is tampering. The local anchor (count + head) additionally exposes truncation and
   * replacement of the tail. An attacker who can also rewrite the anchor is caught only by an external anchor
   * (see scripts/verify-audit-chain.cjs --expect-head/--expect-count).
   */
  verifyAuditIntegrity(): AuditIntegrity {
    const events = this.db.prepare('SELECT id,actor,mission_id,action,result,correlation_id,timestamp,prev_hash,hash FROM audit_events ORDER BY rowid ASC').all() as Array<{
      id: string; actor: string; mission_id: string | null; action: string; result: string; correlation_id: string; timestamp: number; prev_hash: string | null; hash: string | null
    }>
    const anchorRow = this.db.prepare('SELECT count, head_hash FROM audit_anchor WHERE id = 1').get() as { count: number; head_hash: string | null } | undefined
    const anchor = anchorRow ? { count: anchorRow.count, headHash: anchorRow.head_hash } : null
    let currentPrev = AUDIT_GENESIS, hashed = 0
    const fail = (code: AuditIntegrity['code'], id: string | null, error: string): AuditIntegrity => ({ verified: false, code, totalEvents: events.length, brokenAtId: id, error, headHash: hashed ? currentPrev : null, hashedEvents: hashed, anchor })
    for (const evt of events) {
      if (!evt.hash) {
        if (hashed > 0) return fail('HASH_MISSING', evt.id, `Evento sin hash después de la cadena firmada: ${evt.id}`)
        continue // evento pre-migración v6, anterior al primer evento encadenado
      }
      if (evt.prev_hash !== currentPrev) return fail('CHAIN_BROKEN', evt.id, `Discrepancia en cadena: prev_hash esperado ${currentPrev}, encontrado ${evt.prev_hash}`)
      const payload = `${evt.prev_hash}|${evt.id}|${evt.actor}|${evt.mission_id}|${evt.action}|${evt.result}|${evt.correlation_id}|${evt.timestamp}`
      if (evt.hash !== createHash('sha256').update(payload, 'utf8').digest('hex')) return fail('HASH_MISMATCH', evt.id, `Hash alterado o no coincidente para evento ${evt.id}`)
      currentPrev = evt.hash; hashed++
    }
    if (anchor) {
      if (hashed < anchor.count) return fail('TRUNCATED', null, `Faltan eventos: la cadena tiene ${hashed} y el ancla registra ${anchor.count}`)
      if (hashed > anchor.count) return fail('ANCHOR_BEHIND', null, `La cadena tiene ${hashed} eventos y el ancla sólo ${anchor.count}`)
      if (hashed > 0 && anchor.headHash !== currentPrev) return fail('HEAD_MISMATCH', null, 'La cabeza de la cadena no coincide con el ancla')
    }
    return { verified: true, totalEvents: events.length, brokenAtId: null, error: null, headHash: hashed ? currentPrev : null, hashedEvents: hashed, anchor }
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
    const initialId = this.getLocalOperationMissionId(id)
    const initial = initialId ? this.getMission(initialId) : undefined
    if (initial?.context?.tags?.includes('dispatcher-v1')) return this.decideDispatchedMission(id, decision, actor, justification)
    if (initial?.context?.tags?.includes('multi-doc') && decision === 'APPROVED') throw new Error('LEGACY_WORKFLOW_BLOCKED')
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
                  simulated: false, executionMode: 'LOCAL_RULE_ENGINE', agentDispatch: 'NOT_IMPLEMENTED',
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
                  simulated: false, executionMode: 'LOCAL_RULE_ENGINE', agentDispatch: 'NOT_IMPLEMENTED',
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
      if (mission.context?.tags?.includes('dispatcher-v1')) throw new Error('BLOCKED_BY_DESIGN: Reasignación no disponible para el flujo con aprobación')
      if (task.status === 'EXECUTED' || task.status === 'COMPLETED' || task.status === 'RUNNING') {
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
  private emitExecution(missionId: string, task: Task | null, type: string, status: string): void {
    const eventId = randomUUID()
    this.db.prepare('INSERT INTO execution_events (sequence,event_id,mission_id,task_id,agent_id,type,status,timestamp,correlation_id) VALUES ((SELECT COALESCE(MAX(sequence),0)+1 FROM execution_events WHERE mission_id=?),?,?,?,?,?,?,?,?)')
      .run(missionId,eventId,missionId,task?.id ?? null,task?.assignedTo ?? null,type,status,Date.now(),missionId)
  }
  private publishSince(missionId: string, cursor: number): void {
    for (const event of this.listExecutionEvents(missionId,cursor)) this.eventSink({type:'EXECUTION_EVENT',payload:event})
  }
  private claimTaskLease(missionId: string, taskId: string, processId: string, ttlMs = 30_000): string | null {
    return this.db.transaction(() => {
      const now = Date.now()
      const active = this.db.prepare(`SELECT attempt_id FROM task_leases WHERE task_id=? AND mission_id=? AND released_at IS NULL AND expires_at > ?`).get(taskId, missionId, now) as {attempt_id:string} | undefined
      if (active) return null
      const attemptId = randomUUID()
      this.db.prepare(`INSERT INTO task_leases (attempt_id,task_id,mission_id,process_id,acquired_at,expires_at) VALUES (?,?,?,?,?,?)`).run(attemptId,taskId,missionId,processId,now,now+ttlMs)
      return attemptId
    })()
  }
  private releaseTaskLease(attemptId: string, outcome: string): void {
    this.db.prepare(`UPDATE task_leases SET released_at=?,outcome=? WHERE attempt_id=?`).run(Date.now(),outcome,attemptId)
  }
  private reconcileOnStartup(): void {
    // Expire leases from previous process sessions
    this.db.prepare(`UPDATE task_leases SET released_at=?,outcome='EXPIRED' WHERE released_at IS NULL AND expires_at<?`).run(Date.now(),Date.now())
    // RUNNING → FAILED: process restarted mid-execution
    const runningOps = this.db.prepare(`SELECT id,mission_id FROM local_operations WHERE state='RUNNING'`).all() as Array<{id:string;mission_id:string}>
    for (const op of runningOps) {
      const mission = this.getMission(op.mission_id)
      if (!mission) continue
      let hadRunning = false
      for (const task of mission.tasks) {
        if (task.status === 'RUNNING') {
          task.status='FAILED'; task.completedAt=Date.now()
          task.result={taskId:task.id,success:false,summary:'Proceso interrumpido; recuperado como fallido al reiniciar',data:{error:'PROCESS_RESTART_RECOVERY',method:'RULE_BASED'},cerberusIds:[]}
          hadRunning=true
        }
      }
      if (hadRunning) {
        mission.status='FAILED'; mission.updatedAt=Date.now(); mission.completedAt=mission.completedAt??Date.now()
        this.db.prepare(`UPDATE local_operations SET state='FAILED' WHERE id=?`).run(op.id)
        this.putMission(mission)
        this.emitExecution(op.mission_id,null,'mission.failed','PROCESS_RESTART_RECOVERY')
        this.recordAuditEvent({actor:'system:startup-recovery',missionId:op.mission_id,action:'STARTUP_RECOVERY',result:'RUNNING_MARKED_FAILED'})
      }
    }
    // APPROVED → attempt resume for dispatcher-v1 missions (crashed between approval and execution)
    const approvedOps = this.db.prepare(`SELECT id,mission_id FROM local_operations WHERE state='APPROVED'`).all() as Array<{id:string;mission_id:string}>
    for (const op of approvedOps) {
      const mission = this.getMission(op.mission_id)
      if (!mission?.context?.tags?.includes('dispatcher-v1')) continue
      for (const task of mission.tasks) { if (task.status === 'RUNNING') { task.status='QUEUED'; task.startedAt=null } }
      this.putMission(mission)
      try {
        this.resumeApprovedDispatchedMission(op.id, op.mission_id)
        this.recordAuditEvent({actor:'system:startup-recovery',missionId:op.mission_id,action:'STARTUP_RECOVERY',result:'APPROVED_RESUMED'})
      } catch (e) {
        const current=this.getMission(op.mission_id)!
        current.status='FAILED'; current.updatedAt=Date.now()
        this.db.prepare(`UPDATE local_operations SET state='FAILED' WHERE id=?`).run(op.id)
        this.putMission(current)
        this.emitExecution(op.mission_id,null,'mission.failed','STARTUP_RECOVERY_FAILED')
        this.recordAuditEvent({actor:'system:startup-recovery',missionId:op.mission_id,action:'STARTUP_RECOVERY',result:`APPROVED_RESUME_FAILED:${(e as Error).message}`})
      }
    }
    // Log WAITING_APPROVAL missions for audit transparency (preserved without modification)
    const waitingOps = this.db.prepare(`SELECT mission_id FROM local_operations WHERE state='WAITING_APPROVAL'`).all() as Array<{mission_id:string}>
    for (const op of waitingOps) {
      this.recordAuditEvent({actor:'system:startup-recovery',missionId:op.mission_id,action:'STARTUP_RECOVERY',result:'WAITING_APPROVAL_PRESERVED'})
    }
  }
  private resumeApprovedDispatchedMission(opId: string, missionId: string): void {
    const mission = this.getMission(missionId)!
    if (mission.tasks.length !== 5) throw new Error('UNEXPECTED_TASK_COUNT')
    const elysiumTask=mission.tasks[3]!, tartarusTask=mission.tasks[4]!
    if (elysiumTask.status === 'QUEUED') {
      const persephoneResult=mission.tasks[2]?.result?.data
      if (!persephoneResult) throw new Error('PERSEPHONE_RESULT_MISSING')
      if (!this.runDispatchedTask(missionId,elysiumTask.id,persephoneResult)) throw new Error('ELYSIUM_FAILED_ON_RECOVERY')
    } else if (elysiumTask.status !== 'COMPLETED') throw new Error(`ELYSIUM_UNEXPECTED_STATE:${elysiumTask.status}`)
    const updated=this.getMission(missionId)!
    const elysiumResult=updated.tasks[3]!.result!.data as {reportMarkdown:string}
    if (!elysiumResult?.reportMarkdown) throw new Error('ELYSIUM_RESULT_MISSING')
    if (tartarusTask.status === 'QUEUED') {
      if (!this.runDispatchedTask(missionId,tartarusTask.id,elysiumResult.reportMarkdown)) throw new Error('TARTARUS_FAILED_ON_RECOVERY')
    } else if (tartarusTask.status !== 'COMPLETED') throw new Error(`TARTARUS_UNEXPECTED_STATE:${tartarusTask.status}`)
    const endCursor=this.executionCursor(missionId)
    this.db.transaction(() => {
      const finished=this.getMission(missionId)!
      if (finished.status === 'COMPLETED') return
      finished.status='COMPLETED'; finished.completedAt=finished.completedAt??Date.now(); finished.updatedAt=Date.now()
      this.db.prepare(`UPDATE local_operations SET state='COMPLETED' WHERE id=? AND state='APPROVED'`).run(opId)
      this.putMission(finished); this.emitExecution(missionId,null,'mission.completed','COMPLETED')
    })()
    this.publishSince(missionId,endCursor)
  }
  private runDispatchedTask(missionId: string, taskId: string, input: unknown, processId = String(process.pid)): boolean {
    const attemptId = this.claimTaskLease(missionId, taskId, processId)
    if (!attemptId) return false
    let task!: Task
    let cursor = this.executionCursor(missionId)
    try {
      this.db.transaction(() => {
        const mission = this.getMission(missionId)!
        task = mission.tasks.find(item => item.id === taskId)!
        if (task.status !== 'QUEUED') throw new Error('TASK_ALREADY_CLAIMED')
        task.status = 'RUNNING'; task.startedAt = Date.now()
        task.context = { ...(task.context ?? {}), executionInput: input, leaseAttemptId: attemptId, executorPid: processId }
        this.putMission(mission); this.emitExecution(missionId,task,'agent.started','RUNNING')
      })()
    } catch {
      this.releaseTaskLease(attemptId, 'SKIPPED')
      return false
    }
    this.publishSince(missionId,cursor)
    let output: unknown
    try { output = dispatchCapability(task.assignedTo, task.capabilityId!, input) }
    catch (error) {
      const message = (error as Error).message
      cursor = this.executionCursor(missionId)
      this.releaseTaskLease(attemptId, 'FAILED')
      this.db.transaction(() => {
        const mission = this.getMission(missionId)!, current = mission.tasks.find(item => item.id === taskId)!
        current.status = message.startsWith('CAPABILITY_') ? 'BLOCKED' : 'FAILED'; current.completedAt = Date.now()
        current.result = {taskId,success:false,summary:message,data:{error:message,method:'RULE_BASED'},cerberusIds:[]}
        mission.status='FAILED'; mission.completedAt=Date.now(); mission.updatedAt=Date.now()
        this.db.prepare("UPDATE local_operations SET state='FAILED' WHERE mission_id=?").run(missionId)
        this.putMission(mission); this.emitExecution(missionId,current,'agent.failed',current.status); this.emitExecution(missionId,null,'mission.failed','FAILED')
      })()
      this.publishSince(missionId,cursor); return false
    }
    cursor = this.executionCursor(missionId)
    this.releaseTaskLease(attemptId, 'COMPLETED')
    this.db.transaction(() => {
      const mission = this.getMission(missionId)!, current = mission.tasks.find(item => item.id === taskId)!
      if (current.status !== 'RUNNING') throw new Error('TASK_NOT_RUNNING')
      current.result={taskId,success:true,summary:`Capacidad ${current.capabilityId} ejecutada por adaptador determinista`,data:output,cerberusIds:[]}
      current.status='COMPLETED'; current.completedAt=Date.now(); mission.updatedAt=Date.now()
      this.putMission(mission); this.emitExecution(missionId,current,'agent.completed','COMPLETED')
    })()
    this.publishSince(missionId,cursor); return true
  }
  private createDispatchedMission(owner: string, title: string, documents: Array<{filename:string;content:string;mimeType?:string}>, budgetLimit: number, idempotencyKey?: string): {mission:Mission;approvalId:string} {
    const id=randomUUID(), approvalId=randomUUID(), now=Date.now()
    const key=idempotencyKey ? JSON.stringify([owner,idempotencyKey]) : undefined
    const fingerprint=createHash('sha256').update(JSON.stringify({title,documents,budgetLimit})).digest('hex')
    const steps: Array<[AgentName,string,string]> = [
      ['CHARON','cap:doc:intake@1.0.0','Extraer documentos'], ['MINOS','cap:doc:validate@1.0.0','Validar documentos'],
      ['PERSEPHONE','cap:doc:compare@1.0.0','Comparar documentos'], ['ELYSIUM','cap:report:generate@1.0.0','Generar informe'],
      ['TARTARUS','cap:crypto:hash@1.0.0','Sellar informe'],
    ]
    const tasks: Task[] = steps.map(([assignedTo,capabilityId,taskTitle]) => ({id:randomUUID(),missionId:id,title:taskTitle,description:taskTitle,assignedTo,capabilityId,status:'QUEUED',priority:'P1',dependsOn:[],createdAt:now,startedAt:null,completedAt:null,result:null}))
    tasks.forEach((task,index) => { if (index) task.dependsOn=[tasks[index-1]!.id] })
    const mission: Mission={id,ownerId:owner,title,description:'Análisis documental determinista',context:{organizationId:'',budgetLimit,currency:'MXN',deadline:null,priority:'MEDIUM',tags:['multi-doc','dispatcher-v1'],documents},status:'IN_PROGRESS',createdAt:now,updatedAt:now,completedAt:null,tasks,report:null}
    const existing=this.db.transaction(() => {
      if (key) {
        const prior=this.db.prepare('SELECT fingerprint,mission_id FROM idempotency WHERE key=?').get(key) as {fingerprint:string;mission_id:string}|undefined
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT')
          const operation=this.db.prepare('SELECT id FROM local_operations WHERE mission_id=?').get(prior.mission_id) as {id:string}
          return {mission:this.getMission(prior.mission_id)!,approvalId:operation.id}
        }
      }
      this.putMission(mission)
      this.db.prepare('INSERT INTO local_operations (id,mission_id,owner_id,input,state) VALUES (?,?,?,?,?)').run(approvalId,id,owner,'','RUNNING')
      if (key) this.db.prepare('INSERT INTO idempotency (key,fingerprint,mission_id) VALUES (?,?,?)').run(key,fingerprint,id)
      for (const task of tasks) this.emitExecution(id,task,'task.queued','QUEUED')
      return undefined
    })()
    if (existing) return existing
    this.publishSince(id,0)
    let input: unknown=documents
    for (const task of tasks.slice(0,3)) {
      if (!this.runDispatchedTask(id,task.id,input)) return {mission:this.getMission(id)!,approvalId}
      input=this.getMission(id)!.tasks.find(t => t.id === task.id)!.result!.data
    }
    const protectedTask=tasks[4]!
    const decision=this.policyGuard.evaluate({id:randomUUID(),agentId:`agent:${protectedTask.assignedTo.toLowerCase()}`,agentName:protectedTask.assignedTo,operationType:'CRYPTO_HASH',payload:{missionId:id},missionId:id,taskId:protectedTask.id,requestedAt:Date.now()})
    const cursor=this.executionCursor(id)
    this.db.transaction(() => {
      const current=this.getMission(id)!
      this.recordAuditEvent({actor:'CERBERUS',missionId:id,action:'POLICY_EVALUATED',result:decision.outcome,correlationId:decision.proposalId})
      current.context.guardDecision=decision
      current.context.guardPolicyHash=this.policyGuard.getPolicyHash()
      if (decision.outcome === 'DENY') {
        const task=current.tasks[4]!; task.status='BLOCKED'; task.completedAt=Date.now(); task.result={taskId:task.id,success:false,summary:decision.reason ?? 'DENY',data:{decision},cerberusIds:[decision.auditId]}
        current.status='FAILED'; current.completedAt=Date.now(); this.db.prepare("UPDATE local_operations SET state='FAILED' WHERE id=?").run(approvalId)
        this.putMission(current); this.emitExecution(id,task,'cerberus.blocked','DENY'); this.emitExecution(id,null,'mission.failed','FAILED')
      } else {
        current.tasks[3]!.status='CERBERUS_REVIEW'; current.status='PARTIAL_COMPLETE'; this.putMission(current)
        this.db.prepare("UPDATE local_operations SET state='WAITING_APPROVAL' WHERE id=?").run(approvalId)
        if (decision.outcome === 'ESCALATE') this.emitExecution(id,protectedTask,'cerberus.escalated','ESCALATE')
        this.workflowEvent(id,owner,'WAITING_APPROVAL')
      }
    })()
    this.publishSince(id,cursor)
    return {mission:this.getMission(id)!,approvalId}
  }
  private decideDispatchedMission(id: string, decision: 'APPROVED'|'REJECTED', actor: string, justification: string): Mission {
    const missionId=this.getLocalOperationMissionId(id)!
    const cursor=this.executionCursor(missionId)
    this.db.transaction(() => {
      const op=this.db.prepare('SELECT state FROM local_operations WHERE id=?').get(id) as {state:string}|undefined
      if (!op) throw new Error('ESCALATION_NOT_FOUND')
      if (op.state !== 'WAITING_APPROVAL') throw new Error('APPROVAL_ALREADY_RESOLVED')
      const mission=this.getMission(missionId)!, task=mission.tasks[3]!, now=Date.now()
      const approval: StoredApproval={id:randomUUID(),escalationId:id,status:decision,justification,decidedBy:actor,decidedAt:now,executionAuthorized:decision==='APPROVED'}
      this.db.prepare('INSERT INTO approvals VALUES (?,?,?)').run(approval.id,id,JSON.stringify(approval)); this.workflowEvent(missionId,actor,decision)
      if (decision === 'REJECTED') { task.status='BLOCKED'; task.completedAt=now; task.result={taskId:task.id,success:false,summary:'Operación rechazada por administrador',data:{rejected:true,executed:false},cerberusIds:[]}; for (const downstream of mission.tasks.slice(4)) { if (downstream.status==='QUEUED') { downstream.status='BLOCKED'; downstream.completedAt=now; downstream.result={taskId:downstream.id,success:false,summary:'No ejecutada: la operación previa fue rechazada',data:{executed:false,blockedBy:task.id},cerberusIds:[]} } } mission.status='FAILED'; mission.completedAt=now; this.db.prepare("UPDATE local_operations SET state='CANCELLED' WHERE id=?").run(id); this.putMission(mission); this.emitExecution(missionId,task,'mission.failed','REJECTED') }
      else { task.status='QUEUED'; mission.status='IN_PROGRESS'; this.db.prepare("UPDATE local_operations SET state='APPROVED' WHERE id=?").run(id); this.putMission(mission) }
    })()
    this.publishSince(missionId,cursor)
    if (decision==='REJECTED') return this.getMission(missionId)!
    const mission=this.getMission(missionId)!
    const comparison=mission.tasks[2]!.result!.data
    if (!this.runDispatchedTask(missionId,mission.tasks[3]!.id,comparison)) return this.getMission(missionId)!
    const report=this.getMission(missionId)!.tasks[3]!.result!.data as {reportMarkdown:string}
    const protectedTask=this.getMission(missionId)!.tasks[4]!
    const policyDecision=this.policyGuard.evaluate({id:randomUUID(),agentId:`agent:${protectedTask.assignedTo.toLowerCase()}`,agentName:protectedTask.assignedTo,operationType:'CRYPTO_HASH',payload:{inputBytes:Buffer.byteLength(report.reportMarkdown,'utf8')},missionId,taskId:protectedTask.id,requestedAt:Date.now()})
    const beforePolicy=this.executionCursor(missionId)
    const policyContext=this.getMission(missionId)!.context
    const previousDecision=policyContext.guardDecision as {outcome?:string} | undefined
    const blocked=policyContext.guardPolicyHash !== this.policyGuard.getPolicyHash() || policyDecision.outcome === 'DENY' || (policyDecision.outcome === 'ESCALATE' && (previousDecision?.outcome !== 'ESCALATE' || previousDecision && (previousDecision as {ruleMatched?:string|null}).ruleMatched !== policyDecision.ruleMatched))
    this.db.transaction(() => {
      const current=this.getMission(missionId)!
      this.recordAuditEvent({actor:'CERBERUS',missionId,action:'POLICY_EVALUATED',result:policyDecision.outcome,correlationId:policyDecision.proposalId})
      current.context.finalGuardDecision=policyDecision
      if (blocked) {
        const task=current.tasks[4]!; task.status='BLOCKED'; task.completedAt=Date.now()
        task.result={taskId:task.id,success:false,summary:'Política cambió o denegó la operación',data:{decision:policyDecision},cerberusIds:[policyDecision.auditId]}
        current.status='FAILED'; current.completedAt=Date.now()
        this.db.prepare("UPDATE local_operations SET state='FAILED' WHERE id=?").run(id)
        this.putMission(current); this.emitExecution(missionId,task,'cerberus.blocked',policyDecision.outcome); this.emitExecution(missionId,null,'mission.failed','BLOCKED')
      } else this.putMission(current)
    })()
    this.publishSince(missionId,beforePolicy)
    if (blocked) return this.getMission(missionId)!
    if (!this.runDispatchedTask(missionId,mission.tasks[4]!.id,report.reportMarkdown)) return this.getMission(missionId)!
    const endCursor=this.executionCursor(missionId)
    this.db.transaction(() => {
      const finished=this.getMission(missionId)!; finished.status='COMPLETED'; finished.completedAt=Date.now(); finished.updatedAt=Date.now()
      this.db.prepare("UPDATE local_operations SET state='COMPLETED' WHERE id=? AND state='APPROVED'").run(id)
      this.putMission(finished); this.emitExecution(missionId,null,'mission.completed','COMPLETED')
    })()
    this.publishSince(missionId,endCursor)
    return this.getMission(missionId)!
  }
  async createMultiDocumentMission(
    owner: string,
    title: string,
    documents: Array<{ filename: string; content: string; mimeType?: string }>,
    budgetLimit = 150000,
    idempotencyKey?: string,
  ): Promise<{ mission: Mission; approvalId: string }> {
    return this.createDispatchedMission(owner, title, documents, budgetLimit, idempotencyKey)
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
  getUserById(id: string): {id:string; username:string; password_hash:string; role:string; active:number} | undefined {
    return this.db.prepare('SELECT id,username,password_hash,role,active FROM users WHERE id=?').get(id) as {id:string;username:string;password_hash:string;role:string;active:number} | undefined
  }
  /** Updates the password (and optionally the username) atomically and revokes every session except `keepSid`. */
  updateCredentials(userId: string, passwordHash: string, newUsername: string | undefined, keepSid: string | undefined): void {
    this.db.transaction(() => {
      if (newUsername) {
        if (!/^[a-zA-Z0-9._-]{3,64}$/.test(newUsername)) throw new Error('INVALID_USER')
        const clash = this.db.prepare('SELECT id FROM users WHERE username=? AND id<>?').get(newUsername.toLowerCase(), userId)
        if (clash) throw new Error('USERNAME_TAKEN')
        this.db.prepare('UPDATE users SET username=? WHERE id=?').run(newUsername.toLowerCase(), userId)
      }
      this.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, userId)
      this.db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND id<>?').run(Date.now(), userId, keepSid ?? '')
      const event = { id: randomUUID(), type: 'CREDENTIALS_CHANGED', actor: userId, timestamp: Date.now(), payload: { userId, usernameChanged: !!newUsername } }
      this.db.prepare('INSERT INTO events VALUES (?,?)').run(event.id, JSON.stringify(event))
      this.recordAuditEvent({ actor: userId, action: 'CREDENTIALS_CHANGED', result: 'SUCCESS' })
    })()
  }  resetPassword(username: string, passwordHash: string): boolean {
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
      const now=Date.now(), task=mission.context?.tags?.includes('dispatcher-v1') ? mission.tasks.find(item => item.status === 'CERBERUS_REVIEW')! : mission.tasks[0]!
      task.status='CANCELLED'; task.completedAt=now; task.result={taskId:task.id,success:false,summary:'Cancelada antes de la ejecución',data:{cancelled:true},cerberusIds:[]}
      if (mission.context?.tags?.includes('dispatcher-v1')) for (const pending of mission.tasks) if (pending.status === 'QUEUED') pending.status='BLOCKED'
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
  /** Durable mirroring (see durable.ts): full image of the live database, and a monotonic change counter. */
  serialize(): Buffer { return this.db.transaction(() => this.db.serialize())() }   // one read transaction => consistent image incl. WAL content
  changeCount(): number { return (this.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n }
  close(): void { this.db.close() }
}
