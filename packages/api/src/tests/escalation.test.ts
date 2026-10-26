/**
 * Escalation flow tests — MINOS pending queue, resolve/reject, timeout, duplicate prevention
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Test the escalation queue mechanics directly (no server, no DB, no NEAR)
// Mirrors the MinosAgent internal logic

const TIMEOUT_MS = 100; // short timeout for tests

interface EscalationRequest {
  id: string;
  missionId: string;
  taskId: string;
  agentName: string;
  operationType: string;
  description: string;
  amount?: number;
  currency?: string;
  reason: string;
  timeout: number;
  createdAt: number;
}

class TestMinosQueue {
  private pending = new Map<string, {
    request: EscalationRequest;
    resolve: (approved: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  addEscalation(req: EscalationRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(req.id);
        resolve(false); // timeout = auto-reject
      }, req.timeout);
      this.pending.set(req.id, { request: req, resolve: (approved) => {
        clearTimeout(timer);
        this.pending.delete(req.id);
        resolve(approved);
      }, timer });
    });
  }

  resolve(id: string, approved: boolean): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    entry.resolve(approved);
    return true;
  }

  getPending(): EscalationRequest[] {
    return Array.from(this.pending.values()).map(e => e.request);
  }

  size(): number {
    return this.pending.size;
  }
}

function makeReq(id: string, amount: number = 38500): EscalationRequest {
  return {
    id,
    missionId: 'mission-001',
    taskId: 'task-001',
    agentName: 'CHARON',
    operationType: 'PURCHASE_ORDER',
    description: `Vendor purchase ${amount.toLocaleString()} MXN`,
    amount,
    currency: 'MXN',
    reason: 'Exceeds autonomous approval limit ($10,000 MXN)',
    timeout: TIMEOUT_MS,
    createdAt: Date.now(),
  };
}

describe('MINOS Escalation Queue', () => {
  let queue: TestMinosQueue;

  before(() => {
    queue = new TestMinosQueue();
  });

  describe('Basic approve/reject flow', () => {
    it('resolves with true when operator approves', async () => {
      const req = makeReq('esc-approve-1');
      const resultPromise = queue.addEscalation(req);
      assert.equal(queue.size(), 1);
      const resolved = queue.resolve('esc-approve-1', true);
      assert.equal(resolved, true);
      const approved = await resultPromise;
      assert.equal(approved, true);
      assert.equal(queue.size(), 0);
    });

    it('resolves with false when operator rejects', async () => {
      const req = makeReq('esc-reject-1');
      const resultPromise = queue.addEscalation(req);
      queue.resolve('esc-reject-1', false);
      const approved = await resultPromise;
      assert.equal(approved, false);
    });
  });

  describe('Queue state management', () => {
    it('getPending returns all unresolved escalations', () => {
      const q2 = new TestMinosQueue();
      q2.addEscalation(makeReq('esc-a'));
      q2.addEscalation(makeReq('esc-b'));
      q2.addEscalation(makeReq('esc-c'));
      assert.equal(q2.size(), 3);
      const pending = q2.getPending();
      assert.equal(pending.length, 3);
      assert.ok(pending.some(e => e.id === 'esc-a'));
      assert.ok(pending.some(e => e.id === 'esc-b'));
      assert.ok(pending.some(e => e.id === 'esc-c'));
      // Clean up
      q2.resolve('esc-a', true);
      q2.resolve('esc-b', true);
      q2.resolve('esc-c', true);
    });

    it('resolved escalation is removed from pending', async () => {
      const q3 = new TestMinosQueue();
      const p = q3.addEscalation(makeReq('esc-cleanup'));
      assert.equal(q3.size(), 1);
      q3.resolve('esc-cleanup', true);
      await p;
      assert.equal(q3.size(), 0);
      assert.equal(q3.getPending().length, 0);
    });

    it('returns false for unknown escalation ID', () => {
      const result = queue.resolve('nonexistent-id-xyz', true);
      assert.equal(result, false);
    });

    it('returns false when resolving the same ID twice', async () => {
      const q4 = new TestMinosQueue();
      const p = q4.addEscalation(makeReq('esc-dup'));
      q4.resolve('esc-dup', true);
      await p;
      const second = q4.resolve('esc-dup', true);
      assert.equal(second, false);
    });
  });

  describe('Timeout (auto-reject)', () => {
    it('auto-rejects after timeout', async () => {
      const req = makeReq('esc-timeout');
      req.timeout = 50;
      const resultPromise = queue.addEscalation(req);
      // Do NOT resolve — let it timeout
      const approved = await resultPromise;
      assert.equal(approved, false, 'Timed-out escalation should be auto-rejected');
    });

    it('timed-out escalation is removed from pending', async () => {
      const q5 = new TestMinosQueue();
      const req = makeReq('esc-timeout-cleanup');
      req.timeout = 50;
      await q5.addEscalation(req);
      assert.equal(q5.size(), 0, 'Timed-out escalation should be removed from queue');
    });
  });

  describe('No purchase without human approval for large amounts', () => {
    it('ESCALATE amounts must wait for human decision before proceeding', async () => {
      let purchaseExecuted = false;
      const req = makeReq('esc-gate');
      const q6 = new TestMinosQueue();

      // Start the "purchase" coroutine that WAITS for approval
      const purchaseFlow = async () => {
        const approved = await q6.addEscalation(req);
        if (approved) purchaseExecuted = true;
        return approved;
      };

      const flowPromise = purchaseFlow();

      // Before approval, purchase should NOT be executed
      assert.equal(purchaseExecuted, false);

      // Now approve
      q6.resolve('esc-gate', true);
      const result = await flowPromise;
      assert.equal(result, true);
      assert.equal(purchaseExecuted, true, 'Purchase should proceed only after approval');
    });

    it('rejected operation does not proceed', async () => {
      let purchaseExecuted = false;
      const req = makeReq('esc-blocked');
      const q7 = new TestMinosQueue();

      const flowPromise = q7.addEscalation(req).then(approved => {
        if (approved) purchaseExecuted = true;
        return approved;
      });

      q7.resolve('esc-blocked', false);
      const result = await flowPromise;
      assert.equal(result, false);
      assert.equal(purchaseExecuted, false, 'Rejected purchase must not execute');
    });
  });

  describe('Concurrent escalations', () => {
    it('multiple pending escalations can be resolved independently', async () => {
      const q8 = new TestMinosQueue();
      const p1 = q8.addEscalation(makeReq('esc-c1', 15000));
      const p2 = q8.addEscalation(makeReq('esc-c2', 25000));
      const p3 = q8.addEscalation(makeReq('esc-c3', 35000));

      q8.resolve('esc-c2', false); // reject middle one
      q8.resolve('esc-c1', true);  // approve first
      q8.resolve('esc-c3', true);  // approve third

      const results = await Promise.all([p1, p2, p3]);
      assert.deepEqual(results, [true, false, true]);
    });
  });
});
