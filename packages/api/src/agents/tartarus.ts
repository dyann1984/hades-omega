import { AgentBase } from './base.js';
import { bus } from '../mission-bus.js';
import type { Task, TaskResult } from '../types.js';

export class TartarusAgent extends AgentBase {
  constructor() {
    super('TARTARUS', '🛡️', 'Anomaly Detection & Containment', 'Monitors system behavior for anomalies, detects incident patterns, and coordinates containment responses.');
  }

  async execute(_task: Task): Promise<TaskResult> {
    this.setStatus('THINKING', 'Scanning for anomalies');
    this.log('TARTARUS anomaly scanner active (P1 — stub active)');
    await this.sleep(400);
    this.setStatus('IDLE');
    return {
      success: true,
      summary: 'TARTARUS anomaly detection stub — full implementation in P1',
      data: { status: 'stub', threatsDetected: 0 },
    };
  }

  startMonitoring(): void {
    this.setStatus('EXECUTING', 'Real-time monitoring active');
    bus.subscribe('cerberus:decision', ({ payload }) => {
      const p = payload as { result?: { decision?: string } };
      if (p?.result?.decision === 'DENY') {
        this.log('TARTARUS: DENY event detected — monitoring for brute-force pattern', 'warn');
      }
    });
  }
}
