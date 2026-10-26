/**
 * SQLite persistence tests — write, read back, WAL mode, data integrity across module boundary
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

let db: ReturnType<typeof Database>;
let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'hades-test-'));
  db = new Database(join(tmpDir, 'test.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_records (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      decision TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      human_approved_by TEXT,
      near_tx_hash TEXT,
      near_explorer_url TEXT,
      near_mode TEXT NOT NULL DEFAULT 'simulation',
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_records(timestamp DESC);
  `);
});

after(() => {
  db.close();
  rmSync(tmpDir, { recursive: true });
});

function insertAuditRecord(r: {
  id: string; proposalId: string; agentName: string; operationType: string;
  decision: string; contentHash: string; metadata: object;
  humanApprovedBy?: string; nearTxHash?: string; nearExplorerUrl?: string;
  nearMode: string; timestamp: number;
}) {
  db.prepare(`
    INSERT OR REPLACE INTO audit_records
    (id, proposal_id, agent_name, operation_type, decision, content_hash, metadata_json,
     human_approved_by, near_tx_hash, near_explorer_url, near_mode, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    r.id, r.proposalId, r.agentName, r.operationType, r.decision,
    r.contentHash, JSON.stringify(r.metadata),
    r.humanApprovedBy ?? null, r.nearTxHash ?? null, r.nearExplorerUrl ?? null,
    r.nearMode, r.timestamp
  );
}

describe('SQLite Persistence', () => {
  describe('Audit record CRUD', () => {
    it('saves and retrieves a PERMIT audit record', () => {
      insertAuditRecord({
        id: 'ar-001',
        proposalId: 'prop-001',
        agentName: 'CHARON',
        operationType: 'PURCHASE_ORDER',
        decision: 'PERMIT',
        contentHash: 'abc123',
        metadata: { amount: 9999, currency: 'MXN' },
        nearMode: 'simulation',
        timestamp: 1700000001000,
      });

      const row = db.prepare('SELECT * FROM audit_records WHERE id = ?').get('ar-001') as Record<string, unknown>;
      assert.ok(row, 'Record should exist');
      assert.equal(row.id, 'ar-001');
      assert.equal(row.agent_name, 'CHARON');
      assert.equal(row.decision, 'PERMIT');
      assert.equal(row.near_mode, 'simulation');
      assert.equal(row.human_approved_by, null);
    });

    it('saves and retrieves an ESCALATE record with human approval', () => {
      insertAuditRecord({
        id: 'ar-002',
        proposalId: 'prop-002',
        agentName: 'CHARON',
        operationType: 'PURCHASE_ORDER',
        decision: 'PERMIT',
        contentHash: 'def456',
        metadata: { amount: 38500, currency: 'MXN' },
        humanApprovedBy: 'operator@hades-omega.demo',
        nearTxHash: 'a'.repeat(64),
        nearExplorerUrl: 'https://testnet.nearblocks.io/txns/' + 'a'.repeat(64),
        nearMode: 'simulation',
        timestamp: 1700000002000,
      });

      const row = db.prepare('SELECT * FROM audit_records WHERE id = ?').get('ar-002') as Record<string, unknown>;
      assert.equal(row.human_approved_by, 'operator@hades-omega.demo');
      assert.equal(row.near_tx_hash, 'a'.repeat(64));
      assert.ok((row.near_explorer_url as string).startsWith('https://testnet.nearblocks.io/txns/'));
    });

    it('saves and retrieves a DENY record', () => {
      insertAuditRecord({
        id: 'ar-003',
        proposalId: 'prop-003',
        agentName: 'CHARON',
        operationType: 'PURCHASE_ORDER',
        decision: 'DENY',
        contentHash: 'ghi789',
        metadata: { amount: 55000, currency: 'MXN', reason: 'Exceeds limit' },
        nearMode: 'simulation',
        timestamp: 1700000003000,
      });

      const row = db.prepare('SELECT * FROM audit_records WHERE id = ?').get('ar-003') as Record<string, unknown>;
      assert.equal(row.decision, 'DENY');
      assert.equal(row.human_approved_by, null);
      assert.equal(row.near_tx_hash, null);
    });
  });

  describe('Ordering and limits', () => {
    it('returns records in descending timestamp order', () => {
      const rows = db.prepare('SELECT id, timestamp FROM audit_records ORDER BY timestamp DESC').all() as { id: string; timestamp: number }[];
      assert.ok(rows.length >= 3);
      for (let i = 0; i < rows.length - 1; i++) {
        assert.ok(rows[i].timestamp >= rows[i + 1].timestamp);
      }
    });

    it('LIMIT clause works correctly', () => {
      const rows = db.prepare('SELECT * FROM audit_records ORDER BY timestamp DESC LIMIT 2').all();
      assert.equal(rows.length, 2);
    });
  });

  describe('UPDATE (NEAR hash backfill)', () => {
    it('updates near_tx_hash after simulation', () => {
      insertAuditRecord({
        id: 'ar-004',
        proposalId: 'prop-004',
        agentName: 'PERSEPHONE',
        operationType: 'BUDGET_COMMITMENT',
        decision: 'PERMIT',
        contentHash: 'jkl012',
        metadata: { amount: 45000 },
        nearMode: 'simulation',
        timestamp: 1700000004000,
      });

      db.prepare('UPDATE audit_records SET near_tx_hash = ?, near_explorer_url = ? WHERE id = ?')
        .run('b'.repeat(64), 'https://testnet.nearblocks.io/txns/' + 'b'.repeat(64), 'ar-004');

      const row = db.prepare('SELECT near_tx_hash FROM audit_records WHERE id = ?').get('ar-004') as { near_tx_hash: string };
      assert.equal(row.near_tx_hash, 'b'.repeat(64));
    });
  });

  describe('INSERT OR REPLACE idempotency', () => {
    it('re-inserting the same id updates the record', () => {
      insertAuditRecord({ id: 'ar-005', proposalId: 'p', agentName: 'HADES', operationType: 'AUDIT', decision: 'PERMIT', contentHash: 'v1', metadata: {}, nearMode: 'simulation', timestamp: 1 });
      insertAuditRecord({ id: 'ar-005', proposalId: 'p', agentName: 'HADES', operationType: 'AUDIT', decision: 'DENY', contentHash: 'v2', metadata: {}, nearMode: 'simulation', timestamp: 2 });

      const row = db.prepare('SELECT decision, content_hash FROM audit_records WHERE id = ?').get('ar-005') as { decision: string; content_hash: string };
      assert.equal(row.decision, 'DENY');
      assert.equal(row.content_hash, 'v2');
    });
  });

  describe('WAL mode', () => {
    it('journal_mode is WAL', () => {
      const result = db.pragma('journal_mode', { simple: true }) as string;
      assert.equal(result, 'wal');
    });

    it('foreign_keys are ON', () => {
      const result = db.pragma('foreign_keys', { simple: true }) as number;
      assert.equal(result, 1);
    });
  });

  describe('Metadata JSON round-trip', () => {
    it('stores and retrieves nested metadata faithfully', () => {
      const metadata = { amount: 38500, currency: 'MXN', vendorId: 'v002', scores: { quality: 92, price: 78 } };
      insertAuditRecord({ id: 'ar-006', proposalId: 'p6', agentName: 'CHARON', operationType: 'PURCHASE_ORDER', decision: 'PERMIT', contentHash: 'xyz', metadata, nearMode: 'simulation', timestamp: 1700000005000 });
      const row = db.prepare('SELECT metadata_json FROM audit_records WHERE id = ?').get('ar-006') as { metadata_json: string };
      const parsed = JSON.parse(row.metadata_json);
      assert.deepEqual(parsed, metadata);
    });
  });
});
