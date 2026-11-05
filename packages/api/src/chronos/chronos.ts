import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import type { SqliteRepository } from '../sqlite.js'
import { nextCronRun, parseCron } from './cron.js'

export type TaskStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED'
export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'RETRYING' | 'INTERRUPTED'

export interface ChronosTask {
  id: string; title: string; description: string; kind: string; params: Record<string, unknown>; cron: string
  status: TaskStatus; maxAttempts: number; createdBy: string; createdAt: number
  nextRunAt: number | null; lastRunAt: number | null; missionId: string | null; agent: string | null
}
export interface ChronosRun {
  id: string; taskId: string; scheduledFor: number; trigger: 'SCHEDULE' | 'MANUAL'; status: RunStatus
  attempt: number; startedAt: number | null; finishedAt: number | null; retryAt: number | null
  result: unknown; error: string | null
}

interface JobContext { repository: SqliteRepository; now: number; params: Record<string, unknown> }
interface JobDefinition {
  description: string
  /** Only READ_ONLY jobs may be registered: CHRONOS never performs external effects by itself. */
  effect: 'READ_ONLY'
  /** Idempotent jobs are the only ones eligible for automatic retry. */
  idempotent: true
  agent: string
  /** CERBERUS tool id. Effect class, permissions and limits come from the tool registry, not from this file. */
  tool: string
  validate(params: Record<string, unknown>): Record<string, unknown>
  run(ctx: JobContext): unknown
}

function intParam(params: Record<string, unknown>, key: string, def: number, min: number, max: number): number {
  const v = params[key] ?? def
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(`${key} must be an integer between ${min} and ${max}`)
  return v
}

/** Registered job kinds. Anything not listed here is denied (default-deny). */
export const JOB_REGISTRY: Record<string, JobDefinition> = {
  AUDIT_CHAIN_VERIFY: {
    description: 'Recomputes the SHA-256 audit hash chain and reports whether it is intact.',
    effect: 'READ_ONLY', idempotent: true, agent: 'CERBERUS', tool: 'chronos.audit_chain_verify',
    validate: params => { if (Object.keys(params).length) throw new Error('AUDIT_CHAIN_VERIFY takes no parameters'); return {} },
    run: ({ repository }) => repository.verifyAuditIntegrity(),
  },
  CERBERUS_DECISION_REPORT: {
    description: 'Counts CERBERUS policy decisions recorded in the audit log over a time window.',
    effect: 'READ_ONLY', idempotent: true, agent: 'CERBERUS', tool: 'chronos.cerberus_decision_report',
    validate: params => ({ windowHours: intParam(params, 'windowHours', 24, 1, 720) }),
    run: ({ repository, now, params }) => {
      const since = now - (params['windowHours'] as number) * 3_600_000
      const events = repository.listAuditEvents({ action: 'POLICY_EVALUATED', limit: 5000, offset: 0 }).filter(e => e.timestamp >= since)
      const byDecision: Record<string, number> = {}
      for (const e of events) byDecision[e.result] = (byDecision[e.result] ?? 0) + 1
      return { windowHours: params['windowHours'], since, total: events.length, byDecision, truncated: events.length >= 5000 }
    },
  },
  APPROVALS_DIGEST: {
    description: 'Summarizes recorded human approval decisions by status.',
    effect: 'READ_ONLY', idempotent: true, agent: 'HADES', tool: 'chronos.approvals_digest',
    validate: params => { if (Object.keys(params).length) throw new Error('APPROVALS_DIGEST takes no parameters'); return {} },
    run: ({ repository }) => {
      const approvals = repository.listApprovals()
      return { total: approvals.length, approved: approvals.filter(a => a.status === 'APPROVED').length, rejected: approvals.filter(a => a.status === 'REJECTED').length }
    },
  },
  MISSION_FOLLOWUP: {
    description: 'Re-checks a finished audit mission: stored report hash still matches, audit chain intact, state of the NEAR audit plan. Reads only.',
    effect: 'READ_ONLY', idempotent: true, agent: 'HADES', tool: 'chronos.mission_followup',
    validate: params => {
      const keys = Object.keys(params)
      if (keys.length !== 1 || keys[0] !== 'missionId' || typeof params['missionId'] !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(params['missionId'])) throw new Error('MISSION_FOLLOWUP requires exactly { missionId }')
      return { missionId: params['missionId'] }
    },
    run: ({ repository, params, now }) => {
      const id = params['missionId'] as string, mission = repository.getMission(id), evidence = repository.getMissionEvidence(id)
      return {
        missionId: id, checkedAt: now, missionStatus: mission?.status ?? 'MISSING', evidenceRecorded: !!evidence,
        evidenceIntact: evidence ? createHash('sha256').update(evidence.reportMarkdown, 'utf8').digest('hex') === evidence.reportSha256 : null,
        auditChainVerified: repository.verifyAuditIntegrity().verified, nearAuditState: evidence?.nearState ?? null,
      }
    },
  },
}

class CerberusDenied extends Error { constructor(readonly code: string, message: string) { super(message) } }

export class ChronosError extends Error {
  constructor(readonly code: 'VALIDATION_ERROR' | 'UNREGISTERED_JOB_KIND' | 'NOT_FOUND' | 'INVALID_STATE', message: string) { super(message) }
}

type TaskRow = { id: string; title: string; description: string; kind: string; params: string; cron: string; status: TaskStatus; max_attempts: number; created_by: string; created_at: number; next_run_at: number | null; last_run_at: number | null; mission_id: string | null; agent: string | null }
type RunRow = { id: string; task_id: string; scheduled_for: number; trigger: 'SCHEDULE' | 'MANUAL'; status: RunStatus; attempt: number; started_at: number | null; finished_at: number | null; retry_at: number | null; result: string | null; error: string | null }

const toTask = (r: TaskRow): ChronosTask => ({ id: r.id, title: r.title, description: r.description, kind: r.kind, params: JSON.parse(r.params), cron: r.cron, status: r.status, maxAttempts: r.max_attempts, createdBy: r.created_by, createdAt: r.created_at, nextRunAt: r.next_run_at, lastRunAt: r.last_run_at, missionId: r.mission_id, agent: r.agent })
const toRun = (r: RunRow): ChronosRun => ({ id: r.id, taskId: r.task_id, scheduledFor: r.scheduled_for, trigger: r.trigger, status: r.status, attempt: r.attempt, startedAt: r.started_at, finishedAt: r.finished_at, retryAt: r.retry_at, result: r.result === null ? null : JSON.parse(r.result), error: r.error })

export const CHRONOS_MIGRATION_SQL = `
  CREATE TABLE chronos_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, params TEXT NOT NULL DEFAULT '{}', cron TEXT NOT NULL, status TEXT NOT NULL, max_attempts INTEGER NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, next_run_at INTEGER, last_run_at INTEGER, mission_id TEXT, agent TEXT);
  CREATE INDEX chronos_tasks_due ON chronos_tasks(status, next_run_at);
  CREATE TABLE chronos_runs (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES chronos_tasks(id), scheduled_for INTEGER NOT NULL, trigger TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, started_at INTEGER, finished_at INTEGER, retry_at INTEGER, result TEXT, error TEXT);
  CREATE UNIQUE INDEX chronos_runs_slot ON chronos_runs(task_id, scheduled_for) WHERE trigger = 'SCHEDULE';
  CREATE INDEX chronos_runs_task ON chronos_runs(task_id, scheduled_for DESC);`

const BACKOFF_MS = [30_000, 120_000, 600_000]

export class ChronosService {
  private timer: NodeJS.Timeout | undefined
  constructor(private readonly db: Database.Database, private readonly repository: SqliteRepository, private readonly clock: () => number = Date.now) {}

  private audit(actor: string, action: string, result: string, correlationId: string): void {
    this.repository.recordAuditEvent({ actor, action, result, correlationId })
  }

  create(input: { title?: unknown; description?: unknown; kind?: unknown; params?: unknown; cron?: unknown; maxAttempts?: unknown; missionId?: unknown }, actor: string): ChronosTask {
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    if (title.length < 3 || title.length > 120) throw new ChronosError('VALIDATION_ERROR', 'title must be 3-120 characters')
    const description = input.description === undefined ? '' : input.description
    if (typeof description !== 'string' || description.length > 1000) throw new ChronosError('VALIDATION_ERROR', 'description must be a string up to 1000 characters')
    const job = typeof input.kind === 'string' && Object.hasOwn(JOB_REGISTRY, input.kind) ? JOB_REGISTRY[input.kind]! : undefined
    if (!job) throw new ChronosError('UNREGISTERED_JOB_KIND', 'kind is not a registered CHRONOS job; unknown operations are denied')
    const rawParams = input.params ?? {}
    if (typeof rawParams !== 'object' || rawParams === null || Array.isArray(rawParams)) throw new ChronosError('VALIDATION_ERROR', 'params must be an object')
    // Scheduled automation may only drive tools CERBERUS classifies as READ; anything else needs a human-approved flow.
    if (this.repository.gate.tools.get(job.tool)?.effect !== 'READ') throw new ChronosError('UNREGISTERED_JOB_KIND', 'job is not backed by a READ tool; scheduled automation cannot trigger sensitive effects')
    let params: Record<string, unknown>
    try { params = job.validate(rawParams as Record<string, unknown>) } catch (e) { throw new ChronosError('VALIDATION_ERROR', (e as Error).message) }
    if (typeof input.cron !== 'string') throw new ChronosError('VALIDATION_ERROR', 'cron is required')
    try { parseCron(input.cron) } catch (e) { throw new ChronosError('VALIDATION_ERROR', (e as Error).message) }
    const maxAttempts = input.maxAttempts === undefined ? 3 : input.maxAttempts
    if (typeof maxAttempts !== 'number' || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new ChronosError('VALIDATION_ERROR', 'maxAttempts must be an integer 1-5')
    const missionId = input.missionId === undefined || input.missionId === null ? null : input.missionId
    if (missionId !== null && (typeof missionId !== 'string' || missionId.length > 100)) throw new ChronosError('VALIDATION_ERROR', 'missionId must be a string')
    const now = this.clock(), id = randomUUID()
    const next = nextCronRun(input.cron, now)
    if (next === null) throw new ChronosError('VALIDATION_ERROR', 'cron never fires')
    this.db.prepare('INSERT INTO chronos_tasks (id,title,description,kind,params,cron,status,max_attempts,created_by,created_at,next_run_at,mission_id,agent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, title, description, input.kind, JSON.stringify(params), input.cron.trim(), 'ACTIVE', maxAttempts, actor, now, next, missionId, job.agent)
    this.audit(actor, 'CHRONOS_TASK_CREATED', `${input.kind}:${id}`, id)
    return this.get(id)
  }

  get(id: string): ChronosTask {
    const row = this.db.prepare('SELECT * FROM chronos_tasks WHERE id = ?').get(id) as TaskRow | undefined
    if (!row) throw new ChronosError('NOT_FOUND', 'task not found')
    return toTask(row)
  }
  list(): ChronosTask[] { return (this.db.prepare('SELECT * FROM chronos_tasks ORDER BY created_at DESC, rowid DESC').all() as TaskRow[]).map(toTask) }
  runs(taskId?: string, limit = 50): ChronosRun[] {
    const rows = taskId
      ? this.db.prepare('SELECT * FROM chronos_runs WHERE task_id = ? ORDER BY COALESCE(started_at, scheduled_for) DESC, rowid DESC LIMIT ?').all(taskId, limit)
      : this.db.prepare('SELECT * FROM chronos_runs ORDER BY COALESCE(started_at, scheduled_for) DESC, rowid DESC LIMIT ?').all(limit)
    return (rows as RunRow[]).map(toRun)
  }

  pause(id: string, actor: string): ChronosTask {
    const task = this.get(id)
    if (task.status !== 'ACTIVE') throw new ChronosError('INVALID_STATE', `cannot pause a ${task.status} task`)
    this.db.prepare("UPDATE chronos_tasks SET status = 'PAUSED' WHERE id = ?").run(id)
    this.audit(actor, 'CHRONOS_TASK_PAUSED', id, id)
    return this.get(id)
  }
  resume(id: string, actor: string): ChronosTask {
    const task = this.get(id)
    if (task.status !== 'PAUSED') throw new ChronosError('INVALID_STATE', `cannot resume a ${task.status} task`)
    // Skipped slots while paused are not replayed: scheduling restarts from now.
    this.db.prepare("UPDATE chronos_tasks SET status = 'ACTIVE', next_run_at = ? WHERE id = ?").run(nextCronRun(task.cron, this.clock()), id)
    this.audit(actor, 'CHRONOS_TASK_RESUMED', id, id)
    return this.get(id)
  }
  cancel(id: string, actor: string): ChronosTask {
    const task = this.get(id)
    if (task.status === 'CANCELLED') throw new ChronosError('INVALID_STATE', 'task already cancelled')
    this.db.transaction(() => {
      this.db.prepare("UPDATE chronos_tasks SET status = 'CANCELLED', next_run_at = NULL WHERE id = ?").run(id)
      this.db.prepare("UPDATE chronos_runs SET status = 'FAILED', error = 'CANCELLED', finished_at = ?, retry_at = NULL WHERE task_id = ? AND status = 'RETRYING'").run(this.clock(), id)
    })()
    this.audit(actor, 'CHRONOS_TASK_CANCELLED', id, id)
    return this.get(id)
  }

  /** Immediate execution on explicit request. Runs even if the task is paused, never if cancelled. */
  runNow(id: string, actor: string): ChronosRun {
    const task = this.get(id)
    if (task.status === 'CANCELLED') throw new ChronosError('INVALID_STATE', 'cannot run a cancelled task')
    const now = this.clock(), runId = randomUUID()
    // Inserted as RETRYING with retry_at=now so a crash before execute() is picked up by the next tick.
    this.db.prepare("INSERT INTO chronos_runs (id,task_id,scheduled_for,trigger,status,attempt,retry_at) VALUES (?,?,?,'MANUAL','RETRYING',0,?)").run(runId, id, now, now)
    this.audit(actor, 'CHRONOS_RUN_REQUESTED', id, runId)
    const run = this.execute(runId, false)
    if (!run) throw new ChronosError('INVALID_STATE', 'run could not be claimed')
    return run
  }

  /** Executes (or re-executes) one run row. Jobs are synchronous and local, so a run is never left half-claimed. */
  private execute(runId: string, requireActive: boolean): ChronosRun | null {
    const startedAt = this.clock()
    const claim = this.db.prepare("UPDATE chronos_runs SET status = 'RUNNING', attempt = attempt + 1, started_at = COALESCE(started_at, ?), retry_at = NULL WHERE id = ? AND status = 'RETRYING' AND EXISTS (SELECT 1 FROM chronos_tasks t WHERE t.id = chronos_runs.task_id AND t.status != 'CANCELLED' AND (? = 0 OR t.status = 'ACTIVE'))").run(startedAt, runId, requireActive ? 1 : 0)
    if (claim.changes !== 1) return null
    const run = toRun(this.db.prepare('SELECT * FROM chronos_runs WHERE id = ?').get(runId) as RunRow)
    const task = this.get(run.taskId)
    const job = Object.hasOwn(JOB_REGISTRY, task.kind) ? JOB_REGISTRY[task.kind]! : undefined
    const attempt = run.attempt
    try {
      if (!job) throw new Error('job kind is no longer registered')
      // Mandatory CERBERUS check on every run, so a task created earlier cannot outlive a policy change or emergency stop.
      const verdict = this.repository.gate.authorize({ tool: job.tool, agent: job.agent, role: 'SYSTEM', source: 'CHRONOS', params: task.params, actor: `chronos:${task.id}`, correlationId: runId })
      if (verdict.outcome !== 'PERMIT') throw new CerberusDenied(verdict.code, verdict.reason)
      const result = job.run({ repository: this.repository, now: startedAt, params: task.params })
      this.db.prepare("UPDATE chronos_runs SET status = 'SUCCEEDED', finished_at = ?, result = ?, error = NULL WHERE id = ?").run(this.clock(), JSON.stringify(result), runId)
      this.db.prepare('UPDATE chronos_tasks SET last_run_at = ? WHERE id = ?').run(startedAt, task.id)
      this.audit(`chronos:${task.agent ?? 'HADES'}`, 'CHRONOS_RUN', `SUCCEEDED:${task.kind}:${task.id}`, runId)
    } catch (e) {
      const message = (e instanceof CerberusDenied ? `CERBERUS_DENIED:${e.code}: ${e.message}` : (e as Error).message).slice(0, 500)
      // A CERBERUS denial is a decision, not a transient failure: never retried.
      const retry = !(e instanceof CerberusDenied) && !!job && job.idempotent && attempt < task.maxAttempts && task.status !== 'CANCELLED'
      if (retry) this.db.prepare("UPDATE chronos_runs SET status = 'RETRYING', error = ?, retry_at = ? WHERE id = ?").run(message, this.clock() + BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!, runId)
      else this.db.prepare("UPDATE chronos_runs SET status = 'FAILED', finished_at = ?, error = ? WHERE id = ?").run(this.clock(), message, runId)
      this.db.prepare('UPDATE chronos_tasks SET last_run_at = ? WHERE id = ?').run(startedAt, task.id)
      this.audit(`chronos:${task.agent ?? 'HADES'}`, 'CHRONOS_RUN', `${retry ? 'RETRYING' : 'FAILED'}:${task.kind}:${task.id}`, runId)
    }
    return toRun(this.db.prepare('SELECT * FROM chronos_runs WHERE id = ?').get(runId) as RunRow)
  }

  /** After a restart, runs left RUNNING were interrupted. Idempotent jobs are re-queued, others are failed. */
  recover(): number {
    const rows = this.db.prepare("SELECT r.id, r.attempt, t.max_attempts FROM chronos_runs r JOIN chronos_tasks t ON t.id = r.task_id WHERE r.status = 'RUNNING'").all() as Array<{ id: string; attempt: number; max_attempts: number }>
    for (const r of rows) {
      const requeue = r.attempt < r.max_attempts
      this.db.prepare('UPDATE chronos_runs SET status = ?, error = ?, retry_at = ?, finished_at = ? WHERE id = ?')
        .run(requeue ? 'RETRYING' : 'INTERRUPTED', 'interrupted by restart', requeue ? this.clock() : null, requeue ? null : this.clock(), r.id)
      this.audit('system:chronos-recovery', 'CHRONOS_RUN', `${requeue ? 'REQUEUED' : 'INTERRUPTED'}:${r.id}`, r.id)
    }
    return rows.length
  }

  /**
   * One scheduling pass. Safe to call concurrently or repeatedly: each (task, slot) is claimed through a unique index,
   * and slots missed during downtime are coalesced into a single catch-up run.
   */
  tick(): { started: number; retried: number; executed: ChronosRun[] } {
    const now = this.clock()
    const executed: ChronosRun[] = []
    let started = 0, retried = 0
    const due = this.db.prepare("SELECT * FROM chronos_tasks WHERE status = 'ACTIVE' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at").all(now) as TaskRow[]
    for (const row of due) {
      const runId = randomUUID()
      const claimed = this.db.transaction(() => {
        const moved = this.db.prepare("UPDATE chronos_tasks SET next_run_at = ? WHERE id = ? AND status = 'ACTIVE' AND next_run_at = ?").run(nextCronRun(row.cron, now), row.id, row.next_run_at)
        if (moved.changes !== 1) return false
        const ins = this.db.prepare("INSERT OR IGNORE INTO chronos_runs (id,task_id,scheduled_for,trigger,status,attempt,retry_at) VALUES (?,?,?,'SCHEDULE','RETRYING',0,?)").run(runId, row.id, row.next_run_at, now)
        return ins.changes === 1
      })()
      if (!claimed) continue
      const result = this.execute(runId, true)
      if (result) { started++; executed.push(result) }
    }
    const retries = this.db.prepare("SELECT r.id FROM chronos_runs r JOIN chronos_tasks t ON t.id = r.task_id WHERE r.status = 'RETRYING' AND r.retry_at IS NOT NULL AND r.retry_at <= ? AND t.status = 'ACTIVE'").all(now) as Array<{ id: string }>
    for (const r of retries) { const result = this.execute(r.id, true); if (result) { retried++; executed.push(result) } }
    // Requeued-by-recovery runs have retry_at set to now, so they flow through the retry path above.
    return { started, retried, executed }
  }

  start(intervalMs = 30_000): void {
    if (this.timer) return
    this.recover()
    this.timer = setInterval(() => { try { this.tick() } catch (e) { this.audit('system:chronos', 'CHRONOS_TICK_ERROR', (e as Error).message.slice(0, 200), randomUUID()) } }, intervalMs)
    this.timer.unref()
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined } }
  isRunning(): boolean { return this.timer !== undefined }
  /** Counts for the Vault view; derived only from persisted rows. */
  summary(): { tasks: Record<string, number>; runs: Record<string, number>; nextRunAt: number | null; lastFinishedAt: number | null } {
    const group = (sql: string): Record<string, number> => Object.fromEntries((this.db.prepare(sql).all() as Array<{ k: string; n: number }>).map(r => [r.k, r.n]))
    const next = this.db.prepare("SELECT MIN(next_run_at) AS t FROM chronos_tasks WHERE status = 'ACTIVE'").get() as { t: number | null }
    const last = this.db.prepare('SELECT MAX(finished_at) AS t FROM chronos_runs').get() as { t: number | null }
    return { tasks: group('SELECT status AS k, COUNT(*) AS n FROM chronos_tasks GROUP BY status'), runs: group('SELECT status AS k, COUNT(*) AS n FROM chronos_runs GROUP BY status'), nextRunAt: next.t, lastFinishedAt: last.t }
  }
}
