# HADES OMEGA — Especificación del Motor CERBERUS

**Versión:** 0.1 (Fase de Planificación)
**Fecha:** Octubre 2026

---

## 1. Propósito y principios

CERBERUS es el motor de seguridad de HADES OMEGA. Opera como guardián de tres cabezas:

- **GUARD**: control preventivo — decide qué puede ocurrir antes de que ocurra
- **AUDIT**: registro inmutable — documenta lo que ocurrió y por qué
- **RESPONSE**: contención activa — actúa cuando algo no debería haber ocurrido

### Principios de diseño irrenunciables

1. **Determinismo absoluto**: dado el mismo input y política, CERBERUS siempre produce el mismo output. Sin aleatoriedad, sin LLM en el camino de decisión.
2. **Interceptación obligatoria**: ningún agente puede saltarse CERBERUS. Es una dependencia de infraestructura, no opcional.
3. **Fail-secure**: si CERBERUS falla o no puede evaluar, la operación se deniega por defecto.
4. **Auditoría completa**: toda decisión (incluidas las de PERMIT) queda registrada.
5. **Políticas como código**: las políticas se expresan en JSON Schema versionado, no en texto libre.

---

## 2. GUARD — Control Preventivo

### 2.1 Responsabilidad

GUARD evalúa cada `OperationProposal` antes de que el agente la ejecute. Retorna una decisión binaria o de escalación.

### 2.2 Tipos de decisión

```typescript
type GUARDDecision =
  | { outcome: 'PERMIT';    auditId: string }
  | { outcome: 'DENY';      reason: DenyReason;  auditId: string }
  | { outcome: 'ESCALATE';  reason: string;      auditId: string; escalateTo: 'MINOS' | 'TARTARUS' }
```

### 2.3 Pipeline de evaluación GUARD

```
OperationProposal
       │
       ▼
[1] Schema validation     → Verifica que la operación tenga formato correcto
       │
       ▼
[2] Agent authorization   → Verifica que el agente tiene permiso para este tipo de operación
       │
       ▼
[3] Policy evaluation     → Evalúa contra política activa (ver sección 2.4)
       │
       ▼
[4] Threshold check       → Verifica límites numéricos (montos, frecuencias)
       │
       ▼
[5] Conflict detection    → Detecta conflictos con operaciones recientes del mismo agente
       │
       ▼
[6] Decision emission     → PERMIT | DENY | ESCALATE
       │
       ▼
[7] → AUDIT (siempre, independiente del resultado)
```

Si cualquier paso falla (excepción, timeout) → decisión automática: DENY con razón `GUARD_INTERNAL_ERROR`.

### 2.4 Formato de política

Las políticas son objetos JSON versionados, evaluados contra la operación propuesta.

```json
{
  "version": "1.0.0",
  "name": "default-enterprise-policy",
  "effectiveDate": "2026-11-01",
  "rules": [
    {
      "id": "rule-001",
      "name": "purchase-amount-limit",
      "appliesTo": ["CHARON"],
      "operationType": "PURCHASE_ORDER",
      "condition": {
        "field": "payload.amount",
        "operator": "gt",
        "value": 10000
      },
      "action": "ESCALATE",
      "escalateTo": "MINOS",
      "reason": "Purchase order exceeds autonomous approval limit"
    },
    {
      "id": "rule-002",
      "name": "unapproved-vendor-block",
      "appliesTo": ["CHARON"],
      "operationType": "PURCHASE_ORDER",
      "condition": {
        "field": "payload.vendorId",
        "operator": "not_in",
        "valueList": "approved_vendors"
      },
      "action": "DENY",
      "reason": "Vendor not in approved vendor list"
    },
    {
      "id": "rule-003",
      "name": "budget-category-enforcement",
      "appliesTo": ["PERSEPHONE", "CHARON"],
      "operationType": "BUDGET_APPROVAL",
      "condition": {
        "field": "payload.category",
        "operator": "not_in",
        "valueList": "allowed_budget_categories"
      },
      "action": "DENY",
      "reason": "Budget category not authorized"
    }
  ],
  "valueLists": {
    "approved_vendors": ["vendor-001", "vendor-002", "vendor-003"],
    "allowed_budget_categories": ["IT", "OPERATIONS", "SERVICES", "INFRASTRUCTURE"]
  },
  "defaults": {
    "onNoRuleMatch": "PERMIT",
    "onEvaluationError": "DENY"
  }
}
```

### 2.5 Operadores de condición soportados

| Operador | Descripción | Ejemplo |
|----------|-------------|---------|
| `eq` | Igual | `amount eq 1000` |
| `ne` | No igual | `status ne "PENDING"` |
| `gt` | Mayor que | `amount gt 10000` |
| `gte` | Mayor o igual | `amount gte 5000` |
| `lt` | Menor que | `amount lt 100` |
| `lte` | Menor o igual | `amount lte 500` |
| `in` | Está en lista | `vendorId in [...]` |
| `not_in` | No está en lista | `category not_in [...]` |
| `exists` | Campo existe | `payload.justification exists` |
| `matches` | Regex | `vendorId matches "^vendor-[0-9]+"` |

---

## 3. AUDIT — Registro Inmutable

### 3.1 Responsabilidad

AUDIT genera un registro para cada decisión de GUARD. Para operaciones críticas, envía el hash del registro a NEAR Testnet.

### 3.2 Esquema del AuditRecord

```typescript
interface AuditRecord {
  id:             string    // UUID v4
  timestamp:      number    // Unix ms UTC
  agentId:        string    // e.g. "agent:charon:001"
  agentName:      AgentName
  operationType:  string    // e.g. "PURCHASE_ORDER"
  operationPayload: object  // copia inmutable del payload evaluado
  policyVersion:  string    // versión de la política usada
  policyHash:     string    // SHA-256 del contenido de la política
  guardDecision:  'PERMIT' | 'DENY' | 'ESCALATE'
  ruleMatched:    string | null  // ID de la regla que aplicó
  reason:         string | null  // razón de DENY o ESCALATE
  contentHash:    string    // SHA-256 de este registro (sin este campo)
  nearTxHash:     string | null  // hash de tx NEAR si fue registrado on-chain
  nearExplorerUrl: string | null // URL directa al explorador NEAR
}
```

### 3.3 Cálculo del hash de contenido

```
contentHash = SHA-256(
  JSON.stringify({
    id, timestamp, agentId, operationType,
    operationPayload, policyVersion, policyHash,
    guardDecision, ruleMatched, reason
  }, null, 0)  // sin espacios, orden de claves determinista
)
```

### 3.4 Criterios para registro on-chain (NEAR)

No todas las operaciones van a NEAR — solo las que cumplen al menos un criterio:

| Criterio | Descripción |
|----------|-------------|
| `guardDecision === 'PERMIT'` y `operationType in CRITICAL_OPS` | Operaciones críticas aprobadas |
| `guardDecision === 'DENY'` y política `near_on_deny === true` | Denials que requieren evidencia |
| `guardDecision === 'ESCALATE'` y resolución humana confirmada | Escalaciones resueltas |
| `severity === 'HIGH'` en AnomalyReport de TARTARUS | Incidentes de alta severidad — **criterio activo solo cuando TARTARUS esté implementado (P1)** |

```typescript
const CRITICAL_OPS = [
  'PURCHASE_ORDER',
  'BUDGET_APPROVAL_OVER_THRESHOLD',
  'VENDOR_ONBOARDING',
  'HUMAN_APPROVAL',
  'AGENT_SHUTDOWN',
  'POLICY_CHANGE'
]
```

### 3.5 Retención y acceso

- Todos los AuditRecords se almacenan en base de datos local (inmutables una vez creados)
- No se pueden editar ni eliminar (solo append)
- Los hashes on-chain en NEAR son la fuente de verdad para operaciones críticas
- El panel CERBERUS en frontend muestra registros en tiempo real

---

## 4. RESPONSE — Contención Activa

> **Prioridad: P1** — RESPONSE no es necesaria para la demo del MVP. Los eventos DENY y ESCALATE del flujo de demostración son generados por GUARD. RESPONSE gestiona incidentes activos (BLOCK/QUARANTINE/SHUTDOWN) que no aparecen en el escenario TechCore Industries. Implementar solo si el P0 concluye antes del Día 12.

### 4.1 Responsabilidad

RESPONSE actúa cuando TARTARUS detecta una anomalía o cuando GUARD emite múltiples DENY consecutivos del mismo agente. Define y ejecuta acciones de contención.

### 4.2 Niveles de respuesta

```typescript
type ResponseLevel = 'WARN' | 'BLOCK' | 'QUARANTINE' | 'SHUTDOWN'

interface ResponseAction {
  level:       ResponseLevel
  targetAgent: AgentName | 'ALL'
  reason:      string
  duration?:   number         // ms — null = hasta intervención manual
  reversible:  boolean
  notifyHuman: boolean
}
```

### 4.3 Tabla de respuestas por trigger

| Trigger | Nivel | Acción | Reversible |
|---------|-------|--------|-----------|
| 1 DENY en período normal | WARN | Log + notificación | N/A |
| 3 DENY en 5 min del mismo agente | BLOCK | Bloquear operaciones del agente por 10 min | Sí (auto) |
| 5 DENY en 10 min del mismo agente | QUARANTINE | Suspender agente, notificar operador | Sí (manual) |
| Anomalía de TARTARUS nivel HIGH | QUARANTINE | Suspender agente involucrado | Sí (manual) |
| Anomalía de TARTARUS nivel CRITICAL | SHUTDOWN | Pausar todos los agentes | Solo manual |
| Fallo de CERBERUS GUARD | BLOCK | Bloquear toda operación hasta recovery | Solo manual |

### 4.4 Recovery después de contención

```
WARN     → automático, sin intervención
BLOCK    → automático después de `duration`
QUARANTINE → requiere aprobación de operador humano vía MINOS
SHUTDOWN   → requiere confirmación explícita del administrador del sistema
```

### 4.5 Acciones de SHUTDOWN

Cuando RESPONSE emite SHUTDOWN:
1. Todos los agentes reciben señal `SUSPEND` via Mission Bus
2. Se bloquean nuevas entradas al Mission Bus
3. Las operaciones en vuelo se marcan como `SUSPENDED_PENDING_REVIEW`
4. AUDIT genera un `SystemShutdownRecord` con hash on-chain en NEAR
5. Se envía notificación de emergencia al operador (WebSocket + email si configurado)
6. El frontend muestra estado de emergencia en el núcleo holográfico

---

## 5. Interfaz pública de CERBERUS

```typescript
interface CERBERUSEngine {
  // GUARD
  evaluate(proposal: OperationProposal): Promise<GUARDDecision>

  // AUDIT
  getAuditRecord(id: string): Promise<AuditRecord | null>
  listAuditRecords(filter: AuditFilter): Promise<AuditRecord[]>
  getAuditStats(period: Period): Promise<AuditStats>

  // RESPONSE
  getSystemStatus(): SystemStatus
  getActiveContainments(): ContainmentAction[]
  resolveContainment(id: string, resolution: ContainmentResolution): Promise<void>

  // Policy management
  loadPolicy(policy: Policy): Promise<void>
  getCurrentPolicy(): Policy
  validatePolicy(policy: unknown): PolicyValidationResult
}
```

---

## 6. Tests requeridos para CERBERUS (criterios de aceptación)

Todos los siguientes tests deben pasar antes de considerar CERBERUS completo:

### Tests de GUARD
- [ ] `rule-001`: PURCHASE_ORDER con amount=15000 retorna ESCALATE (supera límite 10000)
- [ ] `rule-002`: PURCHASE_ORDER con vendorId no aprobado retorna DENY
- [ ] Input malformado (schema inválido) retorna DENY con razón `SCHEMA_VALIDATION_ERROR`
- [ ] Política con sintaxis inválida → `loadPolicy()` lanza error, política anterior permanece activa
- [ ] Fallo interno de GUARD → retorna DENY con razón `GUARD_INTERNAL_ERROR` (nunca lanza excepción)
- [ ] Mismo input con misma política siempre produce mismo output (determinismo)

### Tests de AUDIT
- [ ] Cada decisión de GUARD genera exactamente un AuditRecord
- [ ] AuditRecord es inmutable (intentar editar lanza error)
- [ ] `contentHash` es válido: recalcular hash del registro produce el mismo valor
- [ ] Operación crítica con PERMIT genera registro en NEAR Bridge (mock en tests)

### Tests de RESPONSE
- [ ] 3 DENY en 5 min del mismo agente activa BLOCK
- [ ] BLOCK expira automáticamente después de `duration`
- [ ] SHUTDOWN bloquea todas las operaciones inmediatamente
- [ ] Recovery de QUARANTINE requiere resolución explícita

---

## 7. Configuración de CERBERUS

Variables de entorno requeridas (sin valores sensibles aquí):

```bash
CERBERUS_POLICY_PATH=./policies/default.json  # ruta al archivo de política
CERBERUS_AUDIT_DB=./data/audit.db              # base de datos de auditoría
CERBERUS_NEAR_ENABLED=false                    # true = registra en NEAR Testnet
CERBERUS_NEAR_ACCOUNT=                         # account ID en testnet (no incluir aquí)
CERBERUS_BLOCK_DURATION_MS=600000              # 10 minutos default
CERBERUS_WARN_THRESHOLD=1                      # denials para WARN
CERBERUS_BLOCK_THRESHOLD=3                     # denials en ventana para BLOCK
CERBERUS_QUARANTINE_THRESHOLD=5               # denials en ventana para QUARANTINE
CERBERUS_BLOCK_WINDOW_MS=300000               # ventana de 5 minutos
```

---

*Relacionado: `01-architecture.md`, `02-agents-design.md`, `04-near-integration.md`, `05-security-threats.md`, `08-test-plan.md`*
