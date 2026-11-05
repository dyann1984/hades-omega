import Fastify from 'fastify'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NEARBridge } from '@hades/core'
import { transactions, utils } from 'near-api-js'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { nearTxRoutes } from '../routes/near-tx.js'
import { NearSigner, loadSignerFromEnv } from './signer.js'
import { NearSubmissionService, NearSubmitError, nearServiceConfigFromEnv, type NearServiceConfig } from './submission.js'
import { NO_CONTRACT_CODE_HASH, assertTestnetRpcUrl, type AccessKeyView, type NearRpc, type TxState, type TxStatusView } from './rpc.js'
import { AUDIT_GAS, buildAuditTransaction, describeSignedTx } from './tx.js'

const SIGNER = 'hades-signer.testnet', CONTRACT = 'hades-audit.testnet'
const BLOCK_HASH = utils.serialize.base_encode(createHash('sha256').update('block').digest())
const hashOf = (b64: string): string => utils.serialize.base_encode(createHash('sha256').update(transactions.encodeTransaction(transactions.SignedTransaction.decode(Buffer.from(b64, 'base64')).transaction)).digest())

/** In-memory chain: deduplicates by tx hash, applies the contract's idempotent store, and can drop or fail calls. */
class FakeRpc implements NearRpc {
  chain = 'testnet'; height = 1_000
  accounts = new Map<string, { amount: string; codeHash: string }>()
  keys = new Map<string, AccessKeyView>()
  owner: string | null = SIGNER
  entries = new Map<string, Record<string, unknown>>()
  txs = new Map<string, { state: TxState; error?: string; signed: string }>()
  broadcasts: string[] = []
  failBroadcast = 0; failFinalBlock = false; dropBroadcast = false
  async chainId() { return this.chain }
  async latestHeight() { return this.height }
  async finalBlock() { if (this.failFinalBlock) throw new Error('rpc down'); return { hash: BLOCK_HASH, height: this.height } }
  async viewAccount(id: string) { const a = this.accounts.get(id); return a ? { ...a, blockHeight: this.height } : null }
  async viewAccessKey(id: string, pk: string) { return this.keys.get(`${id}|${pk}`) ?? null }
  async viewFunction(_c: string, method: string, args: Record<string, unknown>) {
    if (method === 'get_owner') return this.owner
    if (method === 'get_audit_entry') return this.entries.get(String(args['audit_id'])) ?? null
    throw new Error(`unexpected view ${method}`)
  }
  async broadcast(b64: string) {
    if (this.failBroadcast > 0) { this.failBroadcast--; throw new Error('network down') }
    this.broadcasts.push(b64)
    if (this.dropBroadcast) return
    const h = hashOf(b64); if (!this.txs.has(h)) this.txs.set(h, { state: 'PENDING', signed: b64 })
  }
  async txStatus(hash: string): Promise<TxStatusView> { const t = this.txs.get(hash); return t ? { state: t.state, ...(t.error ? { error: t.error } : {}), blockHash: 'blk' } : { state: 'UNKNOWN' } }
  finalize(hash: string, ok: boolean) {
    const t = this.txs.get(hash)!; t.state = ok ? 'SUCCESS' : 'FAILURE'; if (!ok) t.error = 'ExecutionError'
    if (ok) { const call = describeSignedTx(t.signed).actions[0]!; const a = call.args as Record<string, unknown>; if (!this.entries.has(String(a['audit_id']))) this.entries.set(String(a['audit_id']), a) }
  }
}

describe('NEAR submission (fake chain, throwaway in-memory key)', () => {
  let dir: string, repo: SqliteRepository, rpc: FakeRpc, signer: NearSigner, svc: NearSubmissionService, bridge: NEARBridge, config: NearServiceConfig
  let prevMode: string | undefined, seq = 0

  beforeEach(async () => {
    prevMode = process.env['NEAR_EXECUTION_MODE']; process.env['NEAR_EXECUTION_MODE'] = 'testnet'
    dir = await mkdtemp(join(tmpdir(), 'near-sub-')); repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
    signer = new NearSigner(SIGNER, utils.KeyPair.fromRandom('ed25519').toString())
    rpc = new FakeRpc()
    rpc.accounts.set(CONTRACT, { amount: '1000000000000000000000000', codeHash: 'CodeHash1111111111111111111111111111111111' })
    rpc.accounts.set(SIGNER, { amount: '5000000000000000000000000', codeHash: NO_CONTRACT_CODE_HASH })
    rpc.keys.set(`${SIGNER}|${signer.publicKey}`, { nonce: 100, fullAccess: true })
    bridge = new NEARBridge(); bridge.attachGate(repo.gate)
    config = { enabled: true, contractId: CONTRACT, minBalanceYocto: 50_000_000_000_000_000_000_000n, allowFullAccessKey: true } // the legacy happy paths use FullAccess; the strict policy is tested below
    svc = repo.createNearSubmissionService({ bridge, rpc, signer, config })
    repo.gate.addRecipient('near.audit_hash_submit', CONTRACT, 'admin')
  })
  afterEach(async () => { repo.close(); await rm(dir, { recursive: true, force: true }); if (prevMode === undefined) delete process.env['NEAR_EXECUTION_MODE']; else process.env['NEAR_EXECUTION_MODE'] = prevMode })

  const params = (n = ++seq) => ({ network: 'testnet', signerId: SIGNER, receiverId: CONTRACT, type: 'AUDIT_HASH', amountYocto: '0', auditId: `audit-${n}`, contentHash: createHash('sha256').update(`event-${n}`).digest('hex'), operationType: 'PLANNING', agentName: 'HADES', decision: 'PERMIT', timestampMs: 1_700_000_000_000 + n, gas: '30000000000000' })
  function approvedIntent(p = params()) {
    const s = repo.getNearIntentStore(), d = s.create(p, 'operator')
    s.requestApproval(d.id, 'operator'); s.approve(d.id, d.hash, 'admin', Date.now() + 10 * 60_000)
    return s.get(d.id)!
  }
  const sub = (id: string) => svc.get(id).submission!

  it('is inert by default: with signing disabled nothing is signed, broadcast, or consumed', async () => {
    const disabled = repo.createNearSubmissionService({ bridge: new NEARBridge(), rpc, signer, config: { ...config, enabled: false } })
    const i = approvedIntent()
    await expect(disabled.submit(i.id, 'admin')).rejects.toMatchObject({ code: 'SIGNING_DISABLED' })
    expect(repo.getNearIntentStore().get(i.id)!.status).toBe('APPROVED')
    expect(rpc.broadcasts).toHaveLength(0)
    expect(disabled.status()).toMatchObject({ signingEnabled: false, blockers: expect.arrayContaining(['SIGNING_DISABLED']) })
  })

  it('submits exactly the approved operation: one FunctionCall, fixed method, zero deposit, fixed gas', async () => {
    const i = approvedIntent()
    const r = await svc.submit(i.id, 'admin')
    expect(r.error).toBeNull()
    expect(r.intent.status).toBe('BROADCASTED')
    const s = r.submission!
    expect(s.payload).toMatchObject({ signerId: SIGNER, receiverId: CONTRACT, nonce: 101 })
    expect(s.payload.actions).toEqual([{ type: 'FunctionCall', method: 'store_audit_hash', gas: AUDIT_GAS.toString(), deposit: '0', args: { audit_id: i.params.auditId, content_hash: i.params.contentHash, operation_type: 'PLANNING', agent_name: 'HADES', decision: 'PERMIT', timestamp_ms: i.params.timestampMs } }])
    expect(rpc.broadcasts).toHaveLength(1)
    expect(hashOf(rpc.broadcasts[0]!)).toBe(s.txHash) // the hash we stored is the hash of what was sent
    expect(s.explorerUrl).toBe(`https://testnet.nearblocks.io/txns/${s.txHash}`)
  })

  it('works with a least-privilege FunctionCall key (store_audit_hash on the audit contract only), never needing FullAccess', async () => {
    rpc.keys.set(`${SIGNER}|${signer.publicKey}`, { nonce: 7, fullAccess: false, receiverId: CONTRACT, methodNames: ['store_audit_hash'], allowance: '250000000000000000000000' })
    config.allowFullAccessKey = false // strict policy on the same service
    const i = approvedIntent()
    const r = await svc.submit(i.id, 'admin')
    expect(r.error).toBeNull(); expect(r.intent.status).toBe('BROADCASTED')
    expect(r.submission!.payload).toMatchObject({ nonce: 8 })
    expect(r.submission!.payload.actions).toHaveLength(1) // a restricted key could not authorize anything else anyway
  })

  it('refuses FullAccess by default and any FunctionCall key that is not exactly store_audit_hash on the audit contract with a bounded allowance (approval stays unspent)', async () => {
    config.allowFullAccessKey = false
    const okAllowance = '250000000000000000000000'
    const bad: AccessKeyView[] = [
      { nonce: 7, fullAccess: true },
      { nonce: 7, fullAccess: false, receiverId: CONTRACT, methodNames: ['other_method'], allowance: okAllowance },
      { nonce: 7, fullAccess: false, receiverId: CONTRACT, methodNames: [], allowance: okAllowance }, // an empty list means every method on-chain
      { nonce: 7, fullAccess: false, receiverId: CONTRACT, methodNames: ['store_audit_hash', 'new'], allowance: okAllowance },
      { nonce: 7, fullAccess: false, receiverId: 'someone.testnet', methodNames: ['store_audit_hash'], allowance: okAllowance },
      { nonce: 7, fullAccess: false, receiverId: CONTRACT, methodNames: ['store_audit_hash'], allowance: null }, // unlimited
      { nonce: 7, fullAccess: false, receiverId: CONTRACT, methodNames: ['store_audit_hash'], allowance: '250000000000000000000001' }, // above the authorized maximum
      { nonce: 7, fullAccess: false, receiverId: CONTRACT, methodNames: ['store_audit_hash'], allowance: 'abc' },
    ]
    for (const k of bad) {
      rpc.keys.set(`${SIGNER}|${signer.publicKey}`, k)
      const i = approvedIntent()
      await expect(svc.submit(i.id, 'admin')).rejects.toMatchObject({ code: 'SIGNER_KEY_NOT_PERMITTED' })
      expect(repo.getNearIntentStore().get(i.id)!.status).toBe('APPROVED')
    }
    expect(rpc.broadcasts).toHaveLength(0)
  })

  it('confirms only from a final on-chain outcome and verifies the recorded hash against contract state', async () => {
    const i = approvedIntent(); const { submission } = await svc.submit(i.id, 'admin')
    expect((await svc.refresh(i.id, 'admin')).intent.status).toBe('BROADCASTED') // still pending
    rpc.finalize(submission!.txHash, true)
    const done = await svc.refresh(i.id, 'admin')
    expect(done.intent.status).toBe('CONFIRMED')
    expect(done.submission).toMatchObject({ onChainVerified: true, outcomeBlockHash: 'blk' })
    const actions = repo.listAuditEvents({ limit: 50, offset: 0 }).map(e => e.action)
    expect(actions).toEqual(expect.arrayContaining(['NEAR_SIGNED', 'NEAR_BROADCAST', 'NEAR_CONFIRMED', 'CERBERUS_GATE']))
    expect(repo.verifyAuditIntegrity().verified).toBe(true)
  })

  it('records a failed on-chain execution as FAILED', async () => {
    const i = approvedIntent(); const { submission } = await svc.submit(i.id, 'admin')
    rpc.finalize(submission!.txHash, false)
    const r = await svc.refresh(i.id, 'admin')
    expect(r.intent.status).toBe('FAILED'); expect(r.submission!.lastError).toBe('ExecutionError')
  })

  it('sends at most once: a repeated or concurrent submit cannot double-send', async () => {
    const i = approvedIntent()
    const results = await Promise.allSettled([svc.submit(i.id, 'admin'), svc.submit(i.id, 'admin'), svc.submit(i.id, 'admin')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(rpc.broadcasts).toHaveLength(1)
    await expect(svc.submit(i.id, 'admin')).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('refuses unapproved, forged and tampered intents without signing anything', async () => {
    const s = repo.getNearIntentStore()
    const draft = s.create(params(), 'operator')
    await expect(svc.submit(draft.id, 'admin')).rejects.toMatchObject({ code: 'INVALID_STATE' })
    const raw = (repo as unknown as { db: import('better-sqlite3').Database }).db
    const forged = s.create(params(), 'operator'); raw.prepare("UPDATE near_intents SET status='APPROVED',expires_at=? WHERE id=?").run(Date.now() + 60_000, forged.id)
    await expect(svc.submit(forged.id, 'admin')).rejects.toThrow('INVALID_STATE')
    const tampered = approvedIntent(); raw.prepare('UPDATE near_intents SET params=? WHERE id=?').run(JSON.stringify({ ...tampered.params, contentHash: 'f'.repeat(64) }), tampered.id)
    await expect(svc.submit(tampered.id, 'admin')).rejects.toThrow('INTENT_CHANGED')
    expect(rpc.broadcasts).toHaveLength(0)
    expect(raw.prepare('SELECT COUNT(*) AS n FROM near_submissions').get()).toEqual({ n: 0 })
  })

  it('revokes the existing approval on emergency stop and refuses it after clearing', async () => {
    const i = approvedIntent()
    repo.gate.setStopped(true, 'admin')
    await expect(svc.submit(i.id, 'admin')).rejects.toThrow('EMERGENCY_STOP')
    expect(rpc.broadcasts).toHaveLength(0)
    repo.gate.setStopped(false, 'admin')
    await expect(svc.submit(i.id, 'admin')).rejects.toThrow()
    expect(rpc.broadcasts).toHaveLength(0)
  })

  describe('preflight failures leave the one-time approval intact', () => {
    const cases: Array<[string, string, () => void]> = [
      ['wrong chain', 'NETWORK_MISMATCH', () => { rpc.chain = 'mainnet' }],
      ['contract missing', 'CONTRACT_NOT_DEPLOYED', () => { rpc.accounts.delete(CONTRACT) }],
      ['account without code', 'CONTRACT_NOT_DEPLOYED', () => { rpc.accounts.set(CONTRACT, { amount: '1', codeHash: NO_CONTRACT_CODE_HASH }) }],
      ['owner is someone else', 'CONTRACT_OWNER_MISMATCH', () => { rpc.owner = 'other.testnet' }],
      ['key not on account', 'SIGNER_KEY_NOT_ON_ACCOUNT', () => { rpc.keys.clear() }],
      ['key limited to another contract', 'SIGNER_KEY_NOT_PERMITTED', () => { rpc.keys.set(`${SIGNER}|${signer.publicKey}`, { nonce: 1, fullAccess: false, receiverId: 'other.testnet', methodNames: [] }) }],
      ['balance too low', 'INSUFFICIENT_BALANCE', () => { rpc.accounts.set(SIGNER, { amount: '1000', codeHash: NO_CONTRACT_CODE_HASH }) }],
      ['already recorded', 'ALREADY_RECORDED', () => {}],
    ]
    for (const [name, code, mutate] of cases) {
      it(name, async () => {
        const i = approvedIntent()
        const restore = { chain: rpc.chain }
        mutate(); if (code === 'ALREADY_RECORDED') rpc.entries.set(i.params.auditId, { content_hash: i.params.contentHash })
        await expect(svc.submit(i.id, 'admin')).rejects.toMatchObject({ code })
        expect(repo.getNearIntentStore().get(i.id)!.status).toBe('APPROVED') // approval not consumed
        expect(rpc.broadcasts).toHaveLength(0)
        rpc.chain = restore.chain
      })
    }
  })

  it('rejects an intent whose receiver or signer differs from server configuration', async () => {
    repo.gate.addRecipient('near.audit_hash_submit', 'other-contract.testnet', 'admin')
    const wrongContract = approvedIntent({ ...params(), receiverId: 'other-contract.testnet' })
    await expect(svc.submit(wrongContract.id, 'admin')).rejects.toMatchObject({ code: 'CONTRACT_MISMATCH' })
    const wrongSigner = approvedIntent({ ...params(), signerId: 'someone-else.testnet' })
    await expect(svc.submit(wrongSigner.id, 'admin')).rejects.toMatchObject({ code: 'SIGNER_MISMATCH' })
    expect(rpc.broadcasts).toHaveLength(0)
  })

  describe('recovery', () => {
    it('re-sends the SAME signed bytes after a broadcast failure and never signs again', async () => {
      const i = approvedIntent(); rpc.failBroadcast = 1
      const first = await svc.submit(i.id, 'admin')
      expect(first.error).toMatch(/network down/); expect(first.intent.status).toBe('BROADCAST_PENDING')
      const before = sub(i.id)
      const raw = (repo as unknown as { db: import('better-sqlite3').Database }).db
      const stored = (raw.prepare('SELECT signed_tx FROM near_submissions WHERE intent_id=?').get(i.id) as { signed_tx: string }).signed_tx
      const again = await svc.refresh(i.id, 'admin')
      expect(again.intent.status).toBe('BROADCASTED')
      expect(rpc.broadcasts).toEqual([stored])
      expect(sub(i.id)).toMatchObject({ txHash: before.txHash, nonce: before.nonce })
      rpc.finalize(before.txHash, true)
      expect((await svc.refresh(i.id, 'admin')).intent.status).toBe('CONFIRMED')
    })
    it('a duplicate broadcast of the same bytes cannot create a second transaction', async () => {
      const i = approvedIntent(); await svc.submit(i.id, 'admin')
      rpc.txs.clear() // network "forgot" it (e.g. dropped before inclusion)
      await svc.refresh(i.id, 'admin'); await svc.refresh(i.id, 'admin')
      expect(new Set(rpc.broadcasts).size).toBe(1)
      expect(rpc.txs.size).toBe(1)
    })
    it('does not re-send while the emergency stop is on or signing is disabled', async () => {
      const i = approvedIntent(); rpc.failBroadcast = 1; await svc.submit(i.id, 'admin')
      repo.gate.setStopped(true, 'admin'); await svc.refresh(i.id, 'admin')
      expect(rpc.broadcasts).toHaveLength(0); expect(repo.getNearIntentStore().get(i.id)!.status).toBe('BROADCAST_PENDING')
    })
    it('C-6: a service that is blocked for ANY reason (e.g. bridge not in real mode) reconciles read-only and never broadcasts', async () => {
      const i = approvedIntent(); rpc.failBroadcast = 1; await svc.submit(i.id, 'admin') // BROADCAST_PENDING, bytes stored
      const otherBridge = new NEARBridge(); otherBridge.attachGate(repo.gate)
      const blocked = repo.createNearSubmissionService({ bridge: otherBridge, rpc, signer, config: { ...config, enabled: true, contractId: null } })
      expect(blocked.blockers()).toEqual(['NO_CONTRACT_CONFIGURED'])
      await blocked.refresh(i.id, 'system:near-recovery')
      expect(rpc.broadcasts).toHaveLength(0)
      expect(repo.getNearIntentStore().get(i.id)!.status).toBe('BROADCAST_PENDING')
      // ...but it can still observe the network: a transaction that landed is confirmed from on-chain state.
      const j = approvedIntent(); const { submission } = await svc.submit(j.id, 'admin'); rpc.finalize(submission!.txHash, true)
      expect((await blocked.refresh(j.id, 'system:near-recovery')).intent.status).toBe('CONFIRMED')
    })
    it('a crash after the approval is spent but before any signature ends FAILED: nothing exists on the network', async () => {
      const i = approvedIntent(); rpc.failFinalBlock = true
      const r = await svc.submit(i.id, 'admin')
      expect(r.error).toMatch(/rpc down/); expect(r.intent.status).toBe('FAILED'); expect(r.submission).toBeNull()
      rpc.failFinalBlock = false
      await expect(svc.submit(i.id, 'admin')).rejects.toMatchObject({ code: 'INVALID_STATE' }) // needs a NEW intent and approval
      expect(rpc.broadcasts).toHaveLength(0)
    })
    it('recovers a SIGNING intent left by a crash, and in-flight intents at startup', async () => {
      const raw = (repo as unknown as { db: import('better-sqlite3').Database }).db
      const stuck = approvedIntent(); raw.prepare("UPDATE near_intents SET status='SIGNING' WHERE id=?").run(stuck.id)
      const flying = approvedIntent(); const { submission } = await svc.submit(flying.id, 'admin'); rpc.finalize(submission!.txHash, true)
      expect(await svc.recoverAll()).toBe(2)
      expect(repo.getNearIntentStore().get(stuck.id)!.status).toBe('FAILED')
      expect(repo.getNearIntentStore().get(flying.id)!.status).toBe('CONFIRMED')
    })
    it('an expired signature goes to RECONCILIATION_REQUIRED; reconcile decides from contract state and never sends', async () => {
      const i = approvedIntent(); await svc.submit(i.id, 'admin')
      rpc.txs.clear(); rpc.height += 90_000
      const r = await svc.refresh(i.id, 'admin'); expect(r.intent.status).toBe('RECONCILIATION_REQUIRED')
      const sent = rpc.broadcasts.length
      const none = await svc.reconcile(i.id, 'admin')
      expect(none.intent.status).toBe('RECONCILIATION_REQUIRED'); expect(none.error).toMatch(/new human approval/)
      rpc.entries.set(i.params.auditId, { audit_id: i.params.auditId, content_hash: i.params.contentHash, decision: 'PERMIT' })
      expect((await svc.reconcile(i.id, 'admin')).intent.status).toBe('CONFIRMED')
      expect(rpc.broadcasts.length).toBe(sent)
    })
    it('reconcile marks a conflicting on-chain entry as FAILED', async () => {
      const i = approvedIntent(); await svc.submit(i.id, 'admin'); rpc.txs.clear(); rpc.height += 90_000; await svc.refresh(i.id, 'admin')
      rpc.entries.set(i.params.auditId, { audit_id: i.params.auditId, content_hash: 'e'.repeat(64), decision: 'PERMIT' })
      expect((await svc.reconcile(i.id, 'admin')).intent.status).toBe('FAILED')
    })
    it('refuses to reconcile an intent that is not awaiting reconciliation', async () => {
      const i = approvedIntent(); await expect(svc.reconcile(i.id, 'admin')).rejects.toMatchObject({ code: 'INVALID_STATE' })
    })
  })

  it('assigns distinct increasing nonces to successive submissions', async () => {
    const a = approvedIntent(), b = approvedIntent(), c = approvedIntent()
    await Promise.all([svc.submit(a.id, 'admin'), svc.submit(b.id, 'admin'), svc.submit(c.id, 'admin')])
    expect([a, b, c].map(x => sub(x.id).nonce).sort((x, y) => x - y)).toEqual([101, 102, 103])
  })

  it('never exposes the private key through any output', async () => {
    const secret = utils.KeyPair.fromRandom('ed25519').toString()
    const s2 = new NearSigner(SIGNER, secret)
    const rawKey = secret.replace('ed25519:', '')
    for (const out of [JSON.stringify(s2), inspect(s2, { depth: 5 }), String(s2), JSON.stringify(Object.getOwnPropertyNames(s2))]) expect(out).not.toContain(rawKey)
    const i = approvedIntent(); const r = await svc.submit(i.id, 'admin')
    const dump = JSON.stringify([r, svc.status(), svc.list(), repo.listAuditEvents({ limit: 100, offset: 0 }), repo.gate.listDecisions(100)])
    const real = (signer as unknown as { [k: symbol]: unknown })
    expect(dump).not.toContain('private'); expect(Object.keys(real)).not.toContain('keyPair')
    for (const bad of ['not-a-key', 'ed25519:short', '']) { try { new NearSigner(SIGNER, bad); throw new Error('accepted') } catch (e) { expect((e as Error).message).toBe('NEAR_SIGNER_KEY_INVALID') } }
    expect(() => new NearSigner('mainnet-account.near', secret)).toThrow('NEAR_SIGNER_ACCOUNT_INVALID')
  })

  it('loads the signer from the environment only when complete', () => {
    const key = utils.KeyPair.fromRandom('ed25519').toString()
    expect(loadSignerFromEnv({})).toBeNull()
    expect(() => loadSignerFromEnv({ NEAR_SIGNER_ACCOUNT_ID: SIGNER })).toThrow('NEAR_SIGNER_INCOMPLETE')
    expect(loadSignerFromEnv({ NEAR_SIGNER_ACCOUNT_ID: SIGNER, NEAR_SIGNER_PRIVATE_KEY: key })!.accountId).toBe(SIGNER)
    expect(() => loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: join(dir, 'missing.json') })).toThrow('NEAR_SIGNER_KEY_FILE_UNREADABLE')
    expect(nearServiceConfigFromEnv({}).enabled).toBe(false)
    expect(nearServiceConfigFromEnv({ NEAR_SIGNING_ENABLED: 'yes' }).enabled).toBe(false) // only the exact string "true" enables
    expect(() => nearServiceConfigFromEnv({ NEAR_AUDIT_CONTRACT_ID: 'audit.near' })).toThrow()
  })

  it('transaction builder cannot produce anything but a zero-deposit audit call', () => {
    const p = { ...params(), network: 'testnet' as const, type: 'AUDIT_HASH' as const, amountYocto: '0' as const, gas: '30000000000000' as const, decision: 'PERMIT' as const, agentName: 'HADES' }
    expect(() => buildAuditTransaction({ ...p, gas: '300000000000000' as never }, { publicKey: signer.publicKey, nonce: 1, blockHash: BLOCK_HASH })).toThrow('NEAR_TX_PARAMS_INVALID')
    expect(() => buildAuditTransaction({ ...p, amountYocto: '1' as never }, { publicKey: signer.publicKey, nonce: 1, blockHash: BLOCK_HASH })).toThrow('NEAR_TX_PARAMS_INVALID')
    expect(() => buildAuditTransaction({ ...p, network: 'mainnet' as never }, { publicKey: signer.publicKey, nonce: 1, blockHash: BLOCK_HASH })).toThrow('NEAR_TX_PARAMS_INVALID')
    expect(() => buildAuditTransaction(p, { publicKey: signer.publicKey, nonce: 0, blockHash: BLOCK_HASH })).toThrow('NEAR_TX_NONCE_INVALID')
  })

  it('only trusted testnet RPC endpoints are accepted', () => {
    for (const bad of ['https://rpc.mainnet.near.org', 'http://rpc.testnet.near.org', 'https://evil.example/rpc', 'not a url']) expect(() => assertTestnetRpcUrl(bad), bad).toThrow()
    expect(() => assertTestnetRpcUrl('https://rpc.testnet.near.org')).not.toThrow()
  })
  it('NEAR_EXECUTION_MODE=mainnet is not accepted', () => {
    process.env['NEAR_EXECUTION_MODE'] = 'mainnet'
    expect(() => new NEARBridge()).toThrow('Invalid NEAR_EXECUTION_MODE')
  })

  describe('HTTP', () => {
    it('is ADMIN-only, reports blockers without secrets, and maps errors', async () => {
      const prev = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
      const app = Fastify()
      try {
        await registerSecurity(app); await app.register(async a => nearTxRoutes(a, repo, svc), { prefix: '/api/v1' }); await app.ready()
        const call = (role: string, method: 'GET' | 'POST', url: string) => app.inject({ method, url: `/api/v1${url}`, headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'u', roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } })
        const i = approvedIntent()
        for (const role of ['OPERATOR', 'VIEWER', 'AUDITOR']) { expect((await call(role, 'POST', `/near/intents/${i.id}/submit`)).statusCode, role).toBe(403); expect((await call(role, 'GET', '/near/config')).statusCode).toBe(403) }
        const cfg = (await call('ADMIN', 'GET', '/near/config')).json().data
        expect(cfg).toMatchObject({ signerAccountId: SIGNER, contractId: CONTRACT, blockers: [] })
        expect(JSON.stringify(cfg)).not.toMatch(/private|secret/i)
        expect((await call('ADMIN', 'POST', '/near/intents/nope/submit')).statusCode).toBe(404)
        rpc.owner = 'other.testnet'
        expect((await call('ADMIN', 'POST', `/near/intents/${i.id}/submit`)).statusCode).toBe(422)
        rpc.owner = SIGNER
        repo.gate.setStopped(true, 'admin'); expect((await call('ADMIN', 'POST', `/near/intents/${i.id}/submit`)).statusCode).toBe(423); repo.gate.setStopped(false, 'admin')
        expect((await call('ADMIN', 'POST', `/near/intents/${i.id}/submit`)).statusCode).toBe(409)
        const fresh = approvedIntent()
        const ok = await call('ADMIN', 'POST', `/near/intents/${fresh.id}/submit`)
        expect(ok.statusCode).toBe(200); expect(ok.json().data.intent.status).toBe('BROADCASTED')
        expect((await call('ADMIN', 'GET', `/near/submissions/${fresh.id}`)).json().data.submission.txHash).toBeTruthy()
        expect((await call('ADMIN', 'GET', '/near/submissions')).json().data).toHaveLength(2)
        expect((await call('ADMIN', 'POST', `/near/submissions/${fresh.id}/reconcile`)).statusCode).toBe(409)
      } finally { await app.close(); process.env.JWT_SECRET = prev }
    })
  })
})

describe('NearSubmitError', () => { it('carries a stable code', () => { expect(new NearSubmitError('NOT_FOUND').code).toBe('NOT_FOUND') }) })
