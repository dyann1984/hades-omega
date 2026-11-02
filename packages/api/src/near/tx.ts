import { transactions, utils } from 'near-api-js'
import type { AuditIntent } from '../near-intents.js'

export const AUDIT_METHOD = 'store_audit_hash'
export const AUDIT_GAS = 30_000_000_000_000n
export const ZERO_DEPOSIT = 0n

/** Arguments of the contract method, derived only from the approved intent; nothing else can reach the chain. */
export function auditCallArgs(p: AuditIntent): Record<string, string | number> {
  return { audit_id: p.auditId, content_hash: p.contentHash, operation_type: p.operationType, agent_name: p.agentName, decision: p.decision, timestamp_ms: p.timestampMs }
}

/** Exactly one FunctionCall action, fixed method, fixed gas, zero deposit. No other action type can be produced here. */
export function buildAuditTransaction(p: AuditIntent, ctx: { publicKey: string; nonce: number; blockHash: string }): transactions.Transaction {
  if (p.network !== 'testnet' || p.amountYocto !== '0' || BigInt(p.gas) !== AUDIT_GAS) throw new Error('NEAR_TX_PARAMS_INVALID')
  if (!Number.isSafeInteger(ctx.nonce) || ctx.nonce < 1) throw new Error('NEAR_TX_NONCE_INVALID')
  const action = transactions.functionCall(AUDIT_METHOD, auditCallArgs(p), AUDIT_GAS, ZERO_DEPOSIT)
  return transactions.createTransaction(p.signerId, utils.PublicKey.from(ctx.publicKey), p.receiverId, ctx.nonce, [action], utils.serialize.base_decode(ctx.blockHash))
}

/** Independent decoder used by the review UI/tests to show what a signed payload really contains. */
export function describeSignedTx(base64: string): { signerId: string; receiverId: string; nonce: number; actions: Array<{ type: string; method?: string; gas?: string; deposit?: string; args?: unknown }> } {
  const signed = transactions.SignedTransaction.decode(Buffer.from(base64, 'base64'))
  const t = signed.transaction
  return {
    signerId: t.signerId, receiverId: t.receiverId, nonce: Number(t.nonce),
    actions: t.actions.map(a => {
      if (a.functionCall) return { type: 'FunctionCall', method: a.functionCall.methodName, gas: a.functionCall.gas.toString(), deposit: a.functionCall.deposit.toString(), args: JSON.parse(Buffer.from(a.functionCall.args).toString('utf8')) }
      return { type: Object.keys(a)[0] ?? 'Unknown' }
    }),
  }
}
