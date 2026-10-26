// ============================================================
// HADES OMEGA — Core Types (from docs/06-api-contracts.md)
// ============================================================

export type AgentName = 'HADES' | 'CHARON' | 'PERSEPHONE' | 'MINOS' | 'ELYSIUM' | 'TARTARUS'
export type AgentStatus = 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'ERROR' | 'SUSPENDED'
export type MissionStatus =
  | 'RECEIVED'
  | 'ANALYZING'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIAL_COMPLETE'
  | 'FAILED'
export type TaskStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'CERBERUS_REVIEW'
  | 'EXECUTED'
  | 'FAILED'
  | 'SUSPENDED'
export type GUARDOutcome = 'PERMIT' | 'DENY' | 'ESCALATE'
export type ResponseLevel = 'WARN' | 'BLOCK' | 'QUARANTINE' | 'SHUTDOWN'
export type ExecutionMode = 'simulation' | 'real'

export type Timestamp = number
export type ID = string

// ---- Missions ----

export interface MissionContext {
  organizationId:  string
  budgetLimit:     number | null
  currency:        string
  deadline:        Timestamp | null
  priority:        'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  tags:            string[]
}

export interface TaskResult {
  taskId:      ID
  success:     boolean
  summary:     string
  data:        unknown
  cerberusIds: ID[]
}

export interface Task {
  id:          ID
  missionId:   ID
  title:       string
  description: string
  assignedTo:  AgentName
  status:      TaskStatus
  priority:    'P0' | 'P1' | 'P2'
  dependsOn:   ID[]
  createdAt:   Timestamp
  startedAt:   Timestamp | null
  completedAt: Timestamp | null
  result:      TaskResult | null
}

export interface DecisionSummary {
  outcome:  GUARDOutcome
  count:    number
}

export interface MissionReport {
  missionId:    ID
  summary:      string
  tasksTotal:   number
  tasksSuccess: number
  tasksFailed:  number
  decisions:    DecisionSummary[]
  nearTxCount:  number
  generatedAt:  Timestamp
}

export interface Mission {
  id:          ID
  title:       string
  description: string
  context:     MissionContext
  status:      MissionStatus
  createdAt:   Timestamp
  updatedAt:   Timestamp
  completedAt: Timestamp | null
  tasks:       Task[]
  report:      MissionReport | null
}

// ---- CERBERUS ----

export interface OperationProposal {
  id:            ID
  agentId:       string
  agentName:     AgentName
  operationType: string
  payload:       unknown
  missionId:     ID
  taskId:        ID
  requestedAt:   Timestamp
}

export interface GUARDDecision {
  proposalId:  ID
  auditId:     ID
  outcome:     GUARDOutcome
  ruleMatched: string | null
  reason:      string | null
  escalateTo:  'MINOS' | 'TARTARUS' | null
  decidedAt:   Timestamp
}

export interface AuditRecord {
  id:               ID
  timestamp:        Timestamp
  agentId:          string
  agentName:        AgentName
  operationType:    string
  operationPayload: object
  policyVersion:    string
  policyHash:       string
  guardDecision:    GUARDOutcome
  ruleMatched:      string | null
  reason:           string | null
  contentHash:      string
  nearTxHash:       string | null
  nearExplorerUrl:  string | null
  humanApprovedBy:  string | null
  humanDecisionAt:  Timestamp | null
  executionMode:    ExecutionMode
}

export interface AuditFilter {
  agentName?:     AgentName
  operationType?: string
  outcome?:       GUARDOutcome
  fromTimestamp?: Timestamp
  toTimestamp?:   Timestamp
  hasNearTx?:     boolean
  limit?:         number
  offset?:        number
}

export interface AuditStats {
  period:           { from: Timestamp; to: Timestamp }
  totalDecisions:   number
  byOutcome:        Record<GUARDOutcome, number>
  byAgent:          Partial<Record<AgentName, number>>
  nearTxCount:      number
  topOperationTypes: Array<{ type: string; count: number }>
}

// ---- Agent-specific payloads ----

export interface VendorEvaluation {
  vendorId:       string
  vendorName:     string
  price:          number
  priceScore:     number
  qualityScore:   number
  deliveryScore:  number
  complianceOk:   boolean
  totalScore:     number
  recommendation: 'APPROVE' | 'REJECT' | 'ESCALATE'
  notes:          string
}

export interface PurchaseItem {
  description: string
  quantity:    number
  unitPrice:   number
  category:    string
}

export interface PurchaseOrderProposal {
  id:            ID
  vendorId:      string
  vendorName:    string
  items:         PurchaseItem[]
  totalAmount:   number
  currency:      string
  justification: string
  urgency:       'STANDARD' | 'URGENT' | 'CRITICAL'
  requestedBy:   AgentName
}

export interface BudgetAlert {
  type:         'APPROACHING_LIMIT' | 'CATEGORY_OVER_BUDGET' | 'UNUSUAL_AMOUNT'
  message:      string
  threshold:    number
  currentValue: number
}

export interface BudgetValidationRequest {
  requestId:   ID
  amount:      number
  currency:    string
  category:    string
  requestedBy: AgentName
  description: string
  taskId:      ID
}

export type BudgetResult =
  | { requestId: ID; approved: true; availableBefore: number; availableAfter: number; alerts: BudgetAlert[] }
  | { requestId: ID; approved: false; reason: 'INSUFFICIENT_FUNDS' | 'CATEGORY_NOT_AUTHORIZED' | 'LIMIT_EXCEEDED'; availableAmount: number; requestedAmount: number }

export interface EscalationRequest {
  id:            ID
  fromAgent:     AgentName
  operationType: string
  payload:       unknown
  reason:        string
  auditId:       ID
  priority:      'LOW' | 'MEDIUM' | 'HIGH'
  timeoutAt:     Timestamp
  createdAt:     Timestamp
}

export type HumanDecision =
  | { escalationId: ID; approved: true;  justification: string; decidedBy: string; decidedAt: Timestamp }
  | { escalationId: ID; approved: false; justification: string; decidedBy: string; decidedAt: Timestamp }

export interface AnomalyEvidence {
  type:        'AUDIT_RECORD' | 'SYSTEM_EVENT' | 'METRIC'
  referenceId: string
  description: string
}

export interface AnomalyReport {
  id:                  ID
  detectedAt:          Timestamp
  agentInvolved:       AgentName | null
  anomalyType:         string
  description:         string
  severity:            'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  evidence:            AnomalyEvidence[]
  recommendedResponse: ResponseLevel
}

// ---- WebSocket events ----

export type ServerEvent =
  | { type: 'AGENT_STATUS_CHANGED';   payload: { agent: AgentName; status: AgentStatus; currentTask?: string | null } }
  | { type: 'MISSION_PROGRESS';       payload: { missionId: ID; status: MissionStatus; progress: number } }
  | { type: 'TASK_UPDATED';           payload: { task: Task } }
  | { type: 'CERBERUS_DECISION';      payload: { auditRecord: AuditRecord } }
  | { type: 'ESCALATION_CREATED';     payload: { escalation: EscalationRequest } }
  | { type: 'NEAR_TX_CONFIRMED';      payload: { auditId: ID; txHash: string; explorerUrl: string } }
  | { type: 'ANOMALY_DETECTED';       payload: { anomaly: AnomalyReport } }
  | { type: 'SYSTEM_HEARTBEAT';       payload: { ts: Timestamp } }

export type ClientEvent =
  | { type: 'SUBSCRIBE_MISSION';   payload: { missionId: ID } }
  | { type: 'UNSUBSCRIBE_MISSION'; payload: { missionId: ID } }
  | { type: 'PING' }

// ---- API responses ----

export interface APIError {
  code:     string
  message:  string
  details?: unknown
}

export interface ResponseMeta {
  requestId: string
  timestamp: Timestamp
  version:   string
}

export interface APIResponse<T> {
  success: boolean
  data:    T | null
  error:   APIError | null
  meta:    ResponseMeta
}
