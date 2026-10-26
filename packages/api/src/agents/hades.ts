import { v4 as uuid } from 'uuid';
import { AgentBase } from './base.js';
import { bus } from '../mission-bus.js';
import { saveMission, saveTask, updateMissionStatus, updateTaskStatus } from '../db.js';
import { complete } from '../llm.js';
import { CharonAgent } from './charon.js';
import { PersephoneAgent } from './persephone.js';
import { minosAgent as minos } from './minos.js';
import { ElysiumAgent } from './elysium.js';
import { TartarusAgent } from './tartarus.js';
import type { Mission, MissionReport, MissionStatus, Task, TaskResult } from '../types.js';

const DEMO_MISSION_TEXT = 'Evaluate server vendors for TechCore Industries Q1 2027, budget $50,000 MXN';
const DEMO_TASKS = [
  {
    assignedTo: 'CHARON' as const,
    description: 'Evaluate and select server hardware vendors. Budget ceiling: $50,000 MXN. Generate ranked vendor comparison and purchase order proposal.',
  },
  {
    assignedTo: 'PERSEPHONE' as const,
    description: 'Validate available INFRASTRUCTURE budget for server procurement of $38,500 MXN. Check utilization thresholds and flag alerts.',
  },
  {
    assignedTo: 'MINOS' as const,
    description: 'Review escalated purchase order if CERBERUS requires human approval. Validate compliance and record decision.',
  },
];

export class HadesAgent extends AgentBase {
  private activeMissions = new Map<string, Mission>();
  private charon = new CharonAgent();
  private persephone = new PersephoneAgent();
  private elysium = new ElysiumAgent();
  private tartarus = new TartarusAgent();

  constructor() {
    super('HADES', '🔱', 'Central Orchestrator', 'Decomposes enterprise missions into structured tasks, coordinates agents, and synthesizes results into actionable reports.');
    this.tartarus.startMonitoring();
  }

  getAllAgentStates() {
    return [
      this.getState(),
      this.charon.getState(),
      this.persephone.getState(),
      minos.getState(),
      this.elysium.getState(),
      this.tartarus.getState(),
    ];
  }

  async execute(_task: Task): Promise<TaskResult> {
    return { success: true, summary: 'HADES is the orchestrator', data: {} };
  }

  async receiveMission(missionText: string): Promise<Mission> {
    this.setStatus('THINKING', 'Analyzing mission parameters');
    this.log(`New mission received: "${missionText.slice(0, 60)}…"`);

    const mission: Mission = {
      id: uuid(),
      text: missionText,
      status: 'RECEIVED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tasks: [],
    };

    saveMission(mission);
    this.activeMissions.set(mission.id, mission);
    bus.publish('mission:created', mission);

    setImmediate(() => this.executeMission(mission).catch(err => {
      this.log(`Mission ${mission.id.slice(0, 8)} failed: ${err instanceof Error ? err.message : err}`, 'error');
      this.setMissionStatus(mission, 'FAILED');
    }));

    return mission;
  }

  private async executeMission(mission: Mission): Promise<void> {
    await this.sleep(400);
    this.setMissionStatus(mission, 'ANALYZING');
    this.log(`Decomposing mission ${mission.id.slice(0, 8)}`);

    await this.sleep(800);

    const taskDefs = await this.decomposeMission(mission);
    const tasks: Task[] = taskDefs.map(def => ({
      id: uuid(),
      missionId: mission.id,
      assignedTo: def.assignedTo,
      description: def.description,
      status: 'ASSIGNED' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    mission.tasks = tasks;
    tasks.forEach(t => saveTask(t));
    tasks.forEach(t => bus.publish('task:created', t));
    this.setMissionStatus(mission, 'PLANNED');

    await this.sleep(300);
    this.setMissionStatus(mission, 'IN_PROGRESS');

    const results = await this.runTasksSequentially(mission, tasks);

    const report = this.synthesizeReport(mission, results);
    this.setMissionStatus(mission, 'COMPLETED', report);

    bus.publish('system:log', {
      level: 'info',
      source: 'HADES',
      message: `Mission ${mission.id.slice(0, 8)} completed. ${report.totalAuditRecords} audit records, ${report.nearTransactions} NEAR transactions.`,
    });

    this.setStatus('IDLE');
  }

  private async runTasksSequentially(
    mission: Mission,
    tasks: Task[]
  ): Promise<Map<string, TaskResult>> {
    const results = new Map<string, TaskResult>();

    for (const task of tasks) {
      this.setStatus('EXECUTING', `Coordinating ${task.assignedTo}: ${task.description.slice(0, 40)}`);
      updateTaskStatus(task.id, 'IN_PROGRESS');
      task.status = 'IN_PROGRESS';
      bus.publish('task:status', task);

      let result: TaskResult;
      try {
        result = await this.executeTaskOnAgent(task);
      } catch (err) {
        this.log(`Task ${task.id.slice(0, 8)} on ${task.assignedTo} failed: ${err}`, 'error');
        result = { success: false, summary: `Agent error: ${err}`, data: { error: String(err) } };
      }

      const finalStatus = result.success
        ? (result.cerberusAuditId ? 'EXECUTED' : 'EXECUTED')
        : 'FAILED';

      updateTaskStatus(task.id, finalStatus, result);
      task.status = finalStatus;
      task.result = result;
      bus.publish('task:status', task);

      results.set(task.id, result);
      await this.sleep(200);
    }

    return results;
  }

  private async executeTaskOnAgent(task: Task): Promise<TaskResult> {
    switch (task.assignedTo) {
      case 'CHARON': return this.charon.execute(task);
      case 'PERSEPHONE': return this.persephone.execute(task);
      case 'MINOS': return this.handleMinosEscalation(task);
      case 'ELYSIUM': return this.elysium.execute(task);
      case 'TARTARUS': return this.tartarus.execute(task);
      default: return { success: true, summary: 'Task completed', data: {} };
    }
  }

  private async handleMinosEscalation(task: Task): Promise<TaskResult> {
    const escalations = minos.getPendingEscalations();
    if (escalations.length === 0) {
      this.log('MINOS: No escalations pending for this task cycle');
      return {
        success: true,
        summary: 'No escalations required for this mission',
        data: { escalationsPending: 0 },
      };
    }

    const results = [];
    for (const esc of escalations) {
      const { escalationId, approved, auditRecord } = await minos.createEscalation(
        task.missionId, task.id,
        {
          agentName: esc.agentName,
          operationType: esc.operationType,
          description: esc.description,
          amount: esc.amount,
          currency: esc.currency,
          reason: esc.reason,
        }
      );
      results.push({ escalationId, approved, auditRecordId: auditRecord.id, nearTxHash: auditRecord.nearTxHash });
    }

    const allApproved = results.every(r => r.approved);
    return {
      success: allApproved,
      summary: `MINOS resolved ${results.length} escalation(s). All approved: ${allApproved}`,
      data: { results },
      nearTxHash: results[0]?.nearTxHash ?? undefined,
    };
  }

  private async decomposeMission(mission: Mission): Promise<typeof DEMO_TASKS> {
    const isDemo = mission.text.toLowerCase().includes('techcore') ||
      mission.text.toLowerCase().includes('vendor') ||
      mission.text.toLowerCase().includes('server');

    if (isDemo) {
      this.log('Using optimized demo task plan for TechCore Industries scenario');
      return DEMO_TASKS;
    }

    const fallback = DEMO_TASKS.map(t => ({ ...t }));
    const response = await complete(
      [{
        role: 'user',
        content: `Decompose this enterprise mission into 2-4 specific tasks. Return JSON array with fields: assignedTo (one of: CHARON|PERSEPHONE|MINOS|ELYSIUM), description.\n\nMission: "${mission.text}"`,
      }],
      'You are HADES, the central orchestrator AI. Decompose missions into concrete agent tasks. Return only valid JSON.',
      JSON.stringify(fallback)
    );

    try {
      const parsed = JSON.parse(response) as typeof DEMO_TASKS;
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  private synthesizeReport(mission: Mission, results: Map<string, TaskResult>): MissionReport {
    let nearTransactions = 0;
    const taskSummaries = mission.tasks.map(t => {
      const r = results.get(t.id);
      if (r?.nearTxHash) nearTransactions++;
      return {
        id: t.id,
        agent: t.assignedTo,
        status: t.status,
        summary: r?.summary ?? 'No result',
      };
    });

    const totalAuditRecords = mission.tasks.filter(t => results.get(t.id)?.cerberusAuditId).length;

    return {
      missionId: mission.id,
      summary: `Mission "${mission.text.slice(0, 80)}" executed by ${mission.tasks.length} agents. ${totalAuditRecords} CERBERUS audit records generated. ${nearTransactions} NEAR transaction(s) submitted.`,
      tasks: taskSummaries,
      totalAuditRecords,
      nearTransactions,
      completedAt: Date.now(),
    };
  }

  private setMissionStatus(mission: Mission, status: MissionStatus, report?: MissionReport): void {
    mission.status = status;
    mission.updatedAt = Date.now();
    if (report) mission.report = report;
    updateMissionStatus(mission.id, status, report);
    bus.publish('mission:status', mission);
  }

  getPersephoneBudgetStatus() {
    return this.persephone.getBudgetStatus();
  }
}

export const hadesAgent = new HadesAgent();
