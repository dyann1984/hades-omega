import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonRepository } from './persistence.js'

describe('JsonRepository', () => {
  it('survives reinitialization and serializes concurrent approval decisions', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.hades-store-'))
    const file = join(directory, 'hades.json')
    try {
      const first = new JsonRepository(file)
      await first.init()
      await first.saveMission({ id: 'mission', tasks: [{ id: 'task', status: 'CERBERUS_REVIEW', result: { data: { escalationId: 'esc-1' } } }] } as any)
      await expect(first.decideApproval({ escalationId: 'unknown', status: 'APPROVED', justification: 'Reviewed', decidedBy: 'admin' })).rejects.toThrow('ESCALATION_NOT_FOUND')
      const results = await Promise.allSettled([
        first.decideApproval({ escalationId: 'esc-1', status: 'APPROVED', justification: 'Presupuesto verificado', decidedBy: 'operator-a' }),
        first.decideApproval({ escalationId: 'esc-1', status: 'REJECTED', justification: 'Decisión duplicada', decidedBy: 'operator-b' }),
      ])
      expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
      const restarted = new JsonRepository(file)
      await restarted.init()
      expect(restarted.listApprovals()).toHaveLength(1)
      expect(restarted.listApprovals()[0].executionAuthorized).toBe(false)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
