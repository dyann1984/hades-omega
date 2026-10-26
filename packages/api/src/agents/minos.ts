import { v4 as uuid } from 'uuid';
import { AgentBase } from './base.js';
import { bus } from '../mission-bus.js';
import { cerberus } from '../cerberus.js';
import type { AuditRecord, EscalationRequest, Task, TaskResult } from '../types.js';

const TIMEOUT_MS = 30 * 60 * 1000;

const pendingEscalations = new Map<string, {
  request: EscalationRequest;
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

export class MinosAgent extends AgentBase {
  constructor() {
    super('MINOS', '⚖️', 'Validation & Human Review', 'Manages human-in-the-loop approvals, compliance validation, and escalation routing for high-stakes operations.');
  }

  async execute(task: Task): Promise<TaskResult> {
    this.setStatus('THINKING', 'Reviewing pending escalations');
    this.log(`MINOS audit pass for task ${task.id.slice(0, 8)}`);
    await this.sleep(400);
    const pending = this.getPendingEscalations();
    this.setStatus('IDLE');
    return {
      success: true,
      summary: pending.length > 0
        ? `MINOS monitoring ${pending.length} pending escalation(s)`
        : 'MINOS compliance check complete — no pending escalations',
      data: { pendingEscalations: pending.length },
    };
  }

  /**
   * Called by agents (e.g. CHARON) when CERBERUS returns ESCALATE.
   * Blocks the calling agent until a human approves or rejects via REST.
   * Creates a HUMAN_APPROVAL audit record on NEAR for the decision.
   */
  async requestApproval(
    missionId: string,
    taskId: string,
    details: Omit<EscalationRequest, 'id' | 'createdAt' | 'timeout' | 'missionId' | 'taskId'>
  ): Promise<{ approved: boolean; escalationId: string; humanApprovedBy?: string; auditRecord: AuditRecord }> {
    const escalation: EscalationRequest = {
      id: uuid(),
      missionId,
      taskId,
      ...details,
      timeout: TIMEOUT_MS,
      createdAt: Date.now(),
    };

    const amountLabel = details.amount
      ? `${details.amount.toLocaleString()} ${details.currency ?? 'MXN'}`
      : '';
    this.setStatus('WAITING', `Human review: ${details.operationType} ${amountLabel}`.trim());
    bus.publish('escalation:created', escalation);
    this.log(`MINOS: Human approval required — ${details.description}`, 'warn');

    const approved = await this.waitForHumanDecision(escalation);
    const humanApprovedBy = approved ? 'operator@hades-omega.demo' : undefined;

    const proposal = {
      id: uuid(),
      agentName: this.name,
      operationType: 'HUMAN_APPROVAL',
      description: `Human ${approved ? 'approval' : 'rejection'}: ${details.description}`,
      amount: details.amount,
      currency: details.currency,
      metadata: {
        escalationId: escalation.id,
        originalAgent: details.agentName,
        originalType: details.operationType,
        humanDecision: approved ? 'APPROVED' : 'REJECTED',
        approvedBy: humanApprovedBy,
      },
      timestamp: Date.now(),
    };

    const guardResult = {
      proposalId: proposal.id,
      decision: 'ESCALATE' as const,
      reason: `Human review completed: ${approved ? 'APPROVED' : 'REJECTED'}`,
      timestamp: Date.now(),
    };

    const auditRecord = await cerberus.audit(proposal, guardResult, humanApprovedBy);

    bus.publish('escalation:resolved', {
      escalationId: escalation.id,
      approved,
      humanApprovedBy,
      auditRecordId: auditRecord.id,
    });

    this.log(`MINOS: Escalation ${escalation.id.slice(0, 8)} → ${approved ? 'APPROVED' : 'REJECTED'}`);
    this.setStatus('IDLE');

    return { approved, escalationId: escalation.id, humanApprovedBy, auditRecord };
  }

  resolveEscalation(escalationId: string, approved: boolean): boolean {
    const pending = pendingEscalations.get(escalationId);
    if (!pending) return false;
    pending.resolve(approved);
    return true;
  }

  getPendingEscalations(): EscalationRequest[] {
    return Array.from(pendingEscalations.values()).map(e => e.request);
  }

  private waitForHumanDecision(escalation: EscalationRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingEscalations.delete(escalation.id);
        this.log(`Escalation ${escalation.id.slice(0, 8)} auto-rejected (timeout)`, 'warn');
        resolve(false);
      }, TIMEOUT_MS);

      pendingEscalations.set(escalation.id, {
        request: escalation,
        resolve: (approved) => {
          clearTimeout(timer);
          pendingEscalations.delete(escalation.id);
          resolve(approved);
        },
        timer,
      });
    });
  }
}

export const minosAgent = new MinosAgent();
