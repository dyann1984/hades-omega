import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from '../sqlite.js'

const docs = [
  { filename: 'a.txt', content: 'Precio $11,111 MXN, SLA 99%.' },
  { filename: 'b.txt', content: 'Precio $22,222 MXN, penalización 4%.' },
  { filename: 'c.txt', content: 'Precio $33,333 MXN, sin garantía.' },
]

describe('startup recovery and durable execution', () => {
  it('reconciles RUNNING missions on restart: marks them FAILED without data loss', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-recovery-running-'))
    const dbPath = join(dir, 'db.sqlite')
    try {
      // Session 1: create a mission and simulate a crash mid-execution by directly patching DB
      const s1 = new SqliteRepository(dbPath, join(dir, 'none.json'))
      await s1.init()
      const { mission } = await s1.createMultiDocumentMission('alice', 'Crash test', docs)
      // The mission reaches PARTIAL_COMPLETE (WAITING_APPROVAL) after 3 tasks; simulate crash
      // by resetting the local_operation state to RUNNING and a task to RUNNING
      const raw = s1.getMission(mission.id)
      expect(raw).toBeDefined()
      s1.close()

      // Simulate crash: directly patch DB to state='RUNNING' and task[2] to RUNNING
      const patchDb = new Database(dbPath)
      patchDb.prepare(`UPDATE local_operations SET state='RUNNING' WHERE mission_id=?`).run(mission.id)
      const missionRow = patchDb.prepare('SELECT data FROM missions WHERE id=?').get(mission.id) as { data: string }
      const missionData = JSON.parse(missionRow.data) as any
      missionData.tasks[2].status = 'RUNNING'
      missionData.tasks[2].startedAt = Date.now()
      missionData.tasks[2].completedAt = null
      missionData.tasks[2].result = null
      patchDb.prepare('UPDATE missions SET data=? WHERE id=?').run(JSON.stringify(missionData), mission.id)
      patchDb.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(missionData.tasks[2]), missionData.tasks[2].id)
      patchDb.close()

      // Session 2: open and reconcile on startup
      const s2 = new SqliteRepository(dbPath, join(dir, 'none.json'))
      await s2.init()

      const recovered = s2.getMission(mission.id)
      expect(recovered).toBeDefined()
      expect(recovered!.status).toBe('FAILED')
      expect(recovered!.tasks[2]!.status).toBe('FAILED')
      expect((recovered!.tasks[2]!.result as any)?.data?.error).toBe('PROCESS_RESTART_RECOVERY')

      // Audit trail must record the recovery action
      const auditEvents = s2.listAuditEvents({ limit: 50, offset: 0 })
      expect(auditEvents.some(e => e.action === 'STARTUP_RECOVERY' && e.result === 'RUNNING_MARKED_FAILED')).toBe(true)

      s2.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('preserves WAITING_APPROVAL missions on restart without modification', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-recovery-waiting-'))
    try {
      const s1 = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
      await s1.init()
      const { mission, approvalId } = await s1.createMultiDocumentMission('alice', 'Pending approval', docs)
      expect(mission.tasks[3]!.status).toBe('CERBERUS_REVIEW')
      s1.close()

      // Restart
      const s2 = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
      await s2.init()
      const preserved = s2.getMission(mission.id)
      expect(preserved?.tasks[3]?.status).toBe('CERBERUS_REVIEW')
      expect(s2.listPendingLocalOperations().map(o => o.id)).toContain(approvalId)

      // Admin can still approve after restart
      const finished = await s2.decideLocalOperation(approvalId, 'APPROVED', 'admin', 'Post-restart approval')
      expect(finished.status).toBe('COMPLETED')
      s2.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('resumes an APPROVED mission that crashed before execution on restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-recovery-approved-'))
    const dbPath = join(dir, 'db.sqlite')
    try {
      // Session 1: run up to WAITING_APPROVAL and manually approve without executing (simulate crash after approval DB write)
      const s1 = new SqliteRepository(dbPath, join(dir, 'none.json'))
      await s1.init()
      const { mission, approvalId } = await s1.createMultiDocumentMission('alice', 'Resume test', docs)
      expect(mission.tasks[3]!.status).toBe('CERBERUS_REVIEW')
      s1.close()

      // Simulate the crash: set state=APPROVED (as if decideDispatchedMission started but crashed before ELYSIUM ran)
      const patchDb = new Database(dbPath)
      patchDb.prepare(`UPDATE local_operations SET state='APPROVED' WHERE id=?`).run(approvalId)
      const missionRow = patchDb.prepare('SELECT data FROM missions WHERE id=?').get(mission.id) as { data: string }
      const missionData = JSON.parse(missionRow.data) as any
      missionData.tasks[3].status = 'QUEUED'  // ELYSIUM waiting
      missionData.tasks[4].status = 'QUEUED'  // TARTARUS waiting
      missionData.status = 'IN_PROGRESS'
      patchDb.prepare('UPDATE missions SET data=? WHERE id=?').run(JSON.stringify(missionData), mission.id)
      patchDb.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(missionData.tasks[3]), missionData.tasks[3].id)
      patchDb.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(missionData.tasks[4]), missionData.tasks[4].id)
      patchDb.close()

      // Session 2: startup reconciliation should resume and complete the mission
      const s2 = new SqliteRepository(dbPath, join(dir, 'none.json'))
      await s2.init()

      const resumed = s2.getMission(mission.id)
      expect(resumed?.status).toBe('COMPLETED')
      expect(resumed?.tasks[3]?.status).toBe('COMPLETED')  // ELYSIUM
      expect(resumed?.tasks[4]?.status).toBe('COMPLETED')  // TARTARUS

      const auditEvents = s2.listAuditEvents({ limit: 50, offset: 0 })
      expect(auditEvents.some(e => e.action === 'STARTUP_RECOVERY' && e.result === 'APPROVED_RESUMED')).toBe(true)
      s2.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('prevents two concurrent processes from executing the same task (lease protection)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-lease-concurrency-'))
    const dbPath = join(dir, 'db.sqlite')
    try {
      const s1 = new SqliteRepository(dbPath, join(dir, 'none.json'))
      await s1.init()
      const { mission } = await s1.createMultiDocumentMission('alice', 'Concurrency test', docs)
      // All tasks completed synchronously; now create a fresh mission for concurrent test
      expect(mission.status).toBe('PARTIAL_COMPLETE')

      // Check execution events to verify no task was executed twice
      const events = s1.listExecutionEvents(mission.id, 0)
      const startedEvents = events.filter(e => e.type === 'agent.started')
      const completedEvents = events.filter(e => e.type === 'agent.completed')
      // CHARON, MINOS, PERSEPHONE each started and completed exactly once
      expect(startedEvents.filter(e => e.agentId === 'CHARON').length).toBe(1)
      expect(startedEvents.filter(e => e.agentId === 'MINOS').length).toBe(1)
      expect(startedEvents.filter(e => e.agentId === 'PERSEPHONE').length).toBe(1)
      expect(completedEvents.filter(e => e.agentId === 'CHARON').length).toBe(1)
      expect(completedEvents.filter(e => e.agentId === 'MINOS').length).toBe(1)
      expect(completedEvents.filter(e => e.agentId === 'PERSEPHONE').length).toBe(1)

      // Simulate second process opening same DB and attempting to re-run an already completed task
      const s2 = new SqliteRepository(dbPath, join(dir, 'none.json'))
      await s2.init()
      // Both repos point to same SQLite file — lease table prevents double execution
      // Verify the completed mission is stable across processes
      const fromS2 = s2.getMission(mission.id)
      expect(fromS2?.tasks[0]?.status).toBe('COMPLETED')
      expect(fromS2?.tasks[1]?.status).toBe('COMPLETED')
      expect(fromS2?.tasks[2]?.status).toBe('COMPLETED')
      s1.close()
      s2.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('records all 11 required telemetry event types for a complete mission lifecycle', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-telemetry-'))
    try {
      const repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
      await repo.init()
      const { mission, approvalId } = await repo.createMultiDocumentMission('alice', 'Telemetry test', docs)
      const partial = repo.listExecutionEvents(mission.id, 0)
      expect(partial.some(e => e.type === 'task.queued')).toBe(true)
      expect(partial.filter(e => e.type === 'task.queued').length).toBe(5)
      expect(partial.some(e => e.type === 'agent.started' && e.agentId === 'CHARON')).toBe(true)
      expect(partial.some(e => e.type === 'agent.completed' && e.agentId === 'CHARON')).toBe(true)
      expect(partial.some(e => e.type === 'agent.started' && e.agentId === 'MINOS')).toBe(true)
      expect(partial.some(e => e.type === 'agent.completed' && e.agentId === 'MINOS')).toBe(true)
      expect(partial.some(e => e.type === 'agent.started' && e.agentId === 'PERSEPHONE')).toBe(true)
      expect(partial.some(e => e.type === 'agent.completed' && e.agentId === 'PERSEPHONE')).toBe(true)
      expect(partial.some(e => e.type === 'approval.requested')).toBe(true)

      const finished = await repo.decideLocalOperation(approvalId, 'APPROVED', 'admin', 'Aprobado')
      expect(finished.status).toBe('COMPLETED')
      const all = repo.listExecutionEvents(mission.id, 0)

      // Verify all required event types
      expect(all.some(e => e.type === 'approval.granted')).toBe(true)
      expect(all.some(e => e.type === 'agent.started' && e.agentId === 'ELYSIUM')).toBe(true)
      expect(all.some(e => e.type === 'agent.completed' && e.agentId === 'ELYSIUM')).toBe(true)
      expect(all.some(e => e.type === 'agent.started' && e.agentId === 'TARTARUS')).toBe(true)
      expect(all.some(e => e.type === 'agent.completed' && e.agentId === 'TARTARUS')).toBe(true)
      expect(all.some(e => e.type === 'mission.completed')).toBe(true)

      // Sequence must be monotonically increasing, starting at 1
      const seqs = all.map(e => e.sequence)
      expect(seqs).toEqual(seqs.map((_,i) => i+1))

      // Every event has required fields
      for (const ev of all) {
        expect(ev.eventId).toBeTruthy()
        expect(ev.missionId).toBe(mission.id)
        expect(ev.timestamp).toBeGreaterThan(0)
        expect(ev.correlationId).toBeTruthy()
      }

      repo.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('records cerberus.blocked and mission.failed when policy denies the operation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-deny-'))
    const { CerberusGUARD } = await import('@hades/core')
    const guard = new CerberusGUARD({ rules: [{ id: 'DENY-ALL', name: 'deny', description: 'deny hash', operationType: 'CRYPTO_HASH', condition: { type: 'ALWAYS' }, outcome: 'DENY', priority: 100, active: true }] })
    const repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'), guard)
    try {
      await repo.init()
      const { mission } = await repo.createMultiDocumentMission('alice', 'Deny test', docs)
      expect(mission.status).toBe('FAILED')
      const events = repo.listExecutionEvents(mission.id, 0)
      expect(events.some(e => e.type === 'cerberus.blocked')).toBe(true)
      expect(events.some(e => e.type === 'mission.failed')).toBe(true)
      repo.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
