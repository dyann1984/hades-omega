import Fastify from 'fastify'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NEARBridge } from '@hades/core'
import { utils } from 'near-api-js'
import { SqliteRepository } from './sqlite.js'
import { registerSecurity } from './security.js'
import { AuditFlowError, AuditFlowService } from './audit-flow.js'
import { auditFlowRoutes } from './routes/audit-flow.js'
import { NearSigner } from './near/signer.js'
import type { NearRpc } from './near/rpc.js'

const DOCS = [
  { filename: 'contrato-a.txt', content: 'Contrato A. Monto total 120,000 MXN. Penalización 5%.' },
  { filename: 'cotizacion-b.txt', content: 'Cotización B. Monto 98,500 MXN. Plazo 30 días.' },
]
const neverNetwork: NearRpc = {
  chainId: async () => { throw new Error('no network in audit-flow tests') }, latestHeight: async () => { throw new Error('no network') }, finalBlock: async () => { throw new Error('no network') },
  viewAccount: async () => { throw new Error('no network') }, viewAccessKey: async () => { throw new Error('no network') }, viewFunction: async () => { throw new Error('no network') },
  broadcast: async () => { throw new Error('the audit flow must never broadcast') }, txStatus: async () => { throw new Error('no network') },
}
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

describe('enterprise audit flow (real persistent pipeline)', () => {
  let dir: string, repo: SqliteRepository
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'audit-flow-')); repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init() })
  afterEach(async () => { repo.close(); await rm(dir, { recursive: true, force: true }) })

  const flowWith = (configured: boolean) => {
    const signer = configured ? new NearSigner('hades-ops.testnet', utils.KeyPair.fromRandom('ed25519').toString()) : null
    const near = repo.createNearSubmissionService({ bridge: new NEARBridge(), rpc: neverNetwork, signer, config: { enabled: false, contractId: configured ? 'audit.hades-ops.testnet' : null, minBalanceYocto: 1n } })
    return { flow: new AuditFlowService(repo, near), near }
  }
  const stage = (v: ReturnType<AuditFlowService['view']>, id: string) => v.stages.find(s => s.id === id)!
  async function completed(owner = 'op-1') {
    const { mission, approvalId } = await repo.createMultiDocumentMission(owner, 'Auditoría proveedor', DOCS, 150_000)
    const done = await repo.decideLocalOperation(approvalId, 'APPROVED', 'admin-1', 'Revisado por el administrador')
    return { missionId: mission.id, approvalId, done }
  }

  it('before approval it reports what really ran and nothing more', async () => {
    const { flow } = flowWith(false)
    const { mission } = await repo.createMultiDocumentMission('op-1', 'Auditoría proveedor', DOCS, 150_000)
    const v = flow.view(mission.id)
    expect(['intake', 'validation', 'analysis'].map(id => stage(v, id).status)).toEqual(['DONE', 'DONE', 'DONE'])
    expect(stage(v, 'cerberus').status).toBe('WAITING_APPROVAL'); expect(stage(v, 'cerberus').executed).toBe(false)
    for (const id of ['report', 'seal', 'evidence', 'followup', 'near']) expect(stage(v, id).executed, id).toBe(false)
    expect(v.report).toBeNull()
    expect(() => flow.recordEvidence(mission.id, 'op-1')).toThrow(AuditFlowError)
    expect(() => flow.scheduleFollowUp(mission.id, 'op-1')).toThrow(/not completed|nothing to record|missing/)
    expect(() => flow.prepareNearAudit(mission.id, 'op-1')).toThrow(AuditFlowError)
    expect(repo.chronos.list()).toHaveLength(0)
  })

  it('runs the whole chain: approved mission → evidence → CHRONOS follow-up → NEAR plan, with honest executed flags', async () => {
    const { flow } = flowWith(false)
    const { missionId, done } = await completed()
    expect(done.status).toBe('COMPLETED')

    const first = flow.recordEvidence(missionId, 'op-1')
    expect(first.created).toBe(true)
    const report = repo.getMission(missionId)!.tasks.find(t => t.capabilityId === 'cap:report:generate@1.0.0')!.result!.data as { reportMarkdown: string }
    expect(first.evidence.reportSha256).toBe(sha(report.reportMarkdown))
    expect(flow.recordEvidence(missionId, 'someone-else').created).toBe(false) // never rewritten
    expect(repo.getMissionEvidence(missionId)!.recordedBy).toBe('op-1')

    const sched = flow.scheduleFollowUp(missionId, 'op-1')
    expect(sched.created).toBe(true); expect(sched.task).toMatchObject({ kind: 'MISSION_FOLLOWUP', missionId, status: 'ACTIVE', params: { missionId } })
    expect(flow.scheduleFollowUp(missionId, 'op-1').created).toBe(false) // one active follow-up per mission
    let v = flow.view(missionId)
    expect(stage(v, 'followup')).toMatchObject({ status: 'DONE', executed: false }) // scheduled, not yet run

    const run = repo.chronos.runNow(sched.task.id, 'op-1')
    expect(run.status).toBe('SUCCEEDED'); expect(run.result).toMatchObject({ missionId, missionStatus: 'COMPLETED', evidenceRecorded: true, evidenceIntact: true, auditChainVerified: true })
    v = flow.view(missionId); expect(stage(v, 'followup').executed).toBe(true)

    const near = flow.prepareNearAudit(missionId, 'op-1')
    expect(near.state).toBe('CONFIGURATION_PENDING'); expect(near.intent).toBeNull(); expect(near.plannedContentHash).toBe(first.evidence.reportSha256)
    v = flow.view(missionId)
    expect(stage(v, 'near')).toMatchObject({ status: 'CONFIGURATION_PENDING', executed: false })
    expect(stage(v, 'near').detail).toMatch(/Configuración pendiente.*No se firmó ni se envió/)
    expect(repo.getNearIntentStore().list(10)).toHaveLength(0)
    expect(v.stages.filter(s => s.executed).map(s => s.id)).toEqual(expect.arrayContaining(['request', 'intake', 'validation', 'analysis', 'cerberus', 'report', 'seal', 'evidence', 'followup']))
    expect(stage(v, 'near').executed).toBe(false)
    expect(repo.listAuditEvents({ missionId, limit: 100, offset: 0 }).map(e => e.action)).toEqual(expect.arrayContaining(['MISSION_EVIDENCE_RECORDED', 'MISSION_NEAR_AUDIT_PLAN']))
    expect(repo.verifyAuditIntegrity().verified).toBe(true)
  })

  it('prepares a real NEAR intent for approval when signer and contract are configured, but never submits', async () => {
    const { flow, near } = flowWith(true)
    repo.gate.addRecipient('near.audit_hash_submit', 'audit.hades-ops.testnet', 'admin-1')
    const { missionId } = await completed()
    const r = flow.prepareNearAudit(missionId, 'op-1')
    expect(r.state).toBe('PREPARED')
    expect(r.intent).toMatchObject({ status: 'PENDING_APPROVAL', params: { network: 'testnet', amountYocto: '0', receiverId: 'audit.hades-ops.testnet', signerId: 'hades-ops.testnet', contentHash: repo.getMissionEvidence(missionId)!.reportSha256, type: 'AUDIT_HASH' } })
    expect(() => flow.prepareNearAudit(missionId, 'op-1')).toThrow(/already exists/)
    const v = flow.view(missionId); expect(stage(v, 'near')).toMatchObject({ status: 'WAITING_APPROVAL', executed: false })
    expect(stage(v, 'near').detail).toMatch(/no se ha enviado/)
    // Not approved and signing is off: submission is refused before anything is signed (neverNetwork would throw on any broadcast).
    await expect(near.submit(r.intent!.id, 'admin-1')).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect(repo.getNearIntentStore().get(r.intent!.id)!.status).toBe('PENDING_APPROVAL')
  })

  it('keeps a draft and says so when the contract is not on the CERBERUS recipient allowlist', async () => {
    const { flow } = flowWith(true)
    const { missionId } = await completed()
    const r = flow.prepareNearAudit(missionId, 'op-1')
    expect(r.state).toBe('DRAFT_ONLY'); expect(r.intent!.status).toBe('DRAFT')
    expect(stage(flow.view(missionId), 'near').executed).toBe(false)
  })

  it('a rejected mission produces no evidence, no follow-up and no NEAR plan', async () => {
    const { flow } = flowWith(false)
    const { approvalId, mission } = await repo.createMultiDocumentMission('op-1', 'Auditoría rechazada', DOCS, 150_000)
    const failed = await repo.decideLocalOperation(approvalId, 'REJECTED', 'admin-1', 'No procede')
    expect(failed.status).toBe('FAILED')
    const v = flow.view(mission.id)
    expect(stage(v, 'cerberus').status).toBe('BLOCKED')
    for (const id of ['report', 'seal', 'evidence', 'followup', 'near']) expect(stage(v, id).executed, id).toBe(false)
    expect(() => flow.recordEvidence(mission.id, 'op-1')).toThrow(AuditFlowError)
    expect(repo.chronos.list()).toHaveLength(0)
  })

  it('refuses inconsistent evidence and the follow-up detects tampering later', async () => {
    const { flow } = flowWith(false)
    const { missionId } = await completed()
    const raw = (repo as unknown as { db: import('better-sqlite3').Database }).db
    const row = raw.prepare('SELECT data FROM missions WHERE id=?').get(missionId) as { data: string }
    const m = JSON.parse(row.data); const seal = m.tasks.find((t: { capabilityId: string }) => t.capabilityId === 'cap:crypto:hash@1.0.0'); seal.result.data.sha256 = 'a'.repeat(64)
    raw.prepare('UPDATE missions SET data=? WHERE id=?').run(JSON.stringify(m), missionId)
    expect(() => flow.recordEvidence(missionId, 'op-1')).toThrow(/does not match the report/)
    expect(repo.getMissionEvidence(missionId)).toBeUndefined()

    // restore, record, then corrupt the stored evidence: the CHRONOS follow-up must notice.
    seal.result.data.sha256 = sha(m.tasks.find((t: { capabilityId: string }) => t.capabilityId === 'cap:report:generate@1.0.0').result.data.reportMarkdown)
    raw.prepare('UPDATE missions SET data=? WHERE id=?').run(JSON.stringify(m), missionId)
    const { task } = flow.scheduleFollowUp(missionId, 'op-1')
    raw.prepare('UPDATE mission_evidence SET report_markdown=? WHERE mission_id=?').run('texto alterado', missionId)
    expect(repo.chronos.runNow(task.id, 'op-1').result).toMatchObject({ evidenceIntact: false })
    expect(stage(flow.view(missionId), 'evidence').detail).toMatch(/NO COINCIDE/)
  })

  it('CHRONOS only accepts a well-formed follow-up and still denies unknown job kinds', () => {
    for (const params of [{}, { missionId: '../etc' }, { missionId: 'a', extra: 1 }, { missionId: 5 }]) expect(() => repo.chronos.create({ title: 'bad followup', kind: 'MISSION_FOLLOWUP', params, cron: '0 9 * * *' }, 'x')).toThrow()
    expect(() => repo.chronos.create({ title: 'near send', kind: 'NEAR_SUBMIT', params: {}, cron: '0 9 * * *' }, 'x')).toThrow(/not a registered/)
  })

  describe('HTTP', () => {
    it('enforces ownership and roles', async () => {
      const prev = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
      const app = Fastify()
      try {
        const { flow } = flowWith(false)
        await registerSecurity(app); await app.register(async a => auditFlowRoutes(a, repo, flow), { prefix: '/api/v1' }); await app.ready()
        const as = (sub: string, role: string, method: 'GET' | 'POST', url: string) => app.inject({ method, url: `/api/v1${url}`, headers: { authorization: `Bearer ${app.jwt.sign({ sub, roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } })
        const { missionId } = await completed('op-1')
        expect((await as('op-1', 'OPERATOR', 'GET', `/audit-flow/${missionId}`)).statusCode).toBe(200)
        expect((await as('op-2', 'OPERATOR', 'GET', `/audit-flow/${missionId}`)).statusCode).toBe(404) // not theirs: indistinguishable from missing
        expect((await as('op-2', 'OPERATOR', 'POST', `/audit-flow/${missionId}/evidence`)).statusCode).toBe(404)
        expect((await as('v-1', 'VIEWER', 'POST', `/audit-flow/${missionId}/evidence`)).statusCode).toBe(403)
        expect((await as('a-1', 'AUDITOR', 'POST', `/audit-flow/${missionId}/followup`)).statusCode).toBe(403)
        expect((await as('op-1', 'OPERATOR', 'GET', '/audit-flow/nope')).statusCode).toBe(404)
        expect((await as('op-1', 'OPERATOR', 'POST', `/audit-flow/${missionId}/evidence`)).json().data.created).toBe(true)
        expect((await as('admin-1', 'ADMIN', 'POST', `/audit-flow/${missionId}/followup`)).json().data.task.kind).toBe('MISSION_FOLLOWUP')
        expect((await as('op-1', 'OPERATOR', 'POST', `/audit-flow/${missionId}/near-audit`)).json().data.state).toBe('CONFIGURATION_PENDING')
        const pending = await repo.createMultiDocumentMission('op-1', 'Aún sin aprobar', DOCS, 150_000)
        const res = await as('op-1', 'OPERATOR', 'POST', `/audit-flow/${pending.mission.id}/evidence`); expect(res.statusCode).toBe(409); expect(res.json().error.code).toBe('NOT_COMPLETED')
      } finally { await app.close(); process.env.JWT_SECRET = prev }
    })
  })
})
