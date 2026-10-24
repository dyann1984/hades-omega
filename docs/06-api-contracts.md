# HADES OMEGA — Contratos de Interfaces y API

**Versión:** 0.1 (Fase de Planificación)
**Fecha:** Octubre 2026

---

## 1. Tipos base del sistema

```typescript
// Identidades
type AgentName = 'HADES' | 'CHARON' | 'PERSEPHONE' | 'MINOS' | 'ELYSIUM' | 'TARTARUS'
type AgentStatus = 'IDLE' | 'THINKING' | 'EXECUTING' | 'WAITING' | 'ERROR' | 'SUSPENDED'
type MissionStatus = 'RECEIVED' | 'ANALYZING' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL_COMPLETE' | 'FAILED'
type TaskStatus = 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'CERBERUS_REVIEW' | 'EXECUTED' | 'FAILED' | 'SUSPENDED'
type GUARDOutcome = 'PERMIT' | 'DENY' | 'ESCALATE'
type ResponseLevel = 'WARN' | 'BLOCK' | 'QUARANTINE' | 'SHUTDOWN'

// Timestamps siempre en Unix ms UTC
type Timestamp = number

// IDs siempre UUID v4
type ID = string
```

---

## 2. Contratos de dominio — Misiones y Tareas

```typescript
interface Mission {
  id:           ID
  title:        string
  description:  string               // texto libre del operador
  context:      MissionContext
  status:       MissionStatus
  createdAt:    Timestamp
  updatedAt:    Timestamp
  completedAt:  Timestamp | null
  tasks:        Task[]
  report:       MissionReport | null
}

interface MissionContext {
  organizationId:   string
  budgetLimit:      number | null    // null = sin límite explícito
  currency:         string           // default 'USD'
  deadline:         Timestamp | null
  priority:         'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  tags:             string[]
}

interface Task {
  id:               ID
  missionId:        ID
  title:            string
  description:      string
  assignedTo:       AgentName
  status:           TaskStatus
  priority:         'P0' | 'P1' | 'P2'
  dependsOn:        ID[]             // IDs de tareas que deben completar primero
  createdAt:        Timestamp
  startedAt:        Timestamp | null
  completedAt:      Timestamp | null
  result:           TaskResult | null
}

interface TaskResult {
  taskId:       ID
  success:      boolean
  summary:      string
  data:         unknown              // payload específico del agente
  cerberusIds:  ID[]                 // IDs de AuditRecords relacionados
}

interface MissionReport {
  missionId:    ID
  summary:      string
  tasksTotal:   number
  tasksSuccess: number
  tasksFailed:  number
  decisions:    DecisionSummary[]
  nearTxCount:  number
  generatedAt:  Timestamp
}
```

---

## 3. Contratos CERBERUS

```typescript
interface OperationProposal {
  id:             ID
  agentId:        string             // e.g. "agent:charon:001"
  agentName:      AgentName
  operationType:  string             // e.g. "PURCHASE_ORDER"
  payload:        unknown            // datos de la operación
  missionId:      ID
  taskId:         ID
  requestedAt:    Timestamp
}

interface GUARDDecision {
  proposalId:   ID
  auditId:      ID
  outcome:      GUARDOutcome
  ruleMatched:  string | null
  reason:       string | null
  escalateTo:   'MINOS' | 'TARTARUS' | null
  decidedAt:    Timestamp
}

interface AuditRecord {
  id:               ID
  timestamp:        Timestamp
  agentId:          string
  agentName:        AgentName
  operationType:    string
  operationPayload: object            // copia inmutable
  policyVersion:    string
  policyHash:       string            // SHA-256 del JSON de política
  guardDecision:    GUARDOutcome
  ruleMatched:      string | null
  reason:           string | null
  contentHash:      string            // SHA-256 de este registro
  nearTxHash:       string | null
  nearExplorerUrl:  string | null
  humanApprovedBy:  string | null     // si fue aprobado por humano
  humanDecisionAt:  Timestamp | null
}

interface AuditFilter {
  agentName?:     AgentName
  operationType?: string
  outcome?:       GUARDOutcome
  fromTimestamp?: Timestamp
  toTimestamp?:   Timestamp
  hasNearTx?:     boolean
  limit?:         number              // default 50, max 500
  offset?:        number
}

interface AuditStats {
  period:         { from: Timestamp; to: Timestamp }
  totalDecisions: number
  byOutcome:      Record<GUARDOutcome, number>
  byAgent:        Record<AgentName, number>
  nearTxCount:    number
  topOperationTypes: Array<{ type: string; count: number }>
}
```

---

## 4. Contratos de agentes específicos

### 4.1 CHARON — Compras

```typescript
interface VendorEvaluation {
  vendorId:       string
  vendorName:     string
  price:          number
  priceScore:     number             // 0-100
  qualityScore:   number             // 0-100
  deliveryScore:  number             // 0-100
  complianceOk:   boolean
  totalScore:     number
  recommendation: 'APPROVE' | 'REJECT' | 'ESCALATE'
  notes:          string
}

interface PurchaseOrderProposal {
  id:             ID
  vendorId:       string
  vendorName:     string
  items:          PurchaseItem[]
  totalAmount:    number
  currency:       string
  justification:  string
  urgency:        'STANDARD' | 'URGENT' | 'CRITICAL'
  requestedBy:    AgentName          // siempre CHARON
}

interface PurchaseItem {
  description:    string
  quantity:       number
  unitPrice:      number
  category:       string
}
```

### 4.2 PERSEPHONE — Finanzas

```typescript
interface BudgetValidationRequest {
  requestId:      ID
  amount:         number
  currency:       string
  category:       string
  requestedBy:    AgentName
  description:    string
  taskId:         ID
}

type BudgetApproval = {
  requestId:      ID
  approved:       true
  availableBefore: number
  availableAfter: number
  alerts:         BudgetAlert[]
}

type BudgetRejection = {
  requestId:      ID
  approved:       false
  reason:         'INSUFFICIENT_FUNDS' | 'CATEGORY_NOT_AUTHORIZED' | 'LIMIT_EXCEEDED'
  availableAmount: number
  requestedAmount: number
}

interface BudgetAlert {
  type:           'APPROACHING_LIMIT' | 'CATEGORY_OVER_BUDGET' | 'UNUSUAL_AMOUNT'
  message:        string
  threshold:      number
  currentValue:   number
}
```

### 4.3 MINOS — Validación humana

```typescript
interface EscalationRequest {
  id:             ID
  fromAgent:      AgentName
  operationType:  string
  payload:        unknown
  reason:         string
  auditId:        ID
  priority:       'LOW' | 'MEDIUM' | 'HIGH'
  timeoutAt:      Timestamp
  createdAt:      Timestamp
}

type HumanDecision =
  | { escalationId: ID; approved: true;  justification: string; decidedBy: string; decidedAt: Timestamp }
  | { escalationId: ID; approved: false; justification: string; decidedBy: string; decidedAt: Timestamp }
```

### 4.4 ELYSIUM — Planificación

```typescript
interface PlanningRequest {
  id:             ID
  objectives:     string[]
  resources:      ResourceInventory
  constraints:    string[]
  deadline:       Timestamp | null
}

interface ExecutionPlan {
  requestId:      ID
  phases:         PlanPhase[]
  criticalPath:   ID[]               // IDs de tareas en la ruta crítica
  estimatedDays:  number
  confidence:     number             // 0-1
  resourceUsage:  ResourceUsage
  risks:          PlanRisk[]
}

interface ResourceInventory {
  budget:         number
  agents:         AgentName[]
  timeAvailable:  number             // días
}
```

### 4.5 TARTARUS — Incidentes

```typescript
interface AnomalyReport {
  id:             ID
  detectedAt:     Timestamp
  agentInvolved:  AgentName | null
  anomalyType:    string
  description:    string
  severity:       'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  evidence:       AnomalyEvidence[]
  recommendedResponse: ResponseLevel
}

interface AnomalyEvidence {
  type:           'AUDIT_RECORD' | 'SYSTEM_EVENT' | 'METRIC'
  referenceId:    string
  description:    string
}

interface IncidentRecord {
  id:             ID
  anomalyId:      ID
  status:         'ACTIVE' | 'CONTAINED' | 'RESOLVED'
  responseLevel:  ResponseLevel
  affectedAgents: AgentName[]
  timeline:       IncidentEvent[]
  resolvedAt:     Timestamp | null
}
```

---

## 5. Contratos de API REST (API Gateway)

### Base URL: `/api/v1`

#### Missions

```
POST   /missions                   → Crear nueva misión
GET    /missions                   → Listar misiones (paginado)
GET    /missions/:id               → Obtener misión por ID
GET    /missions/:id/tasks         → Listar tareas de una misión
GET    /missions/:id/report        → Obtener informe final
```

#### Agents

```
GET    /agents                     → Estado de todos los agentes
GET    /agents/:name               → Estado de un agente específico
POST   /agents/:name/suspend       → Suspender agente manualmente
POST   /agents/:name/resume        → Reanudar agente suspendido
```

#### CERBERUS

```
GET    /cerberus/status            → Estado del motor CERBERUS
GET    /cerberus/audit             → Listar AuditRecords (con filtros)
GET    /cerberus/audit/:id         → Obtener AuditRecord por ID
GET    /cerberus/audit/stats       → Estadísticas de auditoría
GET    /cerberus/policy            → Política vigente (sin campos sensibles)
GET    /cerberus/containments      → Contenciones activas
POST   /cerberus/containments/:id/resolve → Resolver contención
```

#### Escalations (MINOS)

```
GET    /escalations                → Escalaciones pendientes
GET    /escalations/:id            → Detalle de escalación
POST   /escalations/:id/decide     → Aprobar o rechazar (requiere autenticación)
```

#### NEAR

```
GET    /near/status                → Estado de conexión con NEAR
GET    /near/transactions          → Transacciones recientes en NEAR
GET    /near/transactions/:id      → Detalle de tx con enlace al explorador
```

### Esquema de respuesta estándar

```typescript
interface APIResponse<T> {
  success:  boolean
  data:     T | null
  error:    APIError | null
  meta:     ResponseMeta
}

interface ResponseMeta {
  requestId:    string
  timestamp:    Timestamp
  version:      string
}

interface APIError {
  code:         string             // e.g. "MISSION_NOT_FOUND"
  message:      string
  details?:     unknown
}
```

---

## 6. Contratos WebSocket — Eventos en tiempo real

### Conexión

```
ws://localhost:3000/ws
Authorization: Bearer {JWT}
```

### Eventos del servidor → cliente

```typescript
type ServerEvent =
  | { type: 'AGENT_STATUS_CHANGED';   payload: { agent: AgentName; status: AgentStatus } }
  | { type: 'MISSION_PROGRESS';       payload: { missionId: ID; status: MissionStatus; progress: number } }
  | { type: 'TASK_UPDATED';           payload: { task: Task } }
  | { type: 'CERBERUS_DECISION';      payload: { auditRecord: AuditRecord } }
  | { type: 'ESCALATION_CREATED';     payload: { escalation: EscalationRequest } }
  | { type: 'NEAR_TX_CONFIRMED';      payload: { auditId: ID; txHash: string; explorerUrl: string } }
  | { type: 'ANOMALY_DETECTED';       payload: { anomaly: AnomalyReport } }
  | { type: 'RESPONSE_TRIGGERED';     payload: { level: ResponseLevel; affectedAgents: AgentName[] } }
  | { type: 'SYSTEM_SHUTDOWN';        payload: { reason: string; timestamp: Timestamp } }
```

### Eventos del cliente → servidor

```typescript
type ClientEvent =
  | { type: 'SUBSCRIBE_MISSION';      payload: { missionId: ID } }
  | { type: 'UNSUBSCRIBE_MISSION';    payload: { missionId: ID } }
  | { type: 'PING' }
```

---

## 7. Contrato del contrato NEAR (Rust → JSON)

### Argumentos de `store_audit_hash`

```json
{
  "audit_id":       "string (UUID v4)",
  "content_hash":   "string (SHA-256 hex, 64 chars)",
  "operation_type": "string (max 64 chars)",
  "agent_name":     "string (AgentName)",
  "decision":       "string (PERMIT|DENY|ESCALATE)",
  "timestamp_ms":   "integer (Unix ms)"
}
```

### Respuesta de `get_audit_entry`

```json
{
  "audit_id":        "string",
  "content_hash":    "string",
  "operation_type":  "string",
  "agent_name":      "string",
  "decision":        "string",
  "timestamp_ms":    "integer",
  "block_height":    "integer",
  "block_timestamp": "integer"
}
```

---

*Relacionado: `02-agents-design.md`, `03-cerberus-spec.md`, `07-frontend-design.md`, `08-test-plan.md`*
