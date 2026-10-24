# HADES OMEGA — Plan de Pruebas

**Versión:** 0.1 (Fase de Planificación)
**Fecha:** Octubre 2026

---

## 1. Estrategia de pruebas

### Pirámide de pruebas para HADES OMEGA

```
         ┌─────────────────┐
         │   E2E Tests     │  Pocos, lentos, alto valor demo
         │  (Playwright)   │
         ├─────────────────┤
         │  Integration    │  Moderados — flujos entre componentes
         │    Tests        │
         ├─────────────────┤
         │   Unit Tests    │  Muchos, rápidos — CERBERUS core
         │    (Vitest)     │
         └─────────────────┘
```

### Prioridad de cobertura

| Componente | Prioridad | Razón |
|-----------|-----------|-------|
| CERBERUS GUARD (policy engine) | P0 | Determinista, debe ser 100% predecible |
| CERBERUS AUDIT (hash + record) | P0 | La integridad de la auditoría es central |
| PERSEPHONE (validación presupuestaria) | P0 | Lógica determinista crítica |
| NEAR Bridge modo simulación (N-003) | P0 | Debe funcionar sin NEAR real durante tests |
| NEAR Bridge modo real (N-004) | P0 | Tx real verificable es evidencia de la demo |
| Agentes P0: HADES, CHARON, PERSEPHONE, MINOS | P0 | Necesarios para el flujo de demo |
| Frontend: dashboard, CERBERUS panel, MINOS UI | P0 | Pantallas del flujo de demo |
| E2E demo flow (TC-E2E-001) | P0 | Debe funcionar el Día 11 |
| TARTARUS (detección de anomalías) | P1 | No aparece en el flujo de demo principal |
| ELYSIUM (planificación) | P1 | No aparece en el flujo de demo principal |
| CERBERUS RESPONSE (contención) | P1 | DENY/ESCALATE vienen de GUARD; RESPONSE es para incidentes |
| R3F núcleo holográfico | P1 | Impacto visual; no afecta funcionalidad |

---

## 2. Tests unitarios — CERBERUS GUARD

### TC-GUARD-001: PERMIT en operación dentro de límites
```
Input:
  operationType: 'PURCHASE_ORDER'
  payload: { vendorId: 'vendor-001', amount: 5000 }
  agentName: 'CHARON'
  policy: regla rule-001 (límite 10000), rule-002 (vendores aprobados)

Expected:
  outcome: 'PERMIT'
  auditId: (UUID válido)
  ruleMatched: null
```

### TC-GUARD-002: ESCALATE por monto superior al límite
```
Input:
  operationType: 'PURCHASE_ORDER'
  payload: { vendorId: 'vendor-001', amount: 15000 }
  agentName: 'CHARON'

Expected:
  outcome: 'ESCALATE'
  escalateTo: 'MINOS'
  reason: contiene 'autonomous approval limit'
```

### TC-GUARD-003: DENY por proveedor no aprobado
```
Input:
  operationType: 'PURCHASE_ORDER'
  payload: { vendorId: 'vendor-999', amount: 1000 }
  agentName: 'CHARON'

Expected:
  outcome: 'DENY'
  ruleMatched: 'rule-002'
  reason: contiene 'approved vendor list'
```

### TC-GUARD-004: DENY por schema inválido
```
Input:
  operationType: 'PURCHASE_ORDER'
  payload: { }  ← campos requeridos ausentes

Expected:
  outcome: 'DENY'
  reason: contiene 'SCHEMA_VALIDATION_ERROR'
```

### TC-GUARD-005: DENY por agente no autorizado para operación
```
Input:
  operationType: 'PURCHASE_ORDER'
  agentName: 'PERSEPHONE'  ← no tiene permiso para PURCHASE_ORDER

Expected:
  outcome: 'DENY'
  reason: contiene 'not authorized'
```

### TC-GUARD-006: Fail-secure — error interno
```
Setup: forzar excepción en el evaluador de política

Expected:
  outcome: 'DENY'
  reason: 'GUARD_INTERNAL_ERROR'
  (nunca debe lanzar excepción al caller)
```

### TC-GUARD-007: Determinismo
```
Ejecutar TC-GUARD-001 100 veces con el mismo input

Expected:
  100/100 retornan 'PERMIT'
  Todos los auditIds son diferentes (UUID únicos)
  El ruleMatched es null en todos los casos
```

---

## 3. Tests unitarios — CERBERUS AUDIT

### TC-AUDIT-001: AuditRecord creado para cada decisión GUARD
```
Setup: procesar 3 OperationProposals (PERMIT, DENY, ESCALATE)

Expected:
  3 AuditRecords en la base de datos
  Cada record tiene todos los campos requeridos
  contentHash es un SHA-256 hex de 64 caracteres
```

### TC-AUDIT-002: Verificación de integridad del hash
```
Input: AuditRecord con contentHash conocido

Expected:
  Recalcular SHA-256 del contenido produce el mismo hash
  Modificar cualquier campo del record produce un hash diferente
```

### TC-AUDIT-003: Inmutabilidad del registro
```
Setup: crear AuditRecord en base de datos

Expected:
  Intento de UPDATE retorna error
  El record original permanece intacto
```

### TC-AUDIT-004: Criterios de registro on-chain
```
Input A: PERMIT + operationType 'PURCHASE_ORDER' (está en CRITICAL_OPS)
Input B: PERMIT + operationType 'VENDOR_LOOKUP' (no está en CRITICAL_OPS)

Expected A: nearBridgeSubmit() es llamado
Expected B: nearBridgeSubmit() NO es llamado
```

### TC-AUDIT-005: Filtrado y paginación
```
Setup: crear 50 AuditRecords de diferentes agentes y tipos

Expected:
  listAuditRecords({ agentName: 'CHARON' }) retorna solo records de CHARON
  listAuditRecords({ outcome: 'DENY' }) retorna solo denials
  listAuditRecords({ limit: 10, offset: 0 }) retorna exactamente 10
```

---

## 4. Tests unitarios — CERBERUS RESPONSE *(P1 — implementar solo si RESPONSE se construye)*

> Estos tests corresponden a CERBERUS RESPONSE, que es P1 en el MVP. No son requeridos para la demo del Día 11. Solo ejecutar si el P0 concluye antes del Día 12.

### TC-RESP-001: BLOCK después de N denials
```
Setup: configurar blockThreshold: 3, blockWindowMs: 300000

Action: simular 3 DENY de CHARON en 4 minutos

Expected:
  Después del 3er DENY: ContainmentAction con level: 'BLOCK', targetAgent: 'CHARON'
  Duración: 600000ms (10 min default)
```

### TC-RESP-002: Expiración automática de BLOCK
```
Setup: CHARON en estado BLOCK con duration: 100ms

Action: esperar 150ms

Expected:
  CHARON vuelve a estado IDLE automáticamente
  AuditRecord de containment_expired generado
```

### TC-RESP-003: QUARANTINE no expira automáticamente
```
Setup: activar QUARANTINE para CHARON

Expected:
  Después de cualquier tiempo: CHARON sigue en QUARANTINE
  getActiveContainments() incluye a CHARON
  Solo resolveContainment() puede liberar
```

### TC-RESP-004: SHUTDOWN bloquea todas las operaciones
```
Action: emitir SHUTDOWN

Expected:
  Todas las OperationProposals posteriores retornan DENY inmediatamente
  reason: 'SYSTEM_SHUTDOWN'
  No se evalúan contra ninguna regla de política
```

---

## 5. Tests unitarios — PERSEPHONE

### TC-PERS-001: Aprobación dentro de presupuesto
```
Input: { amount: 5000, category: 'IT', availableBudget: 20000 }

Expected:
  approved: true
  availableAfter: 15000
  alerts: []
```

### TC-PERS-002: Aprobación con alerta de umbral
```
Input: { amount: 17000, category: 'IT', availableBudget: 20000 }
Config: alertThreshold: 80%

Expected:
  approved: true
  alerts: [{ type: 'APPROACHING_LIMIT' }]
```

### TC-PERS-003: Rechazo por fondos insuficientes
```
Input: { amount: 25000, category: 'IT', availableBudget: 20000 }

Expected:
  approved: false
  reason: 'INSUFFICIENT_FUNDS'
  availableAmount: 20000
```

### TC-PERS-004: Escalación por superar límite unitario
```
Input: { amount: 15000 }
Config: singleTransactionLimit: 10000

Expected:
  No retorna BudgetApproval ni BudgetRejection
  Genera EscalationRequest → MINOS
```

---

## 6. Tests de integración

### TC-INT-001: Flujo completo — Misión → Tarea → CERBERUS → Resultado
```
Setup: iniciar sistema completo en modo test

Action: crear misión "Evaluar proveedor para 5 servidores, presupuesto $8,000 MXN"

Expected (flujo):
  1. HADES recibe misión y genera TaskPlan
  2. CHARON recibe tarea de evaluación
  3. CHARON genera PurchaseOrderProposal (amount: 7500 MXN)
  4. CERBERUS GUARD evalúa → PERMIT (dentro de límite autónomo $10,000 MXN)
  5. CERBERUS AUDIT crea AuditRecord
  6. NEAR Bridge invocado en modo simulación
  7. TaskResult generado con cerberusIds
  8. HADES recibe resultado y actualiza misión

Criterio: todo el flujo completa en < 30 segundos
```

### TC-INT-002: Flujo completo DENY + ESCALATE (escenario demo)
```
Action: crear misión TechCore Industries, presupuesto $50,000 MXN

Expected:
  CHARON genera PO de $78,500 MXN (paquete premium)
  PERSEPHONE valida: DENY (fondos insuficientes)
  CERBERUS GUARD → DENY, AuditRecord generado
  CHARON re-evalúa → propone $42,000 MXN (alternativa)
  PERSEPHONE valida: PERMIT (dentro de presupuesto)
  CERBERUS GUARD → ESCALATE (supera límite autónomo $10,000 MXN)
  MINOS recibe EscalationRequest
  EscalationRequest visible en WebSocket
  Después de HumanDecision(approved: true):
    AuditRecord con humanApprovedBy
    NEAR Bridge invocado
```

### TC-INT-003: NEAR Bridge en modo simulación
```
Setup: NEAR_EXECUTION_MODE=simulation

Action: operación crítica que genera tx

Expected:
  nearTxHash: null en AuditRecord
  simulationId: UUID en NEARSubmissionResult
  Registro en DB local con tipo 'NEAR_SIMULATION'
  No se llama a near-api-js
```

### TC-INT-004: NEAR Bridge en modo real (manual, Día 8)
```
Setup: NEAR_EXECUTION_MODE=real, cuenta testnet configurada

Action: operación crítica con PERMIT

Expected:
  txHash: string de 44 caracteres (hash NEAR)
  explorerUrl: contiene 'testnet.nearblocks.io/txns/'
  AuditRecord actualizado con nearTxHash y nearExplorerUrl
  Transacción visible en explorador (verificación manual)
```

---

## 7. Tests E2E — Flujo de demo

### TC-E2E-001: Demo completa end-to-end (Día 11 simulación / Día 12 NEAR real)
```
Setup: sistema completo, NEAR en modo real, browser abierto

Scenario: "TechCore Industries: Adquirir 5 servidores cloud.
           Presupuesto total: $50,000 MXN. Deadline: 30 días."

Pasos verificables:
  1. Ingresar misión en el dashboard → sistema responde en < 5 seg
  2. Los 6 agentes aparecen activos en el núcleo holográfico
  3. CHARON evalúa proveedores → CloudPro 87/100 visible en UI
  4. CHARON propone $78,500 MXN (paquete premium)
  5. PERSEPHONE → DENY (fondos insuficientes), badge rojo en CERBERUS panel
  6. CHARON propone alternativa $42,000 MXN
  7. PERSEPHONE → PERMIT presupuesto; CERBERUS GUARD → ESCALATE (sobre límite autónomo)
  8. MINOS muestra formulario de aprobación humana
  9. Operador aprueba → AuditRecord con nearTxHash
  10. Panel NEAR muestra enlace al explorador con tx real
  11. [Juez abre explorador] → transacción confirmada en NEAR Testnet
  12. HADES sintetiza informe final

Criterio de aceptación:
  - Todo el flujo < 3 minutos
  - Núcleo holográfico visible y sin errores de renderizado
  - Al menos 1 tx real verificable en NEAR Testnet
  - CERBERUS panel muestra todos los AuditRecords del flujo
  - Funciona en modo offline (simulación) si NEAR no disponible
```

---

## 8. Criterios de aceptación por componente

| Componente | Criterio de "DONE" |
|-----------|-------------------|
| CERBERUS GUARD | TC-GUARD-001 al 007 pasan, cobertura ≥ 90% del engine |
| CERBERUS AUDIT | TC-AUDIT-001 al 005 pasan, inmutabilidad verificada |
| CERBERUS RESPONSE | TC-RESP-001 al 004 pasan |
| PERSEPHONE | TC-PERS-001 al 004 pasan |
| NEAR Bridge sim. | TC-INT-003 pasa, modo simulación nunca llama a NEAR |
| NEAR Bridge real | TC-INT-004 pasa manualmente, tx visible en explorador |
| Flujo integración | TC-INT-001 y TC-INT-002 pasan |
| Demo E2E | TC-E2E-001 pasa en su totalidad |

---

## 9. Herramientas y configuración

```json
{
  "testRunner": "Vitest",
  "e2eRunner": "Playwright",
  "coverage": "v8 (via Vitest)",
  "ci": "GitHub Actions (si se usa GitHub)",
  "commands": {
    "unit": "vitest run",
    "coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "watch": "vitest"
  }
}
```

---

*Relacionado: `03-cerberus-spec.md`, `06-api-contracts.md`, `09-backlog.md`*
