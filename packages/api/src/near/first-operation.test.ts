import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { canonicalIntent } from '../near-intents.js'

// The first on-chain operation (docs/near-testnet-preparacion.md §5), rehearsed against the real testnet account names.
// Nothing is signed or sent: there is no signer and no network in this test.
const att = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', '..', 'docs', 'contract-attestation.json'), 'utf8')) as { wasmSha256: string; sourceCommit: string; version: string }
const SIGNER = 'hades-omega.testnet', CONTRACT = 'audit.hades-omega.testnet' // the real, deployed accounts (testnet)
const record = { auditId: 'hades-attest-0001', contract: `hades-audit-registry@${att.version}`, kind: 'CONTRACT_WASM_ATTESTATION', sourceCommit: att.sourceCommit, wasmSha256: att.wasmSha256 }
const canon = JSON.stringify(Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1))))
const CONTENT_HASH = createHash('sha256').update(canon).digest('hex')
const op = (over: Record<string, unknown> = {}) => ({ network: 'testnet', signerId: SIGNER, receiverId: CONTRACT, type: 'AUDIT_HASH', amountYocto: '0', auditId: 'hades-attest-0001', contentHash: CONTENT_HASH, operationType: 'CONTRACT_ATTESTATION', agentName: 'HADES', decision: 'PERMIT', timestampMs: 1_793_000_000_000, gas: '30000000000000', ...over })

describe('first NEAR operation (attestation of the deployed WASM) — rehearsal, nothing signed', () => {
  let dir: string, repo: SqliteRepository
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'first-op-')); repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init() })
  afterEach(async () => { repo.close(); await rm(dir, { recursive: true, force: true }) })
  const allow = () => repo.gate.addRecipient('near.audit_hash_submit', CONTRACT, 'admin-1')

  it('the documented content hash is the SHA-256 of the canonical attestation record', () => {
    expect(CONTENT_HASH).toBe('4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b')
    expect(att.wasmSha256).toMatch(/^[0-9a-f]{64}$/); expect(att.sourceCommit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('the exact parameters are zero-deposit, 30 Tgas, testnet-only and fully fixed (no extra or altered fields)', () => {
    const { params } = canonicalIntent(op())
    expect(params).toEqual(op())
    for (const bad of [{ amountYocto: '1' }, { gas: '300000000000000' }, { network: 'mainnet' }, { receiverId: 'audit.hades.near' }, { signerId: 'hades.near' }, { contentHash: 'A'.repeat(64) }, { decision: 'MAYBE' }, { operationType: 'attest' }]) expect(() => canonicalIntent(op(bad)), JSON.stringify(bad)).toThrow()
    expect(() => canonicalIntent({ ...op(), memo: 'x' })).toThrow()
  })

  it('CERBERUS: without an allowlisted contract the request is denied; with it, a human approval is required and bound to the exact parameters', () => {
    const store = repo.getNearIntentStore()
    const a = store.create(op(), 'admin-1')
    expect(() => store.requestApproval(a.id, 'admin-1')).toThrow(/RECIPIENT_NOT_ALLOWED/)
    allow()
    const b = store.create(op({ auditId: 'hades-attest-0002' }), 'admin-1')
    const pending = store.requestApproval(b.id, 'admin-1')
    expect(pending.status).toBe('PENDING_APPROVAL')
    expect(() => store.claimForSigning(b.id, b.hash, 'admin-1')).toThrow(/INVALID_STATE/) // cannot sign before approval
    expect(() => store.approve(b.id, 'f'.repeat(64), 'admin-1', Date.now() + 600_000)).toThrow(/INTENT_CHANGED/) // approval is hash-bound
    expect(() => store.approve(b.id, b.hash, 'admin-1', Date.now() + 16 * 60_000)).toThrow(/INVALID_EXPIRY/)
    const approved = store.approve(b.id, b.hash, 'admin-1', Date.now() + 600_000)
    expect(approved.status).toBe('APPROVED')
    const claim = store.claimForSigning(b.id, b.hash, 'admin-1')
    expect(claim.status).toBe('SIGNING'); expect(claim.grantId).toBeTruthy()
    expect(() => store.claimForSigning(b.id, b.hash, 'admin-1')).toThrow() // single use
  })

  it('the emergency stop blocks new requests and blocks signing of an already approved operation', () => {
    allow()
    const store = repo.getNearIntentStore()
    const ready = store.create(op({ auditId: 'hades-attest-0003' }), 'admin-1')
    store.requestApproval(ready.id, 'admin-1'); store.approve(ready.id, ready.hash, 'admin-1', Date.now() + 600_000)
    store.setEmergency(true, 'admin-1')
    expect(() => store.claimForSigning(ready.id, ready.hash, 'admin-1')).toThrow(/EMERGENCY_STOP/)
    const fresh = store.create(op({ auditId: 'hades-attest-0004' }), 'admin-1')
    expect(() => store.requestApproval(fresh.id, 'admin-1')).toThrow(/EMERGENCY_STOP/)
    store.setEmergency(false, 'admin-1')
    expect(store.claimForSigning(ready.id, ready.hash, 'admin-1').status).toBe('SIGNING') // the approval survived the stop, unspent
  })

  it('preparing the operation sends nothing: no submission exists and no network call is possible from this store', () => {
    allow()
    const store = repo.getNearIntentStore()
    const i = store.create(op({ auditId: 'hades-attest-0005' }), 'admin-1'); store.requestApproval(i.id, 'admin-1')
    const db = (repo as unknown as { db: { prepare: (s: string) => { get: () => { n: number } } } }).db
    const has = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='near_submissions'").get().n
    expect(has === 0 ? 0 : db.prepare('SELECT COUNT(*) AS n FROM near_submissions').get().n).toBe(0)
    expect(store.get(i.id)!.status).toBe('PENDING_APPROVAL') // prepared and waiting for a human, nothing more
  })
})
