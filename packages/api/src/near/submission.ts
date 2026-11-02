import type Database from 'better-sqlite3'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { NEARBridge, NEARTxRecord } from '@hades/core'
import { canonicalIntent, type AuditIntent, type NearIntent, type NearIntentStore } from '../near-intents.js'
import type { SqliteRepository } from '../sqlite.js'
import { NO_CONTRACT_CODE_HASH, type NearRpc } from './rpc.js'
import type { NearSigner } from './signer.js'
import { AUDIT_METHOD, buildAuditTransaction, describeSignedTx } from './tx.js'

export type SubmitErrorCode =
  | 'SIGNING_DISABLED' | 'NO_SIGNER' | 'NO_CONTRACT_CONFIGURED' | 'SIGNER_MISMATCH' | 'CONTRACT_MISMATCH' | 'NETWORK_MISMATCH'
  | 'CONTRACT_NOT_DEPLOYED' | 'CONTRACT_OWNER_MISMATCH' | 'SIGNER_KEY_NOT_ON_ACCOUNT' | 'SIGNER_KEY_NOT_PERMITTED'
  | 'INSUFFICIENT_BALANCE' | 'ALREADY_RECORDED' | 'DUPLICATE_SUBMISSION' | 'NOT_FOUND' | 'INVALID_STATE' | 'RPC_ERROR' | 'CONTEXT_MISSING'
export class NearSubmitError extends Error {
  constructor(readonly code: SubmitErrorCode, detail?: string) { super(detail ? `${code}: ${detail}` : code) }
}

export interface NearServiceConfig {
  /** Master switch (NEAR_SIGNING_ENABLED=true). Off by default: nothing is ever signed or broadcast while false. */
  enabled: boolean
  /** The only contract this server will ever call (NEAR_AUDIT_CONTRACT_ID). */
  contractId: string | null
  /** Minimum signer balance, in yocto, required before submitting. */
  minBalanceYocto: bigint
}

export interface SubmissionView {
  intentId: string; auditId: string; signerId: string; receiverId: string; publicKey: string; nonce: number
  txHash: string; explorerUrl: string; startHeight: number; broadcastCount: number; lastError: string | null
  onChainVerified: boolean | null; outcomeBlockHash: string | null; createdAt: number; updatedAt: number
  /** What the signed payload actually contains, decoded independently from the stored bytes. */
  payload: ReturnType<typeof describeSignedTx>
}
interface Row { intent_id: string; audit_id: string; signer_id: string; receiver_id: string; public_key: string; nonce: number; block_hash: string; signed_tx: string; tx_hash: string; start_height: number; broadcast_count: number; last_error: string | null; on_chain_verified: number | null; outcome_block_hash: string | null; created_at: number; updated_at: number }

const SUBMISSIONS_SQL = `CREATE TABLE IF NOT EXISTS near_submissions (intent_id TEXT PRIMARY KEY, audit_id TEXT NOT NULL UNIQUE, signer_id TEXT NOT NULL, receiver_id TEXT NOT NULL, public_key TEXT NOT NULL, nonce INTEGER NOT NULL, block_hash TEXT NOT NULL, signed_tx TEXT NOT NULL, tx_hash TEXT NOT NULL UNIQUE, start_height INTEGER NOT NULL, broadcast_count INTEGER NOT NULL DEFAULT 0, last_error TEXT, on_chain_verified INTEGER, outcome_block_hash TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`
/** NEAR transactions are valid for 86400 blocks; stop trusting a stored signature well before that. */
const SAFE_VALIDITY_BLOCKS = 80_000
const explorer = (hash: string): string => `https://testnet.nearblocks.io/txns/${hash}`

interface Ctx { intentId: string; actor: string }

export class NearSubmissionService {
  private readonly als = new AsyncLocalStorage<Ctx>()
  private chain: Promise<unknown> = Promise.resolve()
  private readonly store: NearIntentStore

  constructor(private readonly deps: {
    db: Database.Database; repository: SqliteRepository; bridge: NEARBridge; rpc: NearRpc
    signer: NearSigner | null; config: NearServiceConfig; clock?: () => number
  }) {
    deps.db.exec(SUBMISSIONS_SQL)
    this.store = deps.repository.getNearIntentStore()
    deps.bridge.attachSubmitter(intentParams => this.performSubmission(intentParams))
  }

  private now(): number { return (this.deps.clock ?? Date.now)() }
  private audit(actor: string, action: string, result: string, correlationId: string): void { this.deps.repository.recordAuditEvent({ actor, action, result, correlationId }) }
  /** Submissions run one at a time in this process so two intents cannot pick the same access-key nonce. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(() => fn())
    this.chain = run.catch(() => undefined)
    return run
  }

  /** Everything that currently prevents a submission. Safe to show to users: no secrets. */
  blockers(): SubmitErrorCode[] {
    const out: SubmitErrorCode[] = []
    if (!this.deps.config.enabled || this.deps.bridge.getStatus().mode !== 'real') out.push('SIGNING_DISABLED')
    if (!this.deps.signer) out.push('NO_SIGNER')
    if (!this.deps.config.contractId) out.push('NO_CONTRACT_CONFIGURED')
    return out
  }
  status() {
    return {
      executionMode: this.deps.bridge.getStatus().mode, signingEnabled: this.blockers().length === 0,
      signerAccountId: this.deps.signer?.accountId ?? null, signerPublicKey: this.deps.signer?.publicKey ?? null,
      contractId: this.deps.config.contractId, emergencyStop: this.deps.repository.gate.isStopped(), blockers: this.blockers(),
      note: 'contractId is configuration, not proof of deployment; preflight verifies it on-chain before every submission.',
    }
  }

  /** Read-only reachability check for the Vault. Sends nothing, signs nothing; every failure is reported, never thrown. */
  async probe(): Promise<{ reachable: boolean; chainId: string | null; contractDeployed: boolean | null; ownerMatchesSigner: boolean | null; signerKeyPresent: boolean | null; error?: string }> {
    const { rpc, config, signer } = this.deps
    const out = { reachable: false, chainId: null as string | null, contractDeployed: null as boolean | null, ownerMatchesSigner: null as boolean | null, signerKeyPresent: null as boolean | null }
    try {
      out.chainId = await rpc.chainId(); out.reachable = true
      if (config.contractId) {
        const acct = await rpc.viewAccount(config.contractId)
        out.contractDeployed = !!acct && acct.codeHash !== NO_CONTRACT_CODE_HASH
        if (out.contractDeployed && signer) out.ownerMatchesSigner = (await rpc.viewFunction(config.contractId, 'get_owner', {})) === signer.accountId
      }
      if (signer) out.signerKeyPresent = !!(await rpc.viewAccessKey(signer.accountId, signer.publicKey))
      return out
    } catch (e) { return { ...out, error: String((e as Error).message ?? e).slice(0, 160) } }
  }

  private row(intentId: string): Row | undefined { return this.deps.db.prepare('SELECT * FROM near_submissions WHERE intent_id=?').get(intentId) as Row | undefined }
  private view(r: Row): SubmissionView {
    return { intentId: r.intent_id, auditId: r.audit_id, signerId: r.signer_id, receiverId: r.receiver_id, publicKey: r.public_key, nonce: r.nonce, txHash: r.tx_hash, explorerUrl: explorer(r.tx_hash), startHeight: r.start_height, broadcastCount: r.broadcast_count, lastError: r.last_error, onChainVerified: r.on_chain_verified === null ? null : r.on_chain_verified === 1, outcomeBlockHash: r.outcome_block_hash, createdAt: r.created_at, updatedAt: r.updated_at, payload: describeSignedTx(r.signed_tx) }
  }
  get(intentId: string): { intent: NearIntent; submission: SubmissionView | null } {
    const intent = this.store.get(intentId)
    if (!intent) throw new NearSubmitError('NOT_FOUND')
    const r = this.row(intentId)
    return { intent, submission: r ? this.view(r) : null }
  }
  list(limit = 50): Array<{ intent: NearIntent; submission: SubmissionView | null }> {
    return this.store.list(limit).map(intent => { const r = this.row(intent.id); return { intent, submission: r ? this.view(r) : null } })
  }

  private async rpc<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn() } catch (e) { if (e instanceof NearSubmitError) throw e; throw new NearSubmitError('RPC_ERROR', (e as Error).message.slice(0, 200)) }
  }

  /** Read-only verification of everything the submission depends on. Runs BEFORE the approval is consumed. */
  async preflight(intent: NearIntent): Promise<void> {
    const { signer, config, rpc } = this.deps
    const blockers = this.blockers()
    if (blockers.length) throw new NearSubmitError(blockers[0]!)
    const p = intent.params, s = signer!
    if (p.signerId !== s.accountId) throw new NearSubmitError('SIGNER_MISMATCH', 'the intent names a different signer than the configured one')
    if (p.receiverId !== config.contractId) throw new NearSubmitError('CONTRACT_MISMATCH', 'the intent targets a contract other than NEAR_AUDIT_CONTRACT_ID')
    if (await this.rpc(() => rpc.chainId()) !== 'testnet') throw new NearSubmitError('NETWORK_MISMATCH')
    const contract = await this.rpc(() => rpc.viewAccount(p.receiverId))
    if (!contract || contract.codeHash === NO_CONTRACT_CODE_HASH) throw new NearSubmitError('CONTRACT_NOT_DEPLOYED')
    const owner = await this.rpc(() => rpc.viewFunction(p.receiverId, 'get_owner', {}))
    if (owner !== s.accountId) throw new NearSubmitError('CONTRACT_OWNER_MISMATCH')
    const key = await this.rpc(() => rpc.viewAccessKey(s.accountId, s.publicKey))
    if (!key) throw new NearSubmitError('SIGNER_KEY_NOT_ON_ACCOUNT')
    if (!key.fullAccess && (key.receiverId !== p.receiverId || (key.methodNames?.length && !key.methodNames.includes(AUDIT_METHOD)))) throw new NearSubmitError('SIGNER_KEY_NOT_PERMITTED')
    const acct = await this.rpc(() => rpc.viewAccount(s.accountId))
    if (!acct || BigInt(acct.amount) < config.minBalanceYocto) throw new NearSubmitError('INSUFFICIENT_BALANCE')
    if (this.row(intent.id)) throw new NearSubmitError('DUPLICATE_SUBMISSION')
    if (await this.rpc(() => rpc.viewFunction(p.receiverId, 'get_audit_entry', { audit_id: p.auditId }))) throw new NearSubmitError('ALREADY_RECORDED', 'use reconcile instead of sending again')
  }

  /**
   * Submit an APPROVED intent. Order is fixed: preflight (read-only) -> consume the one-time approval -> CERBERUS grant
   * -> bridge -> sign -> persist signed bytes -> broadcast. A failure after the approval is consumed never re-signs;
   * it leaves the intent in a recoverable state.
   */
  submit(intentId: string, actor: string): Promise<{ intent: NearIntent; submission: SubmissionView | null; error: string | null }> {
    return this.exclusive(async () => {
      const intent = this.store.get(intentId)
      if (!intent) throw new NearSubmitError('NOT_FOUND')
      if (intent.status !== 'APPROVED') throw new NearSubmitError('INVALID_STATE', `intent is ${intent.status}`)
      await this.preflight(intent)
      const claimed = this.store.claimForSigning(intent.id, intent.hash, actor) // throws EMERGENCY_STOP / APPROVAL_EXPIRED / INTENT_CHANGED / POLICY_DENIED:*
      const p = claimed.params
      let error: string | null = null
      try {
        await this.als.run({ intentId, actor }, () => this.deps.bridge.storeAuditHash(
          { auditId: p.auditId, contentHash: p.contentHash, operationType: p.operationType, agentName: p.agentName, decision: p.decision, timestampMs: p.timestampMs },
          claimed.grantId, claimed.params))
      } catch (e) {
        error = (e as Error).message.slice(0, 300)
        this.audit(actor, 'NEAR_SUBMIT', `ERROR:${error.slice(0, 120)}`, intentId)
        const r = this.row(intentId)
        if (r) this.deps.db.prepare('UPDATE near_submissions SET last_error=?, updated_at=? WHERE intent_id=?').run(error, this.now(), intentId)
        else this.store.transition(intentId, 'FAILED', 'system:near-submit') // nothing was signed or broadcast
      }
      return { ...this.get(intentId), error }
    })
  }

  /** Runs inside the bridge, after CERBERUS consumed the grant. */
  private async performSubmission(intentParams: unknown): Promise<NEARTxRecord> {
    const ctx = this.als.getStore()
    if (!ctx) throw new NearSubmitError('CONTEXT_MISSING')
    const { signer, rpc, db } = this.deps
    if (!signer) throw new NearSubmitError('NO_SIGNER')
    const intent = this.store.get(ctx.intentId)
    if (!intent || intent.status !== 'SIGNING') throw new NearSubmitError('INVALID_STATE')
    // The bridge was handed the approved params; they must be byte-for-byte what the intent stores.
    if (canonicalIntent(intentParams).hash !== intent.hash) throw new NearSubmitError('INVALID_STATE', 'parameters differ from the approved intent')
    const p: AuditIntent = intent.params
    if (p.signerId !== signer.accountId) throw new NearSubmitError('SIGNER_MISMATCH')

    const key = await this.rpc(() => rpc.viewAccessKey(signer.accountId, signer.publicKey))
    if (!key) throw new NearSubmitError('SIGNER_KEY_NOT_ON_ACCOUNT')
    const block = await this.rpc(() => rpc.finalBlock())
    const localMax = (db.prepare('SELECT COALESCE(MAX(nonce),0) AS n FROM near_submissions WHERE signer_id=?').get(p.signerId) as { n: number }).n
    const nonce = Math.max(key.nonce, localMax) + 1
    const signed = signer.sign(buildAuditTransaction(p, { publicKey: signer.publicKey, nonce, blockHash: block.hash }))
    // Persist the exact signed bytes BEFORE any broadcast: from here on every retry re-sends identical bytes.
    db.prepare('INSERT INTO near_submissions (intent_id,audit_id,signer_id,receiver_id,public_key,nonce,block_hash,signed_tx,tx_hash,start_height,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(intent.id, p.auditId, p.signerId, p.receiverId, signer.publicKey, nonce, block.hash, signed.base64, signed.hash, block.height, this.now(), this.now())
    this.store.transition(intent.id, 'BROADCAST_PENDING', ctx.actor)
    this.audit(ctx.actor, 'NEAR_SIGNED', signed.hash, intent.id)
    await this.broadcastStored(intent.id, ctx.actor)
    return { auditId: p.auditId, txHash: signed.hash, explorerUrl: explorer(signed.hash), blockHeight: 0, timestamp: this.now(), mode: 'real', status: 'BROADCASTED' }
  }

  private async broadcastStored(intentId: string, actor: string): Promise<void> {
    const r = this.row(intentId)!
    try { await this.rpc(() => this.deps.rpc.broadcast(r.signed_tx)) } catch (e) {
      this.deps.db.prepare('UPDATE near_submissions SET last_error=?, updated_at=? WHERE intent_id=?').run((e as Error).message.slice(0, 300), this.now(), intentId)
      throw e
    }
    this.deps.db.prepare('UPDATE near_submissions SET broadcast_count=broadcast_count+1, last_error=NULL, updated_at=? WHERE intent_id=?').run(this.now(), intentId)
    const status = this.store.get(intentId)!.status
    if (status === 'BROADCAST_PENDING') this.store.transition(intentId, 'BROADCASTED', actor)
    this.audit(actor, 'NEAR_BROADCAST', r.tx_hash, intentId)
  }

  private matchesOnChain(entry: unknown, p: AuditIntent): boolean {
    const e = entry as { audit_id?: string; content_hash?: string; decision?: string } | null
    return !!e && e.audit_id === p.auditId && e.content_hash === p.contentHash && e.decision === p.decision
  }

  /**
   * Advances an in-flight submission using read-only queries. It re-sends the stored signed bytes only if signing is
   * enabled and the emergency stop is off; it never signs again.
   */
  refresh(intentId: string, actor: string): Promise<{ intent: NearIntent; submission: SubmissionView | null; error: string | null }> {
    return this.exclusive(async () => {
      let intent = this.store.get(intentId)
      if (!intent) throw new NearSubmitError('NOT_FOUND')
      const r = this.row(intentId)
      const p = intent.params
      if (intent.status === 'SIGNING' && !r) {
        // Crashed after consuming the approval but before persisting a signature: nothing exists on the network.
        this.store.transition(intentId, 'FAILED', actor)
        this.audit(actor, 'NEAR_RECOVERY', 'FAILED:nothing-signed', intentId)
      } else if (r && ['BROADCAST_PENDING', 'BROADCASTED'].includes(intent.status)) {
        const st = await this.rpc(() => this.deps.rpc.txStatus(r.tx_hash, r.signer_id))
        if (st.state === 'SUCCESS') {
          if (intent.status === 'BROADCAST_PENDING') intent = this.store.transition(intentId, 'BROADCASTED', actor)
          const entry = await this.rpc(() => this.deps.rpc.viewFunction(r.receiver_id, 'get_audit_entry', { audit_id: p.auditId }))
          const verified = this.matchesOnChain(entry, p)
          this.deps.db.prepare('UPDATE near_submissions SET on_chain_verified=?, outcome_block_hash=?, updated_at=? WHERE intent_id=?').run(verified ? 1 : 0, st.blockHash ?? null, this.now(), intentId)
          this.store.transition(intentId, verified ? 'CONFIRMED' : 'RECONCILIATION_REQUIRED', actor)
          this.audit(actor, 'NEAR_CONFIRMED', `${verified ? 'VERIFIED' : 'MISMATCH'}:${r.tx_hash}`, intentId)
        } else if (st.state === 'FAILURE') {
          if (intent.status === 'BROADCAST_PENDING') intent = this.store.transition(intentId, 'BROADCASTED', actor)
          this.deps.db.prepare('UPDATE near_submissions SET last_error=?, outcome_block_hash=?, updated_at=? WHERE intent_id=?').run(st.error ?? 'FAILURE', st.blockHash ?? null, this.now(), intentId)
          this.store.transition(intentId, 'FAILED', actor)
          this.audit(actor, 'NEAR_FAILED', r.tx_hash, intentId)
        } else if (st.state === 'PENDING') {
          if (intent.status === 'BROADCAST_PENDING') this.store.transition(intentId, 'BROADCASTED', actor)
        } else { // UNKNOWN to the network
          const height = await this.rpc(() => this.deps.rpc.latestHeight())
          if (height - r.start_height > SAFE_VALIDITY_BLOCKS) {
            this.store.transition(intentId, 'RECONCILIATION_REQUIRED', actor)
            this.audit(actor, 'NEAR_RECOVERY', 'RECONCILIATION_REQUIRED:signature-expired', intentId)
          } else if (this.deps.config.enabled && !this.deps.repository.gate.isStopped()) {
            await this.broadcastStored(intentId, actor) // identical bytes: the network deduplicates by hash
          }
        }
      } else if (intent.status === 'RECONCILIATION_REQUIRED') {
        return this.reconcileInner(intentId, actor)
      }
      return { ...this.get(intentId), error: null }
    })
  }

  /** Decides a RECONCILIATION_REQUIRED intent from on-chain contract state alone. Never sends anything. */
  reconcile(intentId: string, actor: string) { return this.exclusive(() => this.reconcileInner(intentId, actor)) }
  private async reconcileInner(intentId: string, actor: string): Promise<{ intent: NearIntent; submission: SubmissionView | null; error: string | null }> {
    const intent = this.store.get(intentId)
    if (!intent) throw new NearSubmitError('NOT_FOUND')
    if (intent.status !== 'RECONCILIATION_REQUIRED') throw new NearSubmitError('INVALID_STATE', `intent is ${intent.status}`)
    const entry = await this.rpc(() => this.deps.rpc.viewFunction(intent.params.receiverId, 'get_audit_entry', { audit_id: intent.params.auditId }))
    if (this.matchesOnChain(entry, intent.params)) {
      this.deps.db.prepare('UPDATE near_submissions SET on_chain_verified=1, updated_at=? WHERE intent_id=?').run(this.now(), intentId)
      this.store.transition(intentId, 'CONFIRMED', actor)
      this.audit(actor, 'NEAR_RECONCILED', 'CONFIRMED:contract-state', intentId)
      return { ...this.get(intentId), error: null }
    }
    if (entry) { // same audit id recorded with different content: this intent can never succeed
      this.store.transition(intentId, 'FAILED', actor)
      this.audit(actor, 'NEAR_RECONCILED', 'FAILED:conflicting-entry', intentId)
      return { ...this.get(intentId), error: 'audit id already recorded on-chain with different content' }
    }
    return { ...this.get(intentId), error: 'not recorded on-chain; a new intent with a new human approval is required to retry' }
  }

  /** Startup/periodic recovery for every in-flight intent. Read-only unless signing is enabled and not stopped. */
  async recoverAll(actor = 'system:near-recovery'): Promise<number> {
    const open = this.store.list(200).filter(i => ['SIGNING', 'BROADCAST_PENDING', 'BROADCASTED', 'RECONCILIATION_REQUIRED'].includes(i.status))
    for (const i of open) { try { await this.refresh(i.id, actor) } catch (e) { this.audit(actor, 'NEAR_RECOVERY', `ERROR:${(e as Error).message.slice(0, 100)}`, i.id) } }
    return open.length
  }
}

export function nearServiceConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NearServiceConfig {
  const contractId = env['NEAR_AUDIT_CONTRACT_ID'] || null
  if (contractId && !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(contractId)) throw new Error('NEAR_AUDIT_CONTRACT_ID must be a .testnet account')
  return { enabled: env['NEAR_SIGNING_ENABLED'] === 'true', contractId, minBalanceYocto: BigInt(env['NEAR_MIN_SIGNER_BALANCE_YOCTO'] ?? '50000000000000000000000') }
}
