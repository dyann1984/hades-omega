# HADES OMEGA — Diseño Funcional de Agentes

**Versión:** 0.1 (Fase de Planificación)
**Fecha:** Octubre 2026

---

## 1. Modelo de agente base

Todos los agentes comparten un contrato de comportamiento común:

```
AgentBase {
  id:          string          // identificador único, e.g. "agent:charon:001"
  name:        AgentName       // HADES | CHARON | PERSEPHONE | MINOS | ELYSIUM | TARTARUS
  status:      AgentStatus     // IDLE | THINKING | EXECUTING | WAITING | ERROR | SUSPENDED
  currentTask: Task | null
  memory:      AgentMemory     // contexto de corto plazo del agente

  receiveTask(task: Task): Promise<void>
  executeStep(step: Step): Promise<StepResult>
  proposeOperation(op: OperationProposal): Promise<CERBERUSDecision>
  reportResult(result: TaskResult): Promise<void>
  handleError(error: AgentError): Promise<void>
}
```

**Principio clave:** ningún agente ejecuta una operación que afecte estado externo sin pasar por `proposeOperation()`, que invoca CERBERUS GUARD obligatoriamente.

---

## 2. HADES — Orquestador Central

### Rol
Director del sistema. Recibe misiones en lenguaje natural, las descompone en tareas estructuradas y las asigna a los agentes especializados. Monitorea el progreso y sintetiza los resultados para el usuario.

### Entradas
- `Mission`: texto de la misión + contexto empresarial + restricciones
- `TaskResult`: resultados de agentes subordinados
- `AgentStatusUpdate`: cambios de estado de los agentes

### Salidas
- `TaskAssignment[]`: lista de tareas asignadas a agentes específicos
- `MissionProgress`: actualización de progreso para el frontend
- `MissionReport`: informe final al usuario

### Flujo interno
```
1. Recibe Mission → llama LLM para análisis y descomposición
2. Genera TaskPlan: grafo de dependencias entre tareas
3. Asigna tareas independientes en paralelo, dependientes en secuencia
4. Monitorea TaskResults conforme llegan
5. Detecta bloqueos o conflictos → reasigna o escala
6. Cuando todas las tareas P0 completan → genera MissionReport
```

### Estado interno
- `activeMissions: Map<string, Mission>`
- `taskGraph: DAG<Task>` — grafo dirigido acíclico de dependencias
- `agentCapabilities: Map<AgentName, Capability[]>`

### Restricciones de diseño
- HADES **no ejecuta** operaciones de negocio directamente
- Puede invocar MINOS para solicitar aprobación humana si detecta ambigüedad
- El LLM solo se usa para descomposición y síntesis, no para política

---

## 3. CHARON — Compras y Proveedores

### Rol
Especialista en adquisiciones. Evalúa proveedores, compara opciones, genera órdenes de compra propuestas y negocia condiciones dentro de los parámetros autorizados.

### Entradas
- `ProcurementTask`: requisición con especificaciones y presupuesto máximo
- `VendorCatalog`: catálogo de proveedores disponibles (inyectado por HADES)
- `CompanyPolicy`: política de compras vigente

### Salidas
- `VendorEvaluation[]`: evaluación comparativa de proveedores
- `PurchaseOrderProposal`: orden de compra propuesta (requiere aprobación CERBERUS)
- `NegotiationSummary`: resumen de condiciones negociadas

### Criterios de evaluación de proveedores
```
VendorScore {
  price:          number    // 0-100, peso 40%
  quality:        number    // 0-100, peso 30%
  deliveryTime:   number    // 0-100, peso 20%
  compliance:     boolean   // cumple políticas de proveedor, peso 10%
  totalScore:     number    // ponderación de los anteriores
  recommendation: 'APPROVE' | 'REJECT' | 'ESCALATE'
}
```

### Operaciones que pasan por CERBERUS
- Toda `PurchaseOrderProposal` con valor > $0
- Selección de proveedor no incluido en lista aprobada
- Extensión de contrato de proveedor existente

### Restricciones de diseño
- No puede ejecutar pagos directamente
- No tiene acceso a información financiera confidencial (solo presupuesto asignado)
- Límite de monto autónomo definido en política CERBERUS

---

## 4. PERSEPHONE — Finanzas y Control Presupuestario

### Rol
Controladora financiera del sistema. Administra presupuestos, valida disponibilidad antes de aprobar gastos, emite alertas de desvío y genera informes financieros.

### Entradas
- `BudgetValidationRequest`: solicitud de validación antes de un gasto
- `TransactionRecord`: registro de gasto ejecutado
- `BudgetConfig`: configuración del presupuesto por categoría y período

### Salidas
- `BudgetApproval | BudgetRejection`: resultado de validación presupuestaria
- `BudgetAlert`: alerta cuando el consumo supera umbrales configurados
- `FinancialReport`: resumen de estado financiero

### Lógica de validación presupuestaria
```
validateBudget(request: BudgetValidationRequest):
  1. Obtener presupuesto disponible para categoría y período
  2. Si amount > available → REJECT con razón
  3. Si amount > 80% de available → APPROVE con ALERT (umbral configurable)
  4. Si amount > singleTransactionLimit → ESCALATE a MINOS
  5. En caso contrario → APPROVE
```

### Estado interno
- `budgetLedger: Map<Category, BudgetState>` — estado en tiempo real
- `transactionHistory: Transaction[]` — historial del período

### Restricciones de diseño
- No inicia transacciones financieras reales
- La lógica de validación es determinista (no LLM)
- Toda aprobación genera AuditRecord en CERBERUS

---

## 5. MINOS — Validación y Autorización Humana

### Rol
Juez del sistema. Recibe operaciones que requieren revisión humana o verificación de cumplimiento normativo. Presenta contexto al operador humano y registra su decisión. También valida el cumplimiento de políticas para operaciones complejas.

### Entradas
- `EscalationRequest`: operación escalada desde otro agente o CERBERUS
- `HumanDecision`: decisión del operador humano (vía UI)
- `PolicyViolationAlert`: desde CERBERUS GUARD

### Salidas
- `HumanApproval | HumanRejection`: decisión del operador con justificación
- `ComplianceReport`: informe de cumplimiento de la operación
- `AuditEntry`: entrada de auditoría con identidad del aprobador

### Flujo de escalación
```
1. Recibe EscalationRequest con contexto completo
2. Formatea presentación para el operador humano (vía WebSocket → UI)
3. Espera HumanDecision con timeout configurable (default: 30 min)
4. Si timeout → rechaza automáticamente (en MVP P0); escalada a TARTARUS solo cuando TARTARUS esté implementado (P1)
5. Registra decisión con timestamp, identidad y justificación
6. Emite resultado a agente solicitante + CERBERUS AUDIT
```

### Estado de escalaciones
- `pendingEscalations: Map<string, EscalationRequest>`
- Cada escalación tiene un UUID único y trazabilidad completa

### Restricciones de diseño
- MINOS no toma decisiones autónomas sobre aprobaciones humanas
- El timeout debe configurarse por tipo de operación
- Toda decisión queda registrada en NEAR si es crítica

---

## 6. ELYSIUM — Planificación y Optimización

> **Prioridad: P1** — ELYSIUM no participa en el flujo de demostración del MVP (misión TechCore Industries). Implementar solo si el P0 concluye antes del Día 12. Aparecerá en la UI como agente en estado IDLE durante la demo.

### Rol
Planificador estratégico. Asigna recursos entre tareas, optimiza cronogramas, identifica cuellos de botella y sugiere reorganizaciones para cumplir objetivos en tiempo.

### Entradas
- `PlanningRequest`: solicitud de plan con objetivos, recursos y restricciones
- `ResourceInventory`: recursos disponibles (presupuesto, tiempo, agentes)
- `TaskDependencies`: grafo de dependencias de tareas

### Salidas
- `ExecutionPlan`: plan optimizado con cronograma y asignación de recursos
- `ResourceConflict`: alerta cuando los recursos son insuficientes
- `PlanRevision`: actualización del plan ante cambios en el contexto

### Algoritmo de planificación
```
optimize(request: PlanningRequest):
  1. Construir grafo de dependencias
  2. Aplicar topological sort → orden de ejecución
  3. Asignar recursos con bin-packing simple
  4. Calcular ruta crítica
  5. Identificar slack (tiempo libre) en tareas no críticas
  6. Retornar ExecutionPlan con duración estimada y confianza
```

### Restricciones de diseño
- El algoritmo de optimización es determinista (no LLM)
- LLM puede usarse para interpretar restricciones expresadas en lenguaje natural
- No puede reasignar presupuesto entre categorías sin aprobación PERSEPHONE

---

## 7. TARTARUS — Detección de Anomalías e Incidentes

> **Prioridad: P1** — TARTARUS no participa en el flujo de demostración del MVP. Implementar solo si el P0 concluye antes del Día 12. Aparecerá en la UI como agente en estado IDLE durante la demo. CERBERUS RESPONSE (que coordina con TARTARUS) también es P1.

### Rol
Guardián operacional. Monitorea el comportamiento del sistema en tiempo real, detecta patrones anómalos, responde a incidentes y coordina la contención cuando CERBERUS emite una alerta severa.

### Entradas
- `SystemEvent`: cualquier evento del sistema (operaciones, errores, cambios de estado)
- `CERBERUSAlert`: alerta emitida por CERBERUS RESPONSE
- `AnomalyThresholds`: umbrales configurados para detección

### Salidas
- `AnomalyReport`: informe de anomalía detectada
- `IncidentRecord`: registro de incidente activo
- `ContainmentAction`: acción de contención (WARN / BLOCK / QUARANTINE / SHUTDOWN)

### Reglas de detección de anomalías
```
Anomalías que TARTARUS detecta automáticamente:
- Agente supera límite de operaciones por minuto (rate limiting)
- Operación rechazada por CERBERUS > N veces en T minutos (brute force)
- Agente en estado ERROR > 5 minutos sin recovery
- Monto acumulado en período supera umbral de alerta
- Secuencia de operaciones que coincide con patrón de riesgo conocido
```

### Niveles de respuesta
| Nivel | Trigger | Acción |
|-------|---------|--------|
| WARN | Anomalía menor detectada | Notificación al operador |
| BLOCK | Operación sospechosa confirmada | Bloqueo de la operación específica |
| QUARANTINE | Agente comprometido | Suspensión del agente, reasignación de tareas |
| SHUTDOWN | Amenaza sistémica | Pausa de todos los agentes, notificación de emergencia |

### Restricciones de diseño
- Las reglas de detección son deterministas y configurables
- TARTARUS no puede iniciar operaciones de negocio
- Tiene acceso de lectura a todos los AuditRecords

---

## 8. Protocolo de comunicación entre agentes

### Estructura de mensaje
```typescript
interface AgentMessage {
  id:          string          // UUID v4
  from:        AgentName
  to:          AgentName
  type:        MessageType     // TASK | RESULT | STATUS | ESCALATION | ALERT
  payload:     unknown         // tipado según MessageType
  timestamp:   number          // Unix ms
  correlationId: string        // ID de la misión o tarea padre
}
```

### Garantías del bus de mensajes
- Entrega al menos una vez (at-least-once delivery)
- Ordenamiento por correlationId
- Retención de mensajes 24h para debugging
- Sin mensajes perdidos silenciosamente (dead letter queue)

### Timeouts por tipo de tarea

| Tipo de tarea | Timeout default | Acción al expirar |
|---------------|-----------------|-------------------|
| Evaluación de proveedor | 5 min | Marcar como fallida, notificar HADES |
| Validación presupuestaria | 30 seg | Rechazar por timeout |
| Aprobación humana (MINOS) | 30 min | Escalar a TARTARUS |
| Análisis de anomalía | 60 seg | Emitir alerta precautoria |
| Optimización de plan | 2 min | Retornar mejor plan parcial |

---

## 9. Estado del sistema — Ciclo de vida de misión

```
MISSION STATE MACHINE:

RECEIVED → ANALYZING → PLANNED → IN_PROGRESS → COMPLETED
                                      │
                                      ├─ PARTIAL_COMPLETE (algunas tareas fallidas)
                                      │
                                      └─ FAILED (fallo crítico)

TASK STATE MACHINE:

ASSIGNED → ACCEPTED → IN_PROGRESS → CERBERUS_REVIEW → EXECUTED
                                          │
                                          ├─ APPROVED → EXECUTED
                                          ├─ DENIED → FAILED
                                          └─ ESCALATED → AWAITING_HUMAN
```

---

*Relacionado: `01-architecture.md`, `03-cerberus-spec.md`, `06-api-contracts.md`*
