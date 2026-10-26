export type AgentName = 'HADES' | 'CHARON' | 'PERSEPHONE' | 'MINOS' | 'ELYSIUM' | 'TARTARUS';

export type AgentStatus = 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'ERROR' | 'SUSPENDED' | 'COMPLETED';

export type MissionStatus =
  | 'RECEIVED'
  | 'ANALYZING'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIAL_COMPLETE'
  | 'FAILED';

export type TaskStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'CERBERUS_REVIEW'
  | 'APPROVED'
  | 'DENIED'
  | 'ESCALATED'
  | 'AWAITING_HUMAN'
  | 'EXECUTED'
  | 'FAILED';

export type CERBERUSDecision = 'PERMIT' | 'DENY' | 'ESCALATE';

export type NEARExecutionMode = 'simulation' | 'real';

export interface Mission {
  id: string;
  text: string;
  status: MissionStatus;
  createdAt: number;
  updatedAt: number;
  tasks: Task[];
  report?: MissionReport;
}

export interface Task {
  id: string;
  missionId: string;
  assignedTo: AgentName;
  description: string;
  status: TaskStatus;
  result?: TaskResult;
  createdAt: number;
  updatedAt: number;
}

export interface TaskResult {
  success: boolean;
  summary: string;
  data: unknown;
  cerberusAuditId?: string;
  nearTxHash?: string;
  nearExplorerUrl?: string;
}

export interface OperationProposal {
  id: string;
  agentName: AgentName;
  operationType: string;
  description: string;
  amount?: number;
  currency?: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface CERBERUSGuardResult {
  proposalId: string;
  decision: CERBERUSDecision;
  reason: string;
  policyRuleId?: string;
  requiresHumanApproval?: boolean;
  timestamp: number;
}

export interface AuditRecord {
  id: string;
  proposalId: string;
  agentName: AgentName;
  operationType: string;
  decision: CERBERUSDecision;
  contentHash: string;
  metadata: Record<string, unknown>;
  humanApprovedBy?: string;
  nearTxHash?: string;
  nearExplorerUrl?: string;
  nearMode: NEARExecutionMode;
  timestamp: number;
}

export interface AgentState {
  name: AgentName;
  status: AgentStatus;
  currentTask?: string;
  lastActivity: number;
  processedTasks: number;
  icon: string;
  description: string;
  role: string;
}

export interface NEARSubmissionResult {
  mode: NEARExecutionMode;
  txHash: string | null;
  explorerUrl: string | null;
  blockHeight: number | null;
  simulationId: string | null;
  timestamp: number;
}

export interface WebSocketMessage {
  type:
    | 'MISSION_UPDATE'
    | 'AGENT_STATUS'
    | 'CERBERUS_EVENT'
    | 'NEAR_EVENT'
    | 'TASK_UPDATE'
    | 'AUDIT_RECORD'
    | 'ESCALATION'
    | 'SYSTEM'
    | 'LOG';
  payload: unknown;
  timestamp: number;
}

export interface EscalationRequest {
  id: string;
  missionId: string;
  taskId: string;
  agentName: AgentName;
  operationType: string;
  description: string;
  amount?: number;
  currency?: string;
  reason: string;
  timeout: number;
  createdAt: number;
}

export interface PolicyRule {
  id: string;
  operationType: string | '*';
  field?: string;
  operator?: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  threshold?: number;
  decision: CERBERUSDecision;
  reason: string;
  isCritical?: boolean;
}

export interface MissionReport {
  missionId: string;
  summary: string;
  tasks: Array<{ id: string; agent: string; status: string; summary: string }>;
  totalAuditRecords: number;
  nearTransactions: number;
  completedAt: number;
}

export interface VendorEvaluation {
  vendorId: string;
  name: string;
  price: number;
  currency: string;
  priceScore: number;
  qualityScore: number;
  deliveryScore: number;
  compliance: boolean;
  totalScore: number;
  recommendation: 'APPROVE' | 'REJECT' | 'ESCALATE';
  justification: string;
}

export interface BudgetValidation {
  category: string;
  requestedAmount: number;
  availableBudget: number;
  currency: string;
  approved: boolean;
  utilizationPercent: number;
  requiresEscalation: boolean;
  reason: string;
}
