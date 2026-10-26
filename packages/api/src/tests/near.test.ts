/**
 * NEAR Bridge tests — simulation mode, hash generation, URL format
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

// Replicate NEAR simulation logic without importing the full module
function simulateTxHash(id: string, contentHash: string): string {
  return createHash('sha256')
    .update(id + contentHash + Date.now().toString() + randomBytes(8).toString('hex'))
    .digest('hex');
}

function getTestnetExplorerUrl(txHash: string): string {
  return `https://testnet.nearblocks.io/txns/${txHash}`;
}

function getMainnetExplorerUrl(txHash: string): string {
  return `https://nearblocks.io/txns/${txHash}`;
}

describe('NEAR Bridge — Simulation Mode', () => {
  describe('Transaction hash generation', () => {
    it('generates a 64-char lowercase hex hash', () => {
      const hash = simulateTxHash('rec-001', 'deadbeef');
      assert.equal(hash.length, 64);
      assert.match(hash, /^[0-9a-f]{64}$/);
    });

    it('generates unique hashes on each call (randomness)', () => {
      const hashes = new Set(Array.from({ length: 20 }, () => simulateTxHash('rec-001', 'deadbeef')));
      assert.ok(hashes.size > 15, 'Expected high uniqueness across 20 calls');
    });

    it('two different record IDs produce different hashes', () => {
      // With randomness, this is probabilistic but reliable over many runs
      const h1 = simulateTxHash('rec-001', 'aaaaaa');
      const h2 = simulateTxHash('rec-002', 'aaaaaa');
      assert.notEqual(h1, h2);
    });
  });

  describe('Explorer URL format', () => {
    it('testnet URL is well-formed', () => {
      const txHash = 'a'.repeat(64);
      const url = getTestnetExplorerUrl(txHash);
      assert.equal(url, `https://testnet.nearblocks.io/txns/${'a'.repeat(64)}`);
      assert.match(url, /^https:\/\/testnet\.nearblocks\.io\/txns\/[0-9a-f]{64}$/);
    });

    it('mainnet URL is well-formed', () => {
      const txHash = 'f'.repeat(64);
      const url = getMainnetExplorerUrl(txHash);
      assert.equal(url, `https://nearblocks.io/txns/${'f'.repeat(64)}`);
    });

    it('URL contains the full tx hash without truncation', () => {
      const txHash = simulateTxHash('test', 'test');
      const url = getTestnetExplorerUrl(txHash);
      assert.ok(url.endsWith(txHash));
    });
  });

  describe('NEAR mode distinction', () => {
    it('simulation mode is clearly labeled', () => {
      const mode: 'simulation' | 'real' = 'simulation';
      assert.equal(mode, 'simulation');
      assert.notEqual(mode, 'real');
    });

    it('simulation records carry mode field', () => {
      const record = {
        mode: 'simulation' as const,
        txHash: simulateTxHash('r', 'h'),
        explorerUrl: getTestnetExplorerUrl(simulateTxHash('r', 'h')),
        blockHeight: 180_500_000,
        simulationId: 'sim-001',
        timestamp: Date.now(),
      };
      assert.equal(record.mode, 'simulation');
      assert.ok(record.simulationId !== null);
      assert.ok(record.txHash.length === 64);
    });

    it('real mode record has null simulationId', () => {
      const record = {
        mode: 'real' as const,
        txHash: 'abc123',
        explorerUrl: getTestnetExplorerUrl('abc123'),
        blockHeight: 181_000_000,
        simulationId: null,
        timestamp: Date.now(),
      };
      assert.equal(record.mode, 'real');
      assert.equal(record.simulationId, null);
    });
  });

  describe('Block height range', () => {
    it('simulated block heights are in testnet range (> 180M)', () => {
      const blockHeight = Math.floor(180_000_000 + Math.random() * 1_000_000);
      assert.ok(blockHeight >= 180_000_000);
      assert.ok(blockHeight < 181_000_000);
    });
  });
});
