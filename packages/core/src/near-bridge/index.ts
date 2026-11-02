import type { ExecutionMode } from '../types/index.js'

export interface NEARTxRecord {
  auditId:     string
  txHash:      string
  explorerUrl: string
  blockHeight: number
  timestamp:   number
  mode:        ExecutionMode
}

export interface NEARBridgeStatus {
  connected:     boolean
  networkId:     string
  contractId:    string
  mode:          ExecutionMode
  txCount:       number
  lastTxAt:      number | null
}

/** Verifies and burns a single-use CERBERUS grant for exactly these parameters; throws if it is not valid. */
export interface ExecutionGate {
  consumeGrant(grantId: string, tool: string, params: unknown): void
}

export const NEAR_SUBMIT_TOOL = 'near.audit_hash_submit'

// Simulates NEAR Testnet transactions when NEAR_EXECUTION_MODE != 'real'
export class NEARBridge {
  private mode: ExecutionMode
  private txRecords: Map<string, NEARTxRecord> = new Map()
  private networkId = 'testnet'
  private contractId = 'audit.hades-omega.testnet'
  private gate: ExecutionGate | undefined

  /** The gate can be attached once; it cannot be replaced or removed afterwards. */
  attachGate(gate: ExecutionGate): void {
    if (this.gate && this.gate !== gate) throw new Error('CERBERUS_GATE_ALREADY_ATTACHED')
    this.gate = gate
  }

  constructor() {
    const configured = process.env['NEAR_EXECUTION_MODE'] ?? 'simulation'
    if (!['simulation', 'demo', 'real', 'testnet', 'mainnet'].includes(configured.toLowerCase())) throw new Error('Invalid NEAR_EXECUTION_MODE')
    this.mode = ['simulation', 'demo'].includes(configured.toLowerCase()) ? 'simulation' : 'real'
  }

  /** Read-only checks against the official testnet RPC. Never signs or submits a transaction. */
  async verifyTestnetAccount(accountId: string, fetcher: typeof fetch = fetch): Promise<{ networkId: 'testnet'; accountId: string; blockHeight: number }> {
    if (accountId.length > 64 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(accountId)) throw new Error('INVALID_TESTNET_ACCOUNT')
    const call = async (method: string, params: unknown): Promise<any> => {
      const response = await fetcher('https://rpc.testnet.near.org', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'hades-read-only', method, params }),
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw new Error('NEAR_RPC_HTTP_ERROR')
      const body = await response.json() as { result?: unknown; error?: unknown }
      if (body.error || !body.result || typeof body.result !== 'object') throw new Error('NEAR_RPC_ERROR')
      return body.result
    }
    const status = await call('status', [])
    if (status.chain_id !== 'testnet') throw new Error('NEAR_NETWORK_MISMATCH')
    const account = await call('query', { request_type: 'view_account', finality: 'final', account_id: accountId })
    if (!Number.isSafeInteger(account.block_height) || account.block_height < 1 || typeof account.amount !== 'string') throw new Error('NEAR_INVALID_RESPONSE')
    return { networkId: 'testnet', accountId, blockHeight: account.block_height }
  }

  async storeAuditHash(params: {
    auditId:       string
    contentHash:   string
    operationType: string
    agentName:     string
    decision:      string
    timestampMs:   number
  }, grantId?: string, intentParams?: unknown): Promise<NEARTxRecord> {
    if (this.mode === 'real') {
      // Fail closed: a real transaction needs a gate and a valid single-use grant bound to the exact parameters.
      if (!this.gate) throw new Error('CERBERUS_GATE_REQUIRED')
      if (typeof grantId !== 'string' || intentParams === undefined) throw new Error('CERBERUS_GRANT_REQUIRED')
      this.gate.consumeGrant(grantId, NEAR_SUBMIT_TOOL, intentParams)
      return this.executeRealTransaction(params)
    }
    // Simulation has no external effect: it only writes a labelled in-memory record.
    return this.simulateTransaction(params)
  }

  private async simulateTransaction(params: {
    auditId:     string
    contentHash: string
    decision:    string
  }): Promise<NEARTxRecord> {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300))

    const txHash = `DEMO-${this.generateSimulatedTxHash()}`
    const blockHeight = 0

    const record: NEARTxRecord = {
      auditId:     params.auditId,
      txHash,
      explorerUrl: '',
      blockHeight,
      timestamp:   Date.now(),
      mode:        'simulation',
    }
    this.txRecords.set(params.auditId, record)
    return record
  }

  private async executeRealTransaction(_params: object): Promise<NEARTxRecord> {
    // Real NEAR integration requires near-api-js + credentials
    // For hackathon demo this path needs NEAR_EXECUTION_MODE=real + credentials
    throw new Error('NEAR real execution requires credentials and near-api-js setup')
  }

  private generateSimulatedTxHash(): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    return Array.from({ length: 44 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  getStatus(): NEARBridgeStatus {
    return {
      connected:  false,
      networkId:  this.networkId,
      contractId: this.contractId,
      mode:       this.mode,
      txCount:    this.txRecords.size,
      lastTxAt:   this.txRecords.size > 0
        ? Math.max(...Array.from(this.txRecords.values()).map(t => t.timestamp))
        : null,
    }
  }

  getTransaction(auditId: string): NEARTxRecord | null {
    return this.txRecords.get(auditId) ?? null
  }

  getAllTransactions(): NEARTxRecord[] {
    return Array.from(this.txRecords.values()).sort((a, b) => b.timestamp - a.timestamp)
  }
}
