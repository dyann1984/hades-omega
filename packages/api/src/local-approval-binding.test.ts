import Database from 'better-sqlite3'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from './sqlite.js'

const docs = [{ filename: 'a.txt', content: 'Precio $11,111 MXN, SLA 99%.' }, { filename: 'b.txt', content: 'Precio $22,222 MXN, penalización 4%.' }, { filename: 'c.txt', content: 'Precio $33,333 MXN, sin garantía.' }]
const open = async (dir: string) => { const r = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'none.json')); await r.init(); return r }

describe('local mission approvals are bound to the exact authorized input', () => {
  it('multi-document: altering the stored documents or comparison after the approval request blocks execution', async () => {
    for (const tamper of ['documents', 'comparison'] as const) {
      const dir = await mkdtemp(join(tmpdir(), 'hades-bind-'))
      try {
        const repo = await open(dir)
        const { mission, approvalId } = await repo.createMultiDocumentMission('alice', 'Bind', docs)
        repo.close()
        const raw = new Database(join(dir, 'h.sqlite'))
        const row = raw.prepare('SELECT data FROM missions WHERE id=?').get(mission.id) as { data: string }
        const data = JSON.parse(row.data)
        if (tamper === 'documents') data.context.documents[1].content = 'Precio $999,999,999 MXN'
        else data.tasks[2].result.data.values[0].amounts = [{ text: '$1', value: 1 }]
        raw.prepare('UPDATE missions SET data=? WHERE id=?').run(JSON.stringify(data), mission.id)
        raw.close()
        const again = await open(dir)
        await expect(again.decideLocalOperation(approvalId, 'APPROVED', 'admin', 'revisado')).rejects.toThrow('APPROVAL_BINDING_MISMATCH')
        expect(again.getLocalOperationState(mission.id)).toBe('WAITING_APPROVAL') // nothing executed, still decidable
        expect(again.getMission(mission.id)?.tasks[4]?.status).not.toBe('COMPLETED')
        expect(again.listAuditEvents({ limit: 100, offset: 0 }).some(e => e.action === 'APPROVAL_BINDING_MISMATCH')).toBe(true)
        await expect(again.decideLocalOperation(approvalId, 'REJECTED', 'admin', 'manipulado')).resolves.toBeDefined() // rejecting is always possible
        again.close()
      } finally { await rm(dir, { recursive: true, force: true }) }
    }
  })

  it('multi-document: an unmodified mission still executes after approval (no false positives, survives restart)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-bind-ok-'))
    try {
      let repo = await open(dir)
      const { mission, approvalId } = await repo.createMultiDocumentMission('alice', 'Bind ok', docs)
      repo.close(); repo = await open(dir)
      const done = await repo.decideLocalOperation(approvalId, 'APPROVED', 'admin', 'revisado')
      expect(done.status).toBe('COMPLETED'); expect(mission.id).toBe(done.id)
      repo.close()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('startup recovery refuses to resume an APPROVED mission whose bound input changed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-bind-resume-'))
    try {
      const repo = await open(dir)
      const { mission, approvalId } = await repo.createMultiDocumentMission('alice', 'Bind resume', docs)
      repo.close()
      const raw = new Database(join(dir, 'h.sqlite'))
      raw.prepare("UPDATE local_operations SET state='APPROVED' WHERE id=?").run(approvalId)
      const data = JSON.parse((raw.prepare('SELECT data FROM missions WHERE id=?').get(mission.id) as { data: string }).data)
      data.tasks[3].status = 'QUEUED'; data.tasks[4].status = 'QUEUED'; data.status = 'IN_PROGRESS'
      data.context.documents[0].content = 'Precio $1 MXN'
      raw.prepare('UPDATE missions SET data=? WHERE id=?').run(JSON.stringify(data), mission.id)
      for (const i of [3, 4]) raw.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(data.tasks[i]), data.tasks[i].id)
      raw.close()
      const again = await open(dir)
      expect(again.getMission(mission.id)?.status).not.toBe('COMPLETED')
      expect(again.getLocalOperationState(mission.id)).toBe('FAILED')
      expect(again.listAuditEvents({ limit: 100, offset: 0 }).some(e => e.action === 'APPROVAL_BINDING_MISMATCH')).toBe(true)
      again.close()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('legacy SHA-256 mission: altering the stored input after the request blocks execution', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-bind-legacy-'))
    try {
      const repo = await open(dir)
      const { mission, approvalId } = await repo.createLocalMission('alice', 'Hash', 'texto autorizado')
      repo.close()
      const raw = new Database(join(dir, 'h.sqlite')); raw.prepare('UPDATE local_operations SET input=? WHERE id=?').run('texto distinto', approvalId); raw.close()
      const again = await open(dir)
      await expect(again.decideLocalOperation(approvalId, 'APPROVED', 'admin', 'revisado')).rejects.toThrow('APPROVAL_BINDING_MISMATCH')
      expect(again.getLocalOperationState(mission.id)).toBe('WAITING_APPROVAL')
      again.close()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('operations created before the binding existed (no stored hash) keep working', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-bind-old-'))
    try {
      const repo = await open(dir)
      const { approvalId } = await repo.createLocalMission('alice', 'Hash', 'texto')
      repo.close()
      const raw = new Database(join(dir, 'h.sqlite')); raw.prepare('UPDATE local_operations SET bound_hash=NULL WHERE id=?').run(approvalId); raw.close()
      const again = await open(dir)
      expect((await again.decideLocalOperation(approvalId, 'APPROVED', 'admin', 'revisado')).status).toBe('COMPLETED')
      again.close()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
