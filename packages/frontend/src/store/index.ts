import { create } from 'zustand'

export type AgentName = 'HADES' | 'CHARON' | 'PERSEPHONE' | 'MINOS' | 'ELYSIUM' | 'TARTARUS'
export type AgentStatus = 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'ERROR' | 'SUSPENDED'
export type GUARDOutcome = 'PERMIT' | 'DENY' | 'ESCALATE'
export type MissionStatus = 'RECEIVED' | 'ANALYZING' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL_COMPLETE' | 'FAILED'

export interface AgentState {
  name:        AgentName
  status:      AgentStatus
  currentTask: string | null
}

export interface AuditRecord {
  id:            string
  timestamp:     number
  agentName:     AgentName
  operationType: string
  guardDecision: GUARDOutcome
  ruleMatched:   string | null
  reason:        string | null
  nearTxHash:    string | null
  nearExplorerUrl: string | null
  executionMode: 'simulation' | 'real'
}

export interface Mission {
  id:          string
  title:       string
  description: string
  status:      MissionStatus
  progress:    number
  createdAt:   number
  tasks:       MissionTask[]
}

export interface MissionTask {
  id:          string
  title:       string
  assignedTo:  AgentName
  status:      string
  result?:     { success: boolean; summary: string }
}

export interface EscalationRequest {
  id:            string
  fromAgent:     AgentName
  operationType: string
  reason:        string
  priority:      'LOW' | 'MEDIUM' | 'HIGH'
  createdAt:     number
}

export interface NEARTx {
  auditId:     string
  txHash:      string
  explorerUrl: string
}

export interface HadesStore {
  // Agent states
  agents:       Record<AgentName, AgentState>
  // Missions
  missions:     Mission[]
  activeMission: string | null
  // Audit records
  auditRecords: AuditRecord[]
  // Escalations
  escalations:  EscalationRequest[]
  // NEAR
  nearTxs:      NEARTx[]
  // Connection
  wsConnected:  boolean
  // Theme
  theme:        'dark' | 'light'
  // Notifications
  notifications: { id: string; type: 'info' | 'success' | 'warning' | 'error'; message: string; ts: number }[]

  // Actions
  setAgentStatus: (name: AgentName, status: AgentStatus, currentTask?: string | null) => void
  addAuditRecord: (record: AuditRecord) => void
  addMission:     (mission: Mission) => void
  updateMission:  (id: string, updates: Partial<Mission>) => void
  addEscalation:  (esc: EscalationRequest) => void
  removeEscalation: (id: string) => void
  addNearTx:      (tx: NEARTx) => void
  setWsConnected: (v: boolean) => void
  setTheme:       (t: 'dark' | 'light') => void
  addNotification: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void
  removeNotification: (id: string) => void
}

const defaultAgents: Record<AgentName, AgentState> = {
  HADES:      { name: 'HADES',      status: 'IDLE', currentTask: null },
  CHARON:     { name: 'CHARON',     status: 'IDLE', currentTask: null },
  PERSEPHONE: { name: 'PERSEPHONE', status: 'IDLE', currentTask: null },
  MINOS:      { name: 'MINOS',      status: 'IDLE', currentTask: null },
  ELYSIUM:    { name: 'ELYSIUM',    status: 'IDLE', currentTask: null },
  TARTARUS:   { name: 'TARTARUS',   status: 'IDLE', currentTask: null },
}

export const useHadesStore = create<HadesStore>((set, get) => ({
  agents:         defaultAgents,
  missions:       [],
  activeMission:  null,
  auditRecords:   [],
  escalations:    [],
  nearTxs:        [],
  wsConnected:    false,
  theme:          'dark',
  notifications:  [],

  setAgentStatus: (name, status, currentTask = null) => {
    set(s => ({ agents: { ...s.agents, [name]: { name, status, currentTask } } }))
  },

  addAuditRecord: record => {
    set(s => ({ auditRecords: [record, ...s.auditRecords].slice(0, 200) }))
    const outcome = record.guardDecision
    if (outcome === 'DENY')     get().addNotification('error',   `CERBERUS DENY — ${record.operationType} [${record.agentName}]`)
    if (outcome === 'ESCALATE') get().addNotification('warning', `CERBERUS ESCALATE — ${record.operationType} requiere revisión`)
    if (record.nearTxHash)      get().addNotification('success', `NEAR TX confirmada: ${record.nearTxHash.slice(0, 8)}...`)
  },

  addMission: mission => {
    set(s => ({ missions: [mission, ...s.missions], activeMission: mission.id }))
    get().addNotification('info', `Nueva misión: ${mission.title}`)
  },

  updateMission: (id, updates) => {
    set(s => ({
      missions: s.missions.map(m => m.id === id ? { ...m, ...updates } : m),
    }))
  },

  addEscalation: esc => {
    set(s => ({ escalations: [esc, ...s.escalations] }))
    get().addNotification('warning', `MINOS: escalación pendiente — ${esc.operationType}`)
  },

  removeEscalation: id => {
    set(s => ({ escalations: s.escalations.filter(e => e.id !== id) }))
  },

  addNearTx: tx => {
    set(s => ({ nearTxs: [tx, ...s.nearTxs].slice(0, 50) }))
  },

  setWsConnected: v => set({ wsConnected: v }),

  setTheme: t => {
    set({ theme: t })
    document.documentElement.setAttribute('data-theme', t)
    if (t === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    try { localStorage.setItem('hades-theme', t) } catch {}
  },

  addNotification: (type, message) => {
    const id = Math.random().toString(36).slice(2)
    set(s => ({ notifications: [{ id, type, message, ts: Date.now() }, ...s.notifications].slice(0, 10) }))
    setTimeout(() => get().removeNotification(id), 5000)
  },

  removeNotification: id => {
    set(s => ({ notifications: s.notifications.filter(n => n.id !== id) }))
  },
}))
