import { create } from 'zustand';
import { v4 as uuid } from 'crypto';
import type { AgentState, AuditRecord, BudgetState, EscalationRequest, LogEntry, Mission, NEARStatus, WSMessage } from './types.js';

function genId() {
  return Math.random().toString(36).slice(2);
}

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

  setConnected: (v: boolean) => void;
  handleWSMessage: (msg: WSMessage) => void;
  addLog: (level: LogEntry['level'], source: string, message: string) => void;
  dismissEscalation: (id: string) => void;
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

  setConnected: (connected) => set({ connected }),

  addLog: (level, source, message) => {
    const entry: LogEntry = { id: genId(), level, source, message, timestamp: Date.now() };
    set(s => ({ logs: [entry, ...s.logs].slice(0, 200) }));
  },

  dismissEscalation: (id) => {
    set(s => ({ escalations: s.escalations.filter(e => e.id !== id) }));
  },

  handleWSMessage: (msg) => {
    const { addLog } = get();

    switch (msg.type) {
      case 'SYSTEM': {
        const p = msg.payload as {
          agentStates?: AgentState[];
          nearStatus?: NEARStatus;
        };
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
              r.id === p.record.id ? { ...r, nearTxHash: p.record.nearTxHash, nearExplorerUrl: p.record.nearExplorerUrl } : r
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
        if (p.source && p.message) {
          addLog(p.level ?? 'info', p.source, p.message);
        }
        break;
      }
    }
  },
}));
