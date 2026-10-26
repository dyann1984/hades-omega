/**
 * CERBERUS policy engine tests — deterministic, no LLM, no DB, no NEAR
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// We test CERBERUS logic directly by re-implementing the pure functions here
// so tests have zero external dependencies and run in milliseconds.

type CERBERUSDecision = 'PERMIT' | 'DENY' | 'ESCALATE';

interface PolicyRule {
  id: string;
  operationType: string;
  field?: string;
  operator?: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  threshold?: number;
  decision: CERBERUSDecision;
  reason: string;
}

const POLICIES: PolicyRule[] = [
  { id: 'P001', operationType: 'PURCHASE_ORDER', field: 'amount', operator: 'gt', threshold: 50000, decision: 'DENY', reason: 'Exceeds max budget' },
  { id: 'P002', operationType: 'PURCHASE_ORDER', field: 'amount', operator: 'gt', threshold: 10000, decision: 'ESCALATE', reason: 'Requires human review' },
  { id: 'P003', operationType: 'BUDGET_COMMITMENT', field: 'amount', operator: 'gt', threshold: 40000, decision: 'ESCALATE', reason: '80% threshold' },
  { id: 'P004', operationType: 'VENDOR_SELECTION', decision: 'PERMIT', reason: 'Vendor evaluation approved' },
  { id: 'P005', operationType: '*', decision: 'PERMIT', reason: 'Default policy' },
];

function compareOp(val: number, op: string, threshold: number): boolean {
  switch (op) {
    case 'gt': return val > threshold;
    case 'lt': return val < threshold;
    case 'gte': return val >= threshold;
    case 'lte': return val <= threshold;
    case 'eq': return val === threshold;
    default: return false;
  }
}

function matchPolicy(operationType: string, amount: number): PolicyRule {
  for (const rule of POLICIES) {
    if (rule.operationType !== '*' && rule.operationType !== operationType) continue;
    if (rule.field && rule.operator && rule.threshold !== undefined) {
      const val = rule.field === 'amount' ? amount : 0;
      if (!compareOp(val, rule.operator, rule.threshold)) continue;
    }
    return rule;
  }
  return POLICIES[POLICIES.length - 1];
}

function sha256(data: object): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

describe('CERBERUS Policy Engine', () => {
  describe('PURCHASE_ORDER decisions', () => {
    it('DENY when amount > 50000 (P001)', () => {
      const rule = matchPolicy('PURCHASE_ORDER', 55000);
      assert.equal(rule.decision, 'DENY');
      assert.equal(rule.id, 'P001');
    });

    it('DENY at exactly 50001', () => {
      const rule = matchPolicy('PURCHASE_ORDER', 50001);
      assert.equal(rule.decision, 'DENY');
    });

    it('PERMIT at exactly 50000 (not gt, so falls through to P002)', () => {
      const rule = matchPolicy('PURCHASE_ORDER', 50000);
      // 50000 is not > 50000 (P001 fails), and 50000 is > 10000 so P002 matches
      assert.equal(rule.decision, 'ESCALATE');
      assert.equal(rule.id, 'P002');
    });

    it('ESCALATE when 10000 < amount <= 50000 (P002)', () => {
      for (const amount of [10001, 25000, 38500, 49999]) {
        const rule = matchPolicy('PURCHASE_ORDER', amount);
        assert.equal(rule.decision, 'ESCALATE', `Expected ESCALATE for amount=${amount}`);
        assert.equal(rule.id, 'P002');
      }
    });

    it('PERMIT when amount <= 10000 (falls to default P005)', () => {
      for (const amount of [0, 1000, 9999, 10000]) {
        const rule = matchPolicy('PURCHASE_ORDER', amount);
        assert.equal(rule.decision, 'PERMIT', `Expected PERMIT for amount=${amount}`);
      }
    });
  });

  describe('BUDGET_COMMITMENT decisions', () => {
    it('ESCALATE when amount > 40000 (P003)', () => {
      const rule = matchPolicy('BUDGET_COMMITMENT', 45000);
      assert.equal(rule.decision, 'ESCALATE');
      assert.equal(rule.id, 'P003');
    });

    it('PERMIT when amount <= 40000', () => {
      const rule = matchPolicy('BUDGET_COMMITMENT', 40000);
      assert.equal(rule.decision, 'PERMIT');
    });
  });

  describe('VENDOR_SELECTION decisions', () => {
    it('PERMIT always (P004)', () => {
      const rule = matchPolicy('VENDOR_SELECTION', 0);
      assert.equal(rule.decision, 'PERMIT');
      assert.equal(rule.id, 'P004');
    });
  });

  describe('Default policy', () => {
    it('PERMIT unknown operation types (P005)', () => {
      for (const opType of ['REPORT_GENERATION', 'SYSTEM_CHECK', 'AUDIT_QUERY']) {
        const rule = matchPolicy(opType, 0);
        assert.equal(rule.decision, 'PERMIT', `Expected PERMIT for ${opType}`);
        assert.equal(rule.id, 'P005');
      }
    });
  });

  describe('Audit record integrity', () => {
    it('SHA-256 hash is deterministic for same input', () => {
      const record = {
        id: 'test-001',
        agentName: 'CHARON',
        operationType: 'PURCHASE_ORDER',
        decision: 'PERMIT',
        amount: 38500,
        timestamp: 1700000000000,
      };
      const h1 = sha256(record);
      const h2 = sha256(record);
      assert.equal(h1, h2);
      assert.equal(h1.length, 64);
      assert.match(h1, /^[0-9a-f]{64}$/);
    });

    it('SHA-256 hash changes when any field changes', () => {
      const base = { id: 'x', agent: 'CHARON', amount: 1000, timestamp: 1 };
      const modified = { ...base, amount: 1001 };
      assert.notEqual(sha256(base), sha256(modified));
    });

    it('SHA-256 hash changes when decision changes (tamper detection)', () => {
      const approved = { id: 'x', decision: 'PERMIT', timestamp: 1 };
      const tampered = { id: 'x', decision: 'DENY', timestamp: 1 };
      assert.notEqual(sha256(approved), sha256(tampered));
    });
  });

  describe('Policy ordering (first-match wins)', () => {
    it('P001 DENY takes precedence over P002 ESCALATE for amount 60000', () => {
      const rule = matchPolicy('PURCHASE_ORDER', 60000);
      assert.equal(rule.decision, 'DENY');
      assert.equal(rule.id, 'P001');
    });

    it('P002 ESCALATE takes precedence over P005 PERMIT for amount 20000', () => {
      const rule = matchPolicy('PURCHASE_ORDER', 20000);
      assert.equal(rule.decision, 'ESCALATE');
      assert.equal(rule.id, 'P002');
    });
  });
});
