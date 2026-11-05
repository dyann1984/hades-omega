import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { cerberusRoutes } from './cerberus.js'
import { localMissionRoutes } from './local-missions.js'

describe('Enterprise Readiness: Audit Blockchain & Multi-agent Resilience', () => {
  it('builds a cryptographically chained audit log and verifies tampering detection', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-resilience-'))
    const db = join(dir, 'data.sqlite')
    const legacy = join(dir, 'none.json')
    const repo = new SqliteRepository(db, legacy)

    try {
      await repo.init()
      const admin = repo.createUser('admin', 'unused', 'ADMIN')

      // Registrar 5 eventos
      const e1 = repo.recordAuditEvent({ actor: admin, action: 'USER_LOGIN', result: 'SUCCESS' })
      const e2 = repo.recordAuditEvent({ actor: admin, action: 'MISSION_CREATED', result: 'CREATED' })
      const e3 = repo.recordAuditEvent({ actor: admin, action: 'APPROVAL_REQUESTED', result: 'PENDING' })
      const e4 = repo.recordAuditEvent({ actor: admin, action: 'APPROVAL_GRANTED', result: 'APPROVED' })
      const e5 = repo.recordAuditEvent({ actor: admin, action: 'MISSION_EXECUTED', result: 'SUCCESS' })

      // Since init() records POLICY_ACTIVE, the first event written here chains to it, not to GENESIS (verifyAuditIntegrity checks the genesis link).
      expect(e1.prevHash).toMatch(/^[0-9a-f]{64}$/)
      expect(e2.prevHash).toBe(e1.hash)
      expect(e3.prevHash).toBe(e2.hash)
      expect(e4.prevHash).toBe(e3.hash)
      expect(e5.prevHash).toBe(e4.hash)

      // Verificar integridad inicial (cadena válida)
      const check1 = repo.verifyAuditIntegrity()
      expect(check1.verified).toBe(true)
      expect(check1.totalEvents).toBeGreaterThanOrEqual(5)
      expect(check1.error).toBeNull()

      // Simular intento de manipulación maliciosa de un registro en la base de datos
      const rawDb = (repo as any).db
      rawDb.prepare("UPDATE audit_events SET result='TAMPERED_MALICIOUS' WHERE id=?").run(e3.id)

      // Verificar que la cadena detecta la manipulación
      const checkTampered = repo.verifyAuditIntegrity()
      expect(checkTampered.verified).toBe(false)
      expect(checkTampered.brokenAtId).toBe(e3.id)
      expect(checkTampered.error).toContain('Hash alterado')
    } finally {
      repo.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('handles concurrent mission requests and prevents duplicate execution', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hades-concurrency-'))
    const db = join(dir, 'data.sqlite')
    const legacy = join(dir, 'none.json')
    const repo = new SqliteRepository(db, legacy)

    try {
      await repo.init()
      const op = repo.createUser('operator', 'unused', 'OPERATOR')
      const admin = repo.createUser('admin', 'unused', 'ADMIN')

      // Lanzar 5 misiones en paralelo
      const promises = Array.from({ length: 5 }, (_, i) =>
        repo.createLocalMission(op, `Misión Concurrente ${i}`, `Entrada ${i}`)
      )
      const results = await Promise.all(promises)
      expect(results).toHaveLength(5)

      // Resolver aprobaciones en paralelo
      const approvals = await Promise.all(
        results.map(r => repo.decideLocalOperation(r.approvalId, 'APPROVED', admin, 'Aprobación masiva concurrente'))
      )
      expect(approvals).toHaveLength(5)
      expect(approvals.every(m => m.status === 'COMPLETED')).toBe(true)

      // Intentar resolver la misma aprobación dos veces (debe fallar con error APPROVAL_ALREADY_RESOLVED)
      await expect(
        repo.decideLocalOperation(results[0]!.approvalId, 'APPROVED', admin, 'Doble resolución')
      ).rejects.toThrow('APPROVAL_ALREADY_RESOLVED')
    } finally {
      repo.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
