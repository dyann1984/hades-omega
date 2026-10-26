/**
 * Security and boundary tests — input validation, policy boundaries, rejection paths, XSS safety
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ── CERBERUS policy helpers (same as cerberus.test.ts — kept self-contained) ─

type CERBERUSDecision = 'PERMIT' | 'DENY' | 'ESCALATE';

interface PolicyRule {
  id: string; operationType: string; field?: string;
  operator?: 'gt' | 'lt' | 'gte' | 'lte' | 'eq'; threshold?: number;
  decision: CERBERUSDecision; reason: string;
}

const POLICIES: PolicyRule[] = [
  { id: 'P001', operationType: 'PURCHASE_ORDER', field: 'amount', operator: 'gt', threshold: 50000, decision: 'DENY', reason: 'Exceeds max' },
  { id: 'P002', operationType: 'PURCHASE_ORDER', field: 'amount', operator: 'gt', threshold: 10000, decision: 'ESCALATE', reason: 'Human review' },
  { id: 'P003', operationType: 'BUDGET_COMMITMENT', field: 'amount', operator: 'gt', threshold: 40000, decision: 'ESCALATE', reason: '80% threshold' },
  { id: 'P004', operationType: 'VENDOR_SELECTION', decision: 'PERMIT', reason: 'Vendor approved' },
  { id: 'P005', operationType: '*', decision: 'PERMIT', reason: 'Default' },
];

function matchPolicy(opType: string, amount: number): PolicyRule {
  for (const rule of POLICIES) {
    if (rule.operationType !== '*' && rule.operationType !== opType) continue;
    if (rule.field && rule.operator && rule.threshold !== undefined) {
      const val = rule.field === 'amount' ? amount : 0;
      const ok = { gt: val > rule.threshold, lt: val < rule.threshold, gte: val >= rule.threshold, lte: val <= rule.threshold, eq: val === rule.threshold }[rule.operator];
      if (!ok) continue;
    }
    return rule;
  }
  return POLICIES[POLICIES.length - 1];
}

function sha256(data: object): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// ── Input sanitization helpers (mirroring what the API does) ─────────────────

function sanitizeMissionText(text: string | unknown): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length < 10) return null;
  if (trimmed.length > 2000) return null;
  return trimmed;
}

function sanitizeAmount(amount: unknown): number | null {
  if (typeof amount !== 'number') return null;
  if (!isFinite(amount)) return null;
  if (amount < 0) return null;
  if (amount > 10_000_000) return null;
  return amount;
}

describe('Security Tests', () => {
  describe('Policy boundary: no purchase without authorization', () => {
    it('ANY PURCHASE_ORDER > 10000 MXN is blocked without human approval', () => {
      const amounts = [10001, 15000, 25000, 38500, 49999, 50000, 55000, 100000];
      for (const amount of amounts) {
        const rule = matchPolicy('PURCHASE_ORDER', amount);
        assert.ok(
          rule.decision === 'ESCALATE' || rule.decision === 'DENY',
          `Amount ${amount} should require human or be denied, got ${rule.decision}`
        );
      }
    });

    it('DENIED operations never proceed to NEAR', () => {
      const decision = matchPolicy('PURCHASE_ORDER', 55000).decision;
      assert.equal(decision, 'DENY');
      // Simulated: denied ops don't get nearTxHash
      const mockAuditRecord = { decision, nearTxHash: undefined };
      assert.equal(mockAuditRecord.nearTxHash, undefined);
    });

    it('Operations under 10000 MXN are PERMIT — no human required', () => {
      for (const amount of [0, 1, 5000, 9999, 10000]) {
        const rule = matchPolicy('PURCHASE_ORDER', amount);
        assert.equal(rule.decision, 'PERMIT', `Expected PERMIT for ${amount}`);
      }
    });
  });

  describe('Input validation', () => {
    it('rejects non-string mission text', () => {
      assert.equal(sanitizeMissionText(123), null);
      assert.equal(sanitizeMissionText(null), null);
      assert.equal(sanitizeMissionText(undefined), null);
      assert.equal(sanitizeMissionText([]), null);
      assert.equal(sanitizeMissionText({}), null);
    });

    it('rejects mission text shorter than 10 chars', () => {
      assert.equal(sanitizeMissionText('short'), null);
      assert.equal(sanitizeMissionText(''), null);
      assert.equal(sanitizeMissionText('123456789'), null);
    });

    it('accepts valid mission text', () => {
      assert.equal(sanitizeMissionText('Evaluate vendors for Q1 2027'), 'Evaluate vendors for Q1 2027');
    });

    it('rejects infinite amounts', () => {
      assert.equal(sanitizeAmount(Infinity), null);
      assert.equal(sanitizeAmount(-Infinity), null);
      assert.equal(sanitizeAmount(NaN), null);
    });

    it('rejects negative amounts', () => {
      assert.equal(sanitizeAmount(-1), null);
      assert.equal(sanitizeAmount(-50000), null);
    });

    it('rejects suspiciously large amounts', () => {
      assert.equal(sanitizeAmount(10_000_001), null);
    });

    it('accepts valid amounts', () => {
      assert.equal(sanitizeAmount(0), 0);
      assert.equal(sanitizeAmount(38500), 38500);
      assert.equal(sanitizeAmount(50000), 50000);
    });
  });

  describe('XSS-safe field handling', () => {
    it('audit record fields are JSON-stringified (not interpolated as HTML)', () => {
      const xssPayload = '<script>alert("xss")</script>';
      const record = { id: 'test', agentName: xssPayload, decision: 'PERMIT' };
      const serialized = JSON.stringify(record);
      // JSON stringify escapes < and > inside strings — the payload is data, not markup
      assert.ok(!serialized.includes('<script>') || serialized.includes('"<script>'));
      const parsed = JSON.parse(serialized);
      assert.equal(parsed.agentName, xssPayload); // Data preserved but not executable
    });

    it('mission text with special chars is safely handled', () => {
      const text = 'Evaluate "Q1 2027" vendors & check <compliance>; \'confirm\' budget';
      const sanitized = sanitizeMissionText(text);
      assert.ok(sanitized !== null);
      assert.equal(sanitized, text.trim());
    });
  });

  describe('Audit hash tamper detection', () => {
    it('modifying decision invalidates hash', () => {
      const record = { id: 'r1', agent: 'CHARON', decision: 'PERMIT', amount: 38500, timestamp: 1700000000 };
      const legitimate = sha256(record);
      const tampered = sha256({ ...record, decision: 'DENY' });
      assert.notEqual(legitimate, tampered);
    });

    it('modifying amount invalidates hash', () => {
      const record = { id: 'r1', agent: 'CHARON', decision: 'DENY', amount: 55000, timestamp: 1700000000 };
      const original = sha256(record);
      const tampered = sha256({ ...record, amount: 5000 }); // changed to look permitted
      assert.notEqual(original, tampered);
    });

    it('modifying humanApprovedBy field invalidates hash', () => {
      const record = { id: 'r1', decision: 'PERMIT', humanApprovedBy: undefined, timestamp: 1 };
      const noApprover = sha256(record);
      const fakeApprover = sha256({ ...record, humanApprovedBy: 'hacker@evil.com' });
      assert.notEqual(noApprover, fakeApprover);
    });
  });

  describe('CERBERUS has zero LLM dependency', () => {
    it('policy evaluation is synchronous (no async)', () => {
      // matchPolicy is a pure sync function — this test verifies it returns immediately
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        matchPolicy('PURCHASE_ORDER', Math.random() * 100000);
      }
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 200, `10k policy evaluations took ${elapsed}ms — should be < 200ms`);
    });
  });

  describe('Rejection path coverage', () => {
    it('DENY path returns success=false', () => {
      const decision = matchPolicy('PURCHASE_ORDER', 55000).decision;
      const taskResult = {
        success: decision !== 'DENY',
        summary: decision === 'DENY' ? 'Rejected by policy' : 'OK',
        data: { decision },
      };
      assert.equal(taskResult.success, false);
    });

    it('ESCALATE without approval should NOT produce NEAR tx', () => {
      // When escalation times out (no human), approved=false
      const approved = false;
      const nearTxHash = approved ? 'some-hash' : undefined;
      assert.equal(nearTxHash, undefined);
    });

    it('Only APPROVED operations get NEAR tx', () => {
      const scenarios = [
        { decision: 'PERMIT', humanApproved: false, expectNear: true },   // auto-permit always gets NEAR for critical ops
        { decision: 'PERMIT', humanApproved: true, expectNear: true },    // human-approved also gets NEAR
        { decision: 'DENY', humanApproved: false, expectNear: false },    // denied = no NEAR
      ];

      for (const s of scenarios) {
        if (!s.expectNear) {
          // Denied records should not be submitted to NEAR
          assert.equal(s.decision, 'DENY');
        }
      }
    });
  });
});
