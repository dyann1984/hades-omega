import { create } from 'zustand';
import type { AgentState, AuditRecord, BudgetState, EscalationRequest, LogEntry, Mission, NEARStatus, WSMessage } from './types.js';

function genId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function fakeHash(): string {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

const DEMO_AGENTS: AgentState[] = [
  { name: 'HADES',      status: 'IDLE', lastActivity: Date.now(), processedTasks: 0, icon: '𝚯', description: 'Orchestrator', role: 'Central Orchestrator' },
  { name: 'ELYSIUM',    status: 'IDLE', lastActivity: Date.now(), processedTasks: 0, icon: '⚡', description: 'Planner',       role: 'Mission Planner' },
  { name: 'CHARON',     status: 'IDLE', lastActivity: Date.now(), processedTasks: 0, icon: '⚖', description: 'Procurement',   role: 'Vendor & Procurement' },
  { name: 'PERSEPHONE', status: 'IDLE', lastActivity: Date.now(), processedTasks: 0, icon: '💎', description: 'Budget',        role: 'Budget Controller' },
  { name: 'MINOS',      status: 'IDLE', lastActivity: Date.now(), processedTasks: 0, icon: '⚔', description: 'Escalations',   role: 'Human Escalations' },
  { name: 'TARTARUS',   status: 'IDLE', lastActivity: Date.now(), processedTasks: 0, icon: '🔒', description: 'Security',      role: 'Anomaly Detection' },
];

interface HadesStore {
  connected: boolean;
  agents: AgentState[];
  missions: Mission[];
  auditRecords: AuditRecord[];
  logs: LogEntry[];
  escalations: EscalationRequest[];
  nearStatus: NEARStatus | null;
  budgetStatus: BudgetState[];
  activeMission: Mission | null;
  demoMode: boolean;

  setConnected: (v: boolean) => void;
  handleWSMessage: (msg: WSMessage) => void;
  addLog: (level: LogEntry['level'], source: string, message: string) => void;
  dismissEscalation: (id: string) => void;
  startDemo: () => void;
  stopDemo: () => void;
}

export const useHadesStore = create<HadesStore>((set, get) => ({
  connected: false,
  agents: [],
  missions: [],
  auditRecords: [],
  logs: [],
  escalations: [],
  nearStatus: null,
  budgetStatus: [],
  activeMission: null,
  demoMode: false,

  setConnected: (connected) => set({ connected }),

  addLog: (level, source, message) => {
    const entry: LogEntry = { id: genId(), level, source, message, timestamp: Date.now() };
    set(s => ({ logs: [entry, ...s.logs].slice(0, 200) }));
  },

  dismissEscalation: (id) => {
    set(s => ({ escalations: s.escalations.filter(e => e.id !== id) }));
  },

  stopDemo: () => set({ demoMode: false }),

  startDemo: () => {
    const missionId = genId();
    const elysiumTaskId = genId();
    const charonTaskId = genId();
    const persephoneTaskId = genId();
    const tartarusTaskId = genId();
    const escalationId = genId();
    const now = Date.now;

    set({
      demoMode: true,
      missions: [],
      auditRecords: [],
      escalations: [],
      logs: [],
      activeMission: null,
      agents: DEMO_AGENTS.map(a => ({ ...a, lastActivity: now(), processedTasks: 0 })),
      nearStatus: { mode: 'simulation', network: 'testnet', accountId: 'demo.hades-omega.testnet', contractId: 'audit.hades-omega.testnet', connected: true },
    });

    const upd = (name: string, patch: Partial<AgentState>) => {
      set(s => ({
        agents: s.agents.map(a => a.name === name ? { ...a, ...patch, lastActivity: Date.now() } : a),
      }));
    };

    const addMissionTask = (task: Mission['tasks'][number]) => {
      set(s => ({
        missions: s.missions.map(m => m.id === missionId ? { ...m, tasks: [...m.tasks, task] } : m),
        activeMission: s.activeMission?.id === missionId
          ? { ...s.activeMission!, tasks: [...s.activeMission!.tasks, task] }
          : s.activeMission,
      }));
    };

    const addAudit = (record: AuditRecord) => {
      set(s => ({ auditRecords: [record, ...s.auditRecords] }));
    };

    const { addLog } = get();

    // t=0 — HADES receives mission
    const mission: Mission = {
      id: missionId, text: 'Evaluate server vendors for TechCore Industries Q1 2027, budget $50,000 MXN',
      status: 'IN_PROGRESS', createdAt: now(), updatedAt: now(), tasks: [],
    };
    set({ missions: [mission], activeMission: mission });
    upd('HADES', { status: 'EXECUTING', currentTask: 'Analyzing mission directive…' });
    addLog('info', 'HADES', 'Mission received: TechCore Industries server vendor evaluation');

    // t=1.5s — ELYSIUM starts
    setTimeout(() => {
      upd('HADES', { status: 'IDLE', currentTask: undefined, processedTasks: 1 });
      upd('ELYSIUM', { status: 'EXECUTING', currentTask: 'Computing critical execution path…' });
      addLog('info', 'ELYSIUM', 'Computing execution plan for $50,000 MXN mission');
    }, 1500);

    // t=4s — ELYSIUM completes
    setTimeout(() => {
      const elysiumTask: Mission['tasks'][number] = {
        id: elysiumTaskId, missionId, assignedTo: 'ELYSIUM',
        description: 'Compute execution plan. Budget: $50,000 MXN', status: 'EXECUTED',
        result: { success: true, summary: 'Critical path: ELYSIUM→CHARON→PERSEPHONE→MINOS→TARTARUS. Risk: HIGH (>$40k)', data: null },
        createdAt: now(), updatedAt: now(),
      };
      addMissionTask(elysiumTask);
      upd('ELYSIUM', { status: 'COMPLETED', currentTask: undefined, processedTasks: 1 });
      addAudit({
        id: genId(), proposalId: genId(), agentName: 'ELYSIUM', operationType: 'MISSION_PLANNING',
        decision: 'PERMIT', contentHash: fakeHash(),
        metadata: { planScore: 70, riskLevel: 'HIGH', criticalPath: 'ELYSIUM→CHARON→PERSEPHONE→MINOS→TARTARUS' },
        nearMode: 'simulation', timestamp: now(),
      });
      addLog('info', 'CERBERUS', '[PERMIT] MISSION_PLANNING — risk HIGH, within policy bounds');
    }, 4000);

    // t=5s — CHARON starts
    setTimeout(() => {
      upd('CHARON', { status: 'THINKING', currentTask: 'Evaluating 4 server hardware vendors…' });
      addLog('info', 'CHARON', 'Starting vendor evaluation for server hardware procurement');
    }, 5000);

    // t=8s — CHARON in CERBERUS review
    setTimeout(() => {
      upd('CHARON', { status: 'EXECUTING', currentTask: 'CERBERUS evaluating: TechCore Server Pro [$48,500 MXN]' });
      addLog('info', 'CHARON', 'Selected vendor: TechCore Server Pro — $48,500 MXN (4 units)');
      addLog('warn', 'CERBERUS', '[ESCALATE] PURCHASE_ORDER $48,500 MXN — exceeds P002 threshold ($10,000 MXN)');
    }, 8000);

    // t=9.5s — CERBERUS issues ESCALATE audit
    setTimeout(() => {
      addAudit({
        id: genId(), proposalId: genId(), agentName: 'CHARON', operationType: 'PURCHASE_ORDER',
        decision: 'ESCALATE', contentHash: fakeHash(),
        metadata: { vendor: 'TechCore Server Pro', amount: 48500, reason: 'Policy P002: amount > $10,000 MXN', policy: 'P002' },
        nearMode: 'simulation', timestamp: now(),
      });
    }, 9500);

    // t=10s — CHARON waiting for human + escalation modal
    setTimeout(() => {
      const demoEsc: EscalationRequest = {
        id: escalationId, missionId, taskId: charonTaskId, agentName: 'CHARON',
        operationType: 'PURCHASE_ORDER',
        description: 'TechCore Server Pro — Enterprise Server Pack (4 units), $48,500 MXN. Exceeds $10,000 MXN single-operation threshold.',
        amount: 48500, currency: 'MXN',
        reason: 'Amount $48,500 MXN exceeds single-purchase policy limit of $10,000 MXN (Policy P002). Human authorization required.',
        timeout: 1800000, createdAt: now(),
      };
      upd('CHARON', { status: 'WAITING', currentTask: 'Awaiting human approval for $48,500 MXN purchase…' });
      upd('MINOS', { status: 'WAITING', currentTask: 'Review pending: $48,500 MXN PURCHASE_ORDER' });
      set(s => ({ escalations: [...s.escalations, demoEsc] }));
      addLog('warn', 'MINOS', 'Escalation created — awaiting human decision: $48,500 MXN');
    }, 10000);

    // t=15s — auto-approve in demo
    setTimeout(() => {
      set(s => ({ escalations: s.escalations.filter(e => e.id !== escalationId) }));
      upd('MINOS', { status: 'COMPLETED', currentTask: undefined, processedTasks: 1 });
      upd('CHARON', { status: 'EXECUTING', currentTask: 'Purchase authorized — recording on NEAR…' });
      addLog('info', 'MINOS', 'DEMO: Purchase order auto-approved for demonstration purposes');
    }, 15000);

    // t=17s — CHARON completes
    setTimeout(() => {
      const nearHash = fakeHash();
      const charonTask: Mission['tasks'][number] = {
        id: charonTaskId, missionId, assignedTo: 'CHARON',
        description: 'Evaluate and select server vendors. Budget: $50,000 MXN', status: 'EXECUTED',
        result: { success: true, summary: 'TechCore Server Pro selected — $48,500 MXN. Human approved by operator@hades-omega.demo', nearTxHash: nearHash, data: null },
        createdAt: now(), updatedAt: now(),
      };
      addMissionTask(charonTask);
      upd('CHARON', { status: 'COMPLETED', currentTask: undefined, processedTasks: 1 });
      addAudit({
        id: genId(), proposalId: genId(), agentName: 'CHARON', operationType: 'PURCHASE_ORDER',
        decision: 'PERMIT', contentHash: fakeHash(),
        metadata: { vendor: 'TechCore Server Pro', amount: 48500 },
        humanApprovedBy: 'operator@hades-omega.demo',
        nearTxHash: nearHash,
        nearExplorerUrl: `https://testnet.nearblocks.io/txns/${nearHash}`,
        nearMode: 'simulation', timestamp: now(),
      });
      addLog('info', 'NEAR', `[SIM] Transaction recorded: ${nearHash.slice(0, 12)}…`);
    }, 17000);

    // t=18s — PERSEPHONE starts
    setTimeout(() => {
      upd('PERSEPHONE', { status: 'EXECUTING', currentTask: 'Validating INFRASTRUCTURE budget commitment…' });
      addLog('info', 'PERSEPHONE', 'Checking budget: $48,500 MXN against INFRASTRUCTURE allocation');
    }, 18000);

    // t=20s — PERSEPHONE completes
    setTimeout(() => {
      const persTask: Mission['tasks'][number] = {
        id: persephoneTaskId, missionId, assignedTo: 'PERSEPHONE',
        description: 'Validate budget for server procurement', status: 'EXECUTED',
        result: { success: true, summary: 'Budget OK — $48,500/$200,000 MXN committed (24.3% utilization)', data: null },
        createdAt: now(), updatedAt: now(),
      };
      addMissionTask(persTask);
      upd('PERSEPHONE', { status: 'COMPLETED', currentTask: undefined, processedTasks: 1 });
      addAudit({
        id: genId(), proposalId: genId(), agentName: 'PERSEPHONE', operationType: 'BUDGET_COMMITMENT',
        decision: 'PERMIT', contentHash: fakeHash(),
        metadata: { category: 'INFRASTRUCTURE', committed: 48500, total: 200000, utilizationPct: 24.3 },
        nearMode: 'simulation', timestamp: now(),
      });
      addLog('info', 'CERBERUS', '[PERMIT] BUDGET_COMMITMENT — 24.3% utilization, within limits');
    }, 20000);

    // t=21s — TARTARUS starts
    setTimeout(() => {
      upd('TARTARUS', { status: 'EXECUTING', currentTask: 'Post-execution security scan and anomaly analysis…' });
      addLog('info', 'TARTARUS', 'Scanning mission audit trail for anomalies');
    }, 21000);

    // t=24s — TARTARUS completes, mission done
    setTimeout(() => {
      const tartTask: Mission['tasks'][number] = {
        id: tartarusTaskId, missionId, assignedTo: 'TARTARUS',
        description: 'Post-execution security scan', status: 'EXECUTED',
        result: { success: true, summary: 'Threat level: CLEAR. 1 escalation detected and resolved. Clearance granted.', data: null },
        createdAt: now(), updatedAt: now(),
      };
      addMissionTask(tartTask);
      upd('TARTARUS', { status: 'COMPLETED', currentTask: undefined, processedTasks: 1 });

      const report: Mission['report'] = {
        missionId,
        summary: 'TechCore Industries server procurement completed. Vendor: TechCore Server Pro, $48,500 MXN. Human authorization obtained. NEAR audit recorded.',
        tasks: [
          { id: elysiumTaskId, agent: 'ELYSIUM', status: 'EXECUTED', summary: 'Plan computed' },
          { id: charonTaskId, agent: 'CHARON', status: 'EXECUTED', summary: 'Vendor selected' },
          { id: persephoneTaskId, agent: 'PERSEPHONE', status: 'EXECUTED', summary: 'Budget validated' },
          { id: tartarusTaskId, agent: 'TARTARUS', status: 'EXECUTED', summary: 'Security: CLEAR' },
        ],
        totalAuditRecords: 4,
        nearTransactions: 1,
        completedAt: now(),
      };

      const completedMission: Mission = {
        id: missionId, text: 'Evaluate server vendors for TechCore Industries Q1 2027, budget $50,000 MXN',
        status: 'COMPLETED', createdAt: now() - 24000, updatedAt: now(),
        tasks: [
          { id: elysiumTaskId, missionId, assignedTo: 'ELYSIUM', description: '', status: 'EXECUTED', createdAt: 0, updatedAt: 0 },
          { id: charonTaskId, missionId, assignedTo: 'CHARON', description: '', status: 'EXECUTED', createdAt: 0, updatedAt: 0 },
          { id: persephoneTaskId, missionId, assignedTo: 'PERSEPHONE', description: '', status: 'EXECUTED', createdAt: 0, updatedAt: 0 },
          { id: tartarusTaskId, missionId, assignedTo: 'TARTARUS', description: '', status: 'EXECUTED', createdAt: 0, updatedAt: 0 },
        ],
        report,
      };
      set({ missions: [completedMission], activeMission: completedMission, demoMode: false });
      addLog('info', 'HADES', 'Mission COMPLETED — TechCore Industries vendor evaluation successful');
    }, 24000);
  },

  handleWSMessage: (msg) => {
    const { addLog } = get();

    switch (msg.type) {
      case 'SYSTEM': {
        const p = msg.payload as { agentStates?: AgentState[]; nearStatus?: NEARStatus };
        if (p.agentStates) set({ agents: p.agentStates });
        if (p.nearStatus) set({ nearStatus: p.nearStatus });
        addLog('info', 'SYSTEM', 'Connection established');
        break;
      }

      case 'AGENT_STATUS': {
        const agent = msg.payload as AgentState;
        set(s => ({
          agents: s.agents.some(a => a.name === agent.name)
            ? s.agents.map(a => a.name === agent.name ? agent : a)
            : [...s.agents, agent],
        }));
        break;
      }

      case 'MISSION_UPDATE': {
        const mission = msg.payload as Mission;
        set(s => {
          const existing = s.missions.find(m => m.id === mission.id);
          const missions = existing
            ? s.missions.map(m => m.id === mission.id ? { ...m, ...mission } : m)
            : [mission, ...s.missions];
          const activeMission = missions.find(m => m.status !== 'COMPLETED' && m.status !== 'FAILED') ?? missions[0] ?? null;
          return { missions, activeMission };
        });
        break;
      }

      case 'TASK_UPDATE': {
        const task = msg.payload as Mission['tasks'][number];
        set(s => ({
          missions: s.missions.map(m => {
            if (m.id !== task.missionId) return m;
            const tasks = m.tasks.some(t => t.id === task.id)
              ? m.tasks.map(t => t.id === task.id ? { ...t, ...task } : t)
              : [...m.tasks, task];
            return { ...m, tasks };
          }),
        }));
        break;
      }

      case 'AUDIT_RECORD': {
        const record = msg.payload as AuditRecord;
        set(s => ({ auditRecords: [record, ...s.auditRecords].slice(0, 100) }));
        break;
      }

      case 'NEAR_EVENT': {
        const p = msg.payload as { record: AuditRecord; nearResult: unknown };
        if (p.record?.nearTxHash) {
          set(s => ({
            auditRecords: s.auditRecords.map(r =>
              r.id === p.record.id ? { ...r, nearTxHash: p.record.nearTxHash, nearExplorerUrl: p.record.nearExplorerUrl, nearMode: p.record.nearMode } : r
            ),
          }));
          addLog('info', 'NEAR', `Transaction submitted: ${p.record.nearTxHash?.slice(0, 16)}…`);
        }
        break;
      }

      case 'CERBERUS_EVENT': {
        const p = msg.payload as { result: { decision: string; reason: string }; proposal: { agentName: string; operationType: string } };
        const decision = p?.result?.decision;
        const level = decision === 'DENY' ? 'error' : decision === 'ESCALATE' ? 'warn' : 'info';
        addLog(level, `CERBERUS.${p?.proposal?.operationType ?? 'GUARD'}`, `[${decision}] ${p?.result?.reason ?? ''}`);
        break;
      }

      case 'ESCALATION': {
        const p = msg.payload as EscalationRequest & { escalationId?: string; approved?: boolean };
        if (p.id && !p.escalationId) {
          set(s => ({ escalations: [...s.escalations, p] }));
          addLog('warn', 'MINOS', `Escalation required: ${p.description?.slice(0, 60)}`);
        } else if (p.escalationId) {
          set(s => ({ escalations: s.escalations.filter(e => e.id !== p.escalationId) }));
          addLog('info', 'MINOS', `Escalation ${p.escalationId?.slice(0, 8)} resolved: ${p.approved ? 'APPROVED' : 'REJECTED'}`);
        }
        break;
      }

      case 'LOG': {
        const p = msg.payload as { level: LogEntry['level']; source: string; message: string };
        if (p.source && p.message) addLog(p.level ?? 'info', p.source, p.message);
        break;
      }
    }
  },
}));
