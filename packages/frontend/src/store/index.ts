import { create } from 'zustand'

export type AgentName = 'HADES' | 'CHARON' | 'PERSEPHONE' | 'MINOS' | 'CERBERUS' | 'ELYSIUM' | 'TARTARUS'
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
  /** Optional evidence retained when supplied by the API. */
  guardReason?: string | null
  policyHits?: string[]
  payload?: unknown
  sha256?: string | null
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
  /** A decision resolves the review; it never grants the underlying operation. */
  status:        'PENDING' | 'APPROVED' | 'REJECTED'
  context?:      unknown
}

export type Escalation = EscalationRequest

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
  wsConnected:   boolean
  serverlessMode: boolean
  apiReady:       boolean | null
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
  resolveEscalation: (id: string, status: 'APPROVED' | 'REJECTED') => void
  addNearTx:      (tx: NEARTx) => void
  setWsConnected:    (v: boolean) => void
  setServerlessMode: (v: boolean) => void
  setApiReady:       (v: boolean | null) => void
  setTheme:       (t: 'dark' | 'light') => void
  addNotification: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void
  removeNotification: (id: string) => void
}

const defaultAgents: Record<AgentName, AgentState> = {
  HADES:      { name: 'HADES',      status: 'IDLE', currentTask: null },
  CHARON:     { name: 'CHARON',     status: 'IDLE', currentTask: null },
  PERSEPHONE: { name: 'PERSEPHONE', status: 'IDLE', currentTask: null },
  MINOS:      { name: 'MINOS',      status: 'IDLE', currentTask: null },
  CERBERUS:   { name: 'CERBERUS',   status: 'IDLE', currentTask: null },
  ELYSIUM:    { name: 'ELYSIUM',    status: 'IDLE', currentTask: null },
  TARTARUS:   { name: 'TARTARUS',   status: 'IDLE', currentTask: null },
}

function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {}
  return fallback
}

function persist(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export const useHadesStore = create<HadesStore>((set, get) => ({
  agents:         defaultAgents,
  missions:       loadPersisted<Mission[]>('hades-missions', []),
  activeMission:  null,
  auditRecords:   loadPersisted<AuditRecord[]>('hades-audit', []).slice(0, 200),
  escalations:    loadPersisted<EscalationRequest[]>('hades-escalations', []),
  nearTxs:        loadPersisted<NEARTx[]>('hades-near-txs', []).slice(0, 50),
  wsConnected:    false,
  serverlessMode: false,
  apiReady:       null,
  theme:          'dark',
  notifications:  [],

  setAgentStatus: (name, status, currentTask = null) => {
    set(s => ({ agents: { ...s.agents, [name]: { name, status, currentTask } } }))
  },

  addAuditRecord: record => {
    set(s => {
      const next = [record, ...s.auditRecords].slice(0, 200)
      persist('hades-audit', next)
      return { auditRecords: next }
    })
    const outcome = record.guardDecision
    if (outcome === 'DENY')     get().addNotification('error',   `CERBERUS DENY — ${record.operationType} [${record.agentName}]`)
    if (outcome === 'ESCALATE') get().addNotification('warning', `CERBERUS ESCALATE — ${record.operationType} requiere revisión`)
    if (record.nearTxHash)      get().addNotification('success', `NEAR TX confirmada: ${record.nearTxHash.slice(0, 8)}...`)
  },

  addMission: mission => {
    set(s => {
      const next = [mission, ...s.missions]
      persist('hades-missions', next)
      return { missions: next, activeMission: mission.id }
    })
    get().addNotification('info', `Nueva misión: ${mission.title}`)
  },

  updateMission: (id, updates) => {
    set(s => {
      const next = s.missions.map(m => m.id === id ? { ...m, ...updates } : m)
      persist('hades-missions', next)
      return { missions: next }
    })
  },

  addEscalation: esc => {
    set(s => {
      const next = [{ ...esc, status: esc.status ?? 'PENDING' }, ...s.escalations]
      persist('hades-escalations', next)
      return { escalations: next }
    })
    get().addNotification('warning', `MINOS: escalación pendiente — ${esc.operationType}`)
  },

  removeEscalation: id => {
    set(s => {
      const next = s.escalations.filter(e => e.id !== id)
      persist('hades-escalations', next)
      return { escalations: next }
    })
  },

  resolveEscalation: (id, status) => {
    set(s => {
      const next = s.escalations.map(e => e.id === id ? { ...e, status } : e)
      persist('hades-escalations', next)
      return { escalations: next }
    })
    get().addNotification(status === 'APPROVED' ? 'success' : 'warning',
      `MINOS: revisión ${status === 'APPROVED' ? 'aprobada' : 'rechazada'} — la operación requiere ejecución separada`)
  },

  addNearTx: tx => {
    set(s => {
      const next = [tx, ...s.nearTxs].slice(0, 50)
      persist('hades-near-txs', next)
      return { nearTxs: next }
    })
  },

  setWsConnected:    v => set({ wsConnected: v }),
  setServerlessMode: v => set({ serverlessMode: v }),
  setApiReady:       v => set({ apiReady: v }),

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
