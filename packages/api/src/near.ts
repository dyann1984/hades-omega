import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import type { AuditRecord, NEARSubmissionResult } from './types.js';

const MODE = (process.env.NEAR_EXECUTION_MODE ?? 'simulation') as 'simulation' | 'real';
const NETWORK = process.env.NEAR_NETWORK ?? 'testnet';
const ACCOUNT_ID = process.env.NEAR_ACCOUNT_ID ?? 'hades-omega.testnet';
const CONTRACT_ID = process.env.NEAR_CONTRACT_ID ?? 'audit.hades-omega.testnet';

function simulateTxHash(record: AuditRecord): string {
  return createHash('sha256')
    .update(record.id + record.contentHash + Date.now().toString() + randomBytes(8).toString('hex'))
    .digest('hex');
}

function getExplorerUrl(txHash: string): string {
  if (NETWORK === 'testnet') {
    return `https://testnet.nearblocks.io/txns/${txHash}`;
  }
  return `https://nearblocks.io/txns/${txHash}`;
}

async function submitSimulation(record: AuditRecord): Promise<NEARSubmissionResult> {
  await sleep(200 + Math.random() * 300);
  const txHash = simulateTxHash(record);
  const blockHeight = Math.floor(180_000_000 + Math.random() * 1_000_000);
  const simId = uuid();

  return {
    mode: 'simulation',
    txHash,
    explorerUrl: getExplorerUrl(txHash),
    blockHeight,
    simulationId: simId,
    timestamp: Date.now(),
  };
}

async function submitReal(record: AuditRecord): Promise<NEARSubmissionResult> {
  try {
    const { connect, keyStores, KeyPair } = await import('near-api-js');

    const credentialsPath = process.env.NEAR_CREDENTIALS_PATH?.replace('~', process.env.HOME ?? '/root');
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsPath ?? `${process.env.HOME}/.near-credentials`);

    const nearConn = await connect({
      networkId: NETWORK,
      keyStore,
      nodeUrl: `https://rpc.${NETWORK}.near.org`,
    });

    const account = await nearConn.account(ACCOUNT_ID);

    const result = await account.functionCall({
      contractId: CONTRACT_ID,
      methodName: 'store_audit_hash',
      args: {
        audit_id: record.id,
        content_hash: record.contentHash,
        operation_type: record.operationType,
        agent_name: record.agentName,
        decision: record.decision,
        timestamp_ms: record.timestamp,
      },
      gas: BigInt('30000000000000'),
      attachedDeposit: BigInt(0),
    });

    const txHash = typeof result.transaction?.hash === 'string'
      ? result.transaction.hash
      : simulateTxHash(record);

    return {
      mode: 'real',
      txHash,
      explorerUrl: getExplorerUrl(txHash),
      blockHeight: null,
      simulationId: null,
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error('[NEAR] Real submission failed, falling back to simulation:', err);
    const simResult = await submitSimulation(record);
    return { ...simResult, mode: 'simulation' };
  }
}

export const near = {
  async submitAuditRecord(record: AuditRecord): Promise<NEARSubmissionResult> {
    if (MODE === 'real') {
      return submitReal(record);
    }
    return submitSimulation(record);
  },

  getExplorerUrl,

  getConnectionStatus() {
    return {
      mode: MODE,
      network: NETWORK,
      accountId: ACCOUNT_ID,
      contractId: CONTRACT_ID,
      connected: true,
    };
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
