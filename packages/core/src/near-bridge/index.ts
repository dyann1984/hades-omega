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

// Simulates NEAR Testnet transactions when NEAR_EXECUTION_MODE != 'real'
export class NEARBridge {
  private mode: ExecutionMode
  private txRecords: Map<string, NEARTxRecord> = new Map()
  private networkId = 'testnet'
  private contractId = 'audit.hades-omega.testnet'

  constructor() {
    const configured = process.env['NEAR_EXECUTION_MODE'] ?? 'simulation'
    if (!['simulation', 'demo', 'real', 'testnet', 'mainnet'].includes(configured.toLowerCase())) throw new Error('Invalid NEAR_EXECUTION_MODE')
    this.mode = ['simulation', 'demo'].includes(configured.toLowerCase()) ? 'simulation' : 'real'
  }

  async storeAuditHash(params: {
    auditId:       string
    contentHash:   string
    operationType: string
    agentName:     string
    decision:      string
    timestampMs:   number
  }): Promise<NEARTxRecord> {
    if (this.mode === 'real') {
      return this.executeRealTransaction(params)
    }
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
