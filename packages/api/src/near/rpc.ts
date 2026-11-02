import { providers } from 'near-api-js'

export const NO_CONTRACT_CODE_HASH = '11111111111111111111111111111111'

export interface AccountView { amount: string; codeHash: string; blockHeight: number }
export interface AccessKeyView { nonce: number; fullAccess: boolean; receiverId?: string; methodNames?: string[]; /** yocto remaining for a FunctionCall key; null = unlimited */ allowance?: string | null }
export type TxState = 'UNKNOWN' | 'PENDING' | 'SUCCESS' | 'FAILURE'
export interface TxStatusView { state: TxState; blockHash?: string; error?: string }

/** The only network surface the submission code uses. Tests replace it; production uses JsonRpcNearRpc. */
export interface NearRpc {
  chainId(): Promise<string>
  latestHeight(): Promise<number>
  finalBlock(): Promise<{ hash: string; height: number }>
  /** null when the account does not exist. */
  viewAccount(accountId: string): Promise<AccountView | null>
  /** null when the key does not exist on the account. */
  viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyView | null>
  viewFunction(contractId: string, method: string, args: Record<string, unknown>): Promise<unknown>
  /** Submits already-signed bytes without waiting. Safe to repeat: the network deduplicates by transaction hash. */
  broadcast(signedTxBase64: string): Promise<void>
  txStatus(txHash: string, senderId: string): Promise<TxStatusView>
}

const ALLOWED_RPC_HOSTS = new Set(['rpc.testnet.near.org', 'test.rpc.fastnear.com', 'rpc.testnet.pagoda.co'])

/** The RPC URL must be a known testnet endpoint; mainnet endpoints are refused outright. */
export function assertTestnetRpcUrl(url: string): void {
  let host: string
  try { const u = new URL(url); if (u.protocol !== 'https:') throw new Error(); host = u.hostname } catch { throw new Error('NEAR_RPC_URL_INVALID') }
  if (!ALLOWED_RPC_HOSTS.has(host)) throw new Error('NEAR_RPC_HOST_NOT_ALLOWED')
}

const errName = (e: unknown): string => {
  const o = e as { type?: string; name?: string; message?: string; cause?: { name?: string } }
  return `${o?.type ?? ''}|${o?.name ?? ''}|${o?.cause?.name ?? ''}|${o?.message ?? ''}`
}

export class JsonRpcNearRpc implements NearRpc {
  private readonly provider: providers.JsonRpcProvider
  constructor(url = process.env['NEAR_RPC_URL'] ?? 'https://rpc.testnet.near.org') {
    assertTestnetRpcUrl(url)
    this.provider = new providers.JsonRpcProvider({ url })
  }
  async chainId(): Promise<string> { return (await this.provider.status()).chain_id }
  async latestHeight(): Promise<number> { return (await this.provider.status()).sync_info.latest_block_height }
  async finalBlock(): Promise<{ hash: string; height: number }> {
    const b = await this.provider.block({ finality: 'final' })
    return { hash: b.header.hash, height: b.header.height }
  }
  async viewAccount(accountId: string): Promise<AccountView | null> {
    try {
      const r = await this.provider.query({ request_type: 'view_account', finality: 'final', account_id: accountId }) as unknown as { amount: string; code_hash: string; block_height: number }
      if (typeof r.amount !== 'string' || typeof r.code_hash !== 'string' || !Number.isSafeInteger(r.block_height)) throw new Error('NEAR_INVALID_RESPONSE')
      return { amount: r.amount, codeHash: r.code_hash, blockHeight: r.block_height }
    } catch (e) { if (/UNKNOWN_ACCOUNT|(does not|doesn't) exist|UnknownAccount|AccountDoesNotExist/i.test(errName(e))) return null; throw e }
  }
  async viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyView | null> {
    try {
      const r = await this.provider.query({ request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey }) as unknown as { nonce: number | string; permission: 'FullAccess' | { FunctionCall: { receiver_id: string; method_names: string[]; allowance?: string | null } } }
      const nonce = Number(r.nonce)
      if (!Number.isSafeInteger(nonce)) throw new Error('NEAR_INVALID_RESPONSE')
      if (r.permission === 'FullAccess') return { nonce, fullAccess: true }
      return { nonce, fullAccess: false, receiverId: r.permission.FunctionCall.receiver_id, methodNames: r.permission.FunctionCall.method_names, allowance: r.permission.FunctionCall.allowance ?? null }
    } catch (e) { if (/UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT|(does not|doesn't) exist|UnknownAccessKey|AccessKeyDoesNotExist|AccountDoesNotExist/i.test(errName(e))) return null; throw e }
  }
  async viewFunction(contractId: string, method: string, args: Record<string, unknown>): Promise<unknown> {
    const r = await this.provider.query({ request_type: 'call_function', finality: 'final', account_id: contractId, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') }) as unknown as { result: number[] }
    if (!Array.isArray(r.result)) throw new Error('NEAR_INVALID_RESPONSE')
    return JSON.parse(Buffer.from(r.result).toString('utf8'))
  }
  async broadcast(signedTxBase64: string): Promise<void> {
    await this.provider.sendJsonRpc('broadcast_tx_async', [signedTxBase64])
  }
  async txStatus(txHash: string, senderId: string): Promise<TxStatusView> {
    try {
      const r = await this.provider.sendJsonRpc('tx', { tx_hash: txHash, sender_account_id: senderId, wait_until: 'NONE' }) as { final_execution_status?: string; status?: { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown }; transaction_outcome?: { block_hash?: string } }
      const blockHash = r.transaction_outcome?.block_hash
      if (r.status?.Failure) return { state: 'FAILURE', ...(blockHash ? { blockHash } : {}), error: JSON.stringify(r.status.Failure).slice(0, 300) }
      if (r.status && ('SuccessValue' in r.status || 'SuccessReceiptId' in r.status)) {
        // Confirmation needs finality, not just optimistic execution.
        return { state: r.final_execution_status === 'FINAL' ? 'SUCCESS' : 'PENDING', ...(blockHash ? { blockHash } : {}) }
      }
      return { state: 'PENDING' }
    } catch (e) {
      if (/UNKNOWN_TRANSACTION|(does not|doesn't) exist|UnknownTransaction|TransactionDoesNotExist/i.test(errName(e))) return { state: 'UNKNOWN' }
      // The node did not see the transaction within its wait window: treat as not seen. Re-sending identical bytes is harmless.
      if (/TIMEOUT|RequestTimeout|408/i.test(errName(e))) return { state: 'UNKNOWN' }
      throw e
    }
  }
}
