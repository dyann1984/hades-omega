import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from './sqlite.js'

describe('multi-document evidence', () => {
  it('uses supplied texts in the report and hashes the actual deliverable across restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-doc-evidence-'))
    const db = join(dir, 'data.sqlite'), legacy = join(dir, 'none.json')
    let repo = new SqliteRepository(db, legacy)
    try {
      await repo.init()
      const { mission, approvalId } = await repo.createMultiDocumentMission('owner', 'Prueba', [
        { filename: 'a.txt', content: 'Precio $11,111 MXN y SLA 97%.' },
        { filename: 'b.txt', content: 'Precio $22,222 MXN sin garantía.' },
        { filename: 'c.txt', content: 'Precio $33,333 MXN penalización 8%.' },
      ])
      const result = await repo.decideLocalOperation(approvalId, 'APPROVED', 'admin', 'Revisado')
      const report = result.tasks.find(t => t.capabilityId === 'cap:report:generate@1.0.0')!.result!.data as { reportMarkdown: string }
      const seal = result.tasks.find(t => t.assignedTo === 'TARTARUS')!.result!.data as { sha256: string }
      expect(report.reportMarkdown).toContain('$11,111')
      expect(report.reportMarkdown).toContain('$22,222')
      expect(report.reportMarkdown).toContain('$33,333')
      expect(report.reportMarkdown).not.toContain('9,800')
      expect(seal.sha256).toBe(createHash('sha256').update(report.reportMarkdown, 'utf8').digest('hex'))
      await expect(repo.decideLocalOperation(approvalId, 'APPROVED', 'admin', 'Repetido')).rejects.toThrow('APPROVAL_ALREADY_RESOLVED')
      repo.close(); repo = new SqliteRepository(db, legacy); await repo.init()
      expect(repo.getMission(mission.id)?.tasks.find(t => t.assignedTo === 'TARTARUS')?.result?.data).toEqual(seal)
    } finally { repo.close(); await rm(dir, { recursive: true, force: true }) }
  })
})
