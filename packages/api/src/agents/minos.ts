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
    this.setStatus('THINKING', 'Processing escalation request');
    this.log(`MINOS reviewing escalation for task ${task.id.slice(0, 8)}`);
    await this.sleep(400);

    const escalation = this.parseEscalationFromTask(task);
    const auditRecord = await this.handleEscalation(escalation);

    this.setStatus('IDLE');
    return {
      success: auditRecord.decision === 'PERMIT',
      summary: `Escalation ${escalation.id.slice(0, 8)} resolved: ${auditRecord.decision === 'PERMIT' ? 'APPROVED' : 'REJECTED'} by ${auditRecord.humanApprovedBy ?? 'timeout'}`,
      data: { escalation, decision: auditRecord.decision, humanApprovedBy: auditRecord.humanApprovedBy },
      cerberusAuditId: auditRecord.id,
      nearTxHash: auditRecord.nearTxHash,
      nearExplorerUrl: auditRecord.nearExplorerUrl,
    };
  }

  async createEscalation(
    missionId: string,
    taskId: string,
    request: Omit<EscalationRequest, 'id' | 'createdAt' | 'timeout' | 'missionId' | 'taskId'>
  ): Promise<{ escalationId: string; approved: boolean; auditRecord: AuditRecord }> {
    const escalation: EscalationRequest = {
      id: uuid(),
      missionId,
      taskId,
      ...request,
      timeout: TIMEOUT_MS,
      createdAt: Date.now(),
    };

    const auditRecord = await this.handleEscalation(escalation);

    return {
      escalationId: escalation.id,
      approved: auditRecord.decision === 'PERMIT',
      auditRecord,
    };
  }

  private async handleEscalation(escalation: EscalationRequest): Promise<AuditRecord> {
    this.setStatus('WAITING', `Awaiting human decision: ${escalation.operationType}`);

    bus.publish('escalation:created', escalation);
    this.log(`Escalation presented to operator: ${escalation.description}`, 'warn');

    const approved = await this.waitForHumanDecision(escalation);
    const approvedBy = approved ? 'operator@hades-omega.demo' : undefined;

    const proposal = {
      id: uuid(),
      agentName: this.name,
      operationType: 'HUMAN_APPROVAL',
      description: `Human ${approved ? 'approval' : 'rejection'}: ${escalation.description}`,
      amount: escalation.amount,
      currency: escalation.currency,
      metadata: {
        escalationId: escalation.id,
        originalAgent: escalation.agentName,
        originalType: escalation.operationType,
        humanDecision: approved ? 'APPROVED' : 'REJECTED',
        approvedBy,
      },
      timestamp: Date.now(),
    };

    const guardResult = {
      proposalId: proposal.id,
      decision: 'ESCALATE' as const,
      reason: `Human review completed: ${approved ? 'APPROVED' : 'REJECTED'}`,
      timestamp: Date.now(),
    };

    const auditRecord = await cerberus.audit(proposal, guardResult, approvedBy);

    bus.publish('escalation:resolved', {
      escalationId: escalation.id,
      approved,
      approvedBy,
      auditRecordId: auditRecord.id,
    });

    this.log(`Escalation ${escalation.id.slice(0, 8)} resolved: ${approved ? 'APPROVED' : 'REJECTED'}`);
    return auditRecord;
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

  resolveEscalation(escalationId: string, approved: boolean): boolean {
    const pending = pendingEscalations.get(escalationId);
    if (!pending) return false;
    pending.resolve(approved);
    return true;
  }

  getPendingEscalations(): EscalationRequest[] {
    return Array.from(pendingEscalations.values()).map(e => e.request);
  }

  private parseEscalationFromTask(task: Task): EscalationRequest {
    return {
      id: uuid(),
      missionId: task.missionId,
      taskId: task.id,
      agentName: 'HADES',
      operationType: 'ESCALATED_REVIEW',
      description: task.description,
      reason: 'Escalated for human review',
      timeout: TIMEOUT_MS,
      createdAt: Date.now(),
    };
  }
}

export const minosAgent = new MinosAgent();
