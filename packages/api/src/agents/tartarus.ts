import { v4 as uuid } from 'uuid';
import { AgentBase } from './base.js';
import { bus } from '../mission-bus.js';
import type { AnomalyEvent, AuditRecord, TartarusReport, Task, TaskResult } from '../types.js';

type ThreatLevel = TartarusReport['threatLevel'];

export class TartarusAgent extends AgentBase {
  private anomalyLog: AnomalyEvent[] = [];
  private denyCount = 0;
  private monitoring = false;

  constructor() {
    super('TARTARUS', '🛡️', 'Anomaly Detection & Containment', 'Monitors system behavior for anomalies, detects incident patterns, and coordinates containment responses.');
  }

  async execute(task: Task): Promise<TaskResult> {
    this.setStatus('THINKING', 'Running post-execution security scan');
    this.log(`TARTARUS anomaly scan for mission ${task.missionId.slice(0, 8)}`);

    await this.sleep(500);
    this.setStatus('EXECUTING', 'Analyzing threat patterns');

    const windowStart = Date.now() - 5 * 60 * 1000;
    const missionAnomalies = this.anomalyLog.filter(a => a.timestamp >= windowStart);
    const threatLevel = this.calculateThreatLevel(missionAnomalies);
    const containmentActions = this.getContainmentActions(missionAnomalies);

    await this.sleep(400);

    if (threatLevel === 'CRITICAL' || threatLevel === 'HIGH') {
      this.log(
        `ALERT: ${threatLevel} threat — ${missionAnomalies.length} anomalie(s), ${this.denyCount} DENY event(s)`,
        'warn'
      );
    } else {
      this.log(`Scan complete: ${threatLevel} — ${missionAnomalies.length} anomaly event(s)`);
    }

    this.setStatus('IDLE');

    const report: TartarusReport = {
      threatsDetected: missionAnomalies.length,
      threatLevel,
      anomalies: missionAnomalies,
      containmentActions,
      denyEventCount: this.denyCount,
      clearanceGranted: threatLevel === 'CLEAR' || threatLevel === 'LOW' || threatLevel === 'MEDIUM',
      scanTimestamp: Date.now(),
    };

    return {
      success: report.clearanceGranted,
      summary: `TARTARUS scan complete. Threat: ${threatLevel}. Anomalies: ${missionAnomalies.length}. ${containmentActions.length > 0 ? `Actions: ${containmentActions.join('; ')}` : 'No containment required.'}`,
      data: report,
    };
  }

  startMonitoring(): void {
    if (this.monitoring) return;
    this.monitoring = true;
    this.setStatus('EXECUTING', 'Real-time threat monitoring active');
    this.log('TARTARUS monitoring active — watching CERBERUS events');

    bus.subscribe('cerberus:decision', ({ payload }) => {
      const p = payload as {
        proposal?: Record<string, unknown>;
        result?: { decision?: string; reason?: string };
      };
      const decision = p?.result?.decision;
      const agentName = (p?.proposal?.agentName as string) ?? 'UNKNOWN';
      const amount = p?.proposal?.amount as number | undefined;
      const opType = (p?.proposal?.operationType as string) ?? 'UNKNOWN';

      if (decision === 'DENY') {
        this.denyCount++;
        this.recordAnomaly({
          type: 'POLICY_VIOLATION',
          severity: 'HIGH',
          description: `CERBERUS DENY: ${opType} from ${agentName} — ${p?.result?.reason ?? 'policy violation'}`,
          agentName,
          amount,
        });

        if (this.denyCount >= 3) {
          this.recordAnomaly({
            type: 'REPEATED_DENY',
            severity: 'CRITICAL',
            description: `${this.denyCount} DENY decisions in session — possible policy circumvention pattern`,
            agentName: 'TARTARUS',
          });
          this.log(`CRITICAL: ${this.denyCount} DENY events — possible attack pattern`, 'error');
        }
      }

      if (amount !== undefined && amount > 40000) {
        this.recordAnomaly({
          type: 'LARGE_AMOUNT',
          severity: amount > 50000 ? 'CRITICAL' : 'MEDIUM',
          description: `Large transaction: ${amount.toLocaleString()} MXN by ${agentName} (${opType})`,
          agentName,
          amount,
        });
      }
    });

    bus.subscribe('cerberus:audit', ({ payload }) => {
      const r = payload as AuditRecord;
      if (r?.metadata?.compliance === false) {
        this.recordAnomaly({
          type: 'COMPLIANCE_FAILURE',
          severity: 'HIGH',
          description: `Non-compliant operation on NEAR: ${r.operationType} by ${r.agentName}`,
          agentName: r.agentName,
        });
      }
    });
  }

  getAnomalyLog(): AnomalyEvent[] {
    return [...this.anomalyLog];
  }

  getCurrentThreatLevel(): ThreatLevel {
    return this.calculateThreatLevel(this.anomalyLog);
  }

  private recordAnomaly(partial: Omit<AnomalyEvent, 'id' | 'timestamp'>): void {
    const event: AnomalyEvent = { id: uuid(), ...partial, timestamp: Date.now() };
    this.anomalyLog.push(event);
    bus.publish('system:log', {
      level: event.severity === 'CRITICAL' ? 'error' : event.severity === 'HIGH' ? 'warn' : 'info',
      source: 'TARTARUS',
      message: `[${event.severity}] ${event.type}: ${event.description}`,
    });
  }

  private calculateThreatLevel(anomalies: AnomalyEvent[]): ThreatLevel {
    if (anomalies.length === 0) return 'CLEAR';
    const order = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    const maxSev = anomalies.reduce(
      (max, a) => (order[a.severity] > order[max] ? a.severity : max),
      'LOW' as AnomalyEvent['severity']
    );
    if (maxSev === 'CRITICAL' || anomalies.length >= 5) return 'CRITICAL';
    if (maxSev === 'HIGH' || anomalies.length >= 3) return 'HIGH';
    if (maxSev === 'MEDIUM' || anomalies.length >= 2) return 'MEDIUM';
    return 'LOW';
  }

  private getContainmentActions(anomalies: AnomalyEvent[]): string[] {
    const actions: string[] = [];
    if (anomalies.some(a => a.type === 'REPEATED_DENY')) {
      actions.push('BLOCK — Suspend agent operations pending security review');
      actions.push('ALERT — Notify security team of repeated policy violations');
    }
    if (anomalies.some(a => a.type === 'COMPLIANCE_FAILURE')) {
      actions.push('QUARANTINE — Flag non-compliant vendor in registry');
    }
    if (anomalies.some(a => a.type === 'LARGE_AMOUNT' && (a.amount ?? 0) > 50000)) {
      actions.push('FREEZE — Hold transaction pending executive authorization');
    }
    return actions;
  }
}
