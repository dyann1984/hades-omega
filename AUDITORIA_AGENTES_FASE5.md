# AUDITORÍA DE CAPACIDAD DE AGENTES — PREPARACIÓN FASE 5
**Fecha:** 2026-10-27  
**Rama:** `codex/recovery-omega-20261026`

---

## Resumen ejecutivo

Los 7 agentes del núcleo de HADES OMEGA tienen infraestructura de ejecución real (SQLite, JWT, WebSocket, CERBERUS GUARD) pero lógica de negocio simulada (delays, respuestas hardcoded). La Fase 5 debe conectar los agentes a LLM real y completar la integración NEAR.

---

## 1. HADES — Orquestador principal

**Archivo:** `packages/core/src/agents/hades.ts`

### Capacidades reales
- Recibe misiones con título, descripción, contexto de negocio
- Planifica tareas via `PlannerProvider` (RuleBasedPlanner por defecto)
- Ejecuta tareas respetando dependencias (orden topológico)
- Publica eventos al bus (`TASK_UPDATED`, `MISSION_PROGRESS`)
- Genera reportes de misión con conteo de éxitos/fallos

### Capacidades simuladas
- `createRuleBasedPlanner()`: genera un plan de tareas hardcoded para el demo TechCore Industries
- Delays artificiales (600ms análisis, 400ms planificación)

### Herramientas disponibles
- `AgentBase.proposeOperation()`: integración con CERBERUS GUARD/AUDIT
- `NEARBridge`: disponible pero en modo simulación
- `PlannerProvider` interfaz: lista para conectar LLM

### Dependencias
- CHARON, PERSEPHONE, MINOS, ELYSIUM, TARTARUS (subagentes)
- CerberusGUARD, CerberusAUDIT, NEARBridge

### Permisos
- Puede crear y despachar cualquier tarea a cualquier agente
- No tiene acceso directo a datos persistentes (pasa por API)

### Riesgos
- `registerSubAgents()` debe llamarse antes de ejecutar misiones
- Sin LLM, el planificador no puede adaptar planes a nuevos tipos de misión

### Funcionalidades empresariales faltantes
- **Planificador LLM real**: conectar a Claude para generar planes dinámicos según contexto
- **Memoria de misiones**: historial de misiones anteriores para tomar mejores decisiones
- **Análisis de documentos**: capacidad de recibir PDFs/Excel y generar tareas a partir de ellos

---

## 2. CHARON — Agente de compras y proveedores

**Archivo:** `packages/core/src/agents/charon.ts`

### Capacidades reales
- Evalúa propuestas de compra contra reglas CERBERUS GUARD
- Registra decisiones en CERBERUS AUDIT con hash SHA-256
- Filtra proveedores no aprobados (`compliant: false`)
- Genera propuestas de órdenes de compra con justificación

### Capacidades simuladas
- `DEMO_VENDORS`: lista hardcoded de 5 proveedores (CloudPro, TechVision, InfraMax)
- Scores de precio/calidad/entrega fijos
- No consulta sistema de proveedores real

### Herramientas disponibles
- CERBERUS GUARD para evaluar operaciones de compra
- CERBERUS AUDIT para registrar evidencia
- NEAR Bridge para operaciones críticas (`PURCHASE_ORDER`)

### Dependencias
- CerberusGUARD (política de compras)
- CerberusAUDIT + NEARBridge (auditoría)

### Permisos
- Puede proponer `PURCHASE_ORDER`, `VENDOR_EVALUATION`
- No puede ejecutar transferencias sin aprobación ADMIN (ESCALATE → MINOS)

### Riesgos
- Sin integración a ERP o catálogo real, las evaluaciones son irrelevantes para negocio real
- La lógica de scoring (precio/calidad) debería ser configurable por cliente

### Funcionalidades empresariales faltantes
- **Integración ERP/catálogo**: leer proveedores reales de una fuente de datos
- **LLM para análisis de RFPs**: analizar documentos de solicitud de propuesta
- **Cotización automática**: comparar cotizaciones en PDF

---

## 3. PERSEPHONE — Agente de finanzas y presupuesto

**Archivo:** `packages/core/src/agents/persephone.ts`

### Capacidades reales
- Verifica presupuesto disponible contra límite de misión
- Genera análisis financiero con justificación
- Integración con CERBERUS GUARD para aprobaciones de presupuesto

### Capacidades simuladas
- Presupuesto hardcoded: `$50,000 MXN disponibles`
- Sin integración a sistema contable real
- Tasa de aprobación simulada sin datos reales

### Herramientas disponibles
- CERBERUS GUARD (`BUDGET_APPROVAL`)
- CERBERUS AUDIT

### Permisos
- Puede aprobar operaciones dentro del límite de presupuesto
- Escala operaciones que superan el límite

### Riesgos
- Sin conexión a contabilidad real, las aprobaciones no tienen validez empresarial
- No valida disponibilidad de fondos en tiempo real

### Funcionalidades empresariales faltantes
- **Integración contable**: leer saldos de sistema contable (API REST o base de datos)
- **Reportes financieros**: generar reportes de gasto por período/proyecto
- **Alertas de presupuesto**: notificar cuando se acerca al límite

---

## 4. MINOS — Agente de validación y revisión humana

**Archivo:** `packages/core/src/agents/minos.ts`

### Capacidades reales
- Crea solicitudes de escalación con contexto
- Publica eventos `ESCALATION_CREATED` al bus
- Espera resolución humana antes de continuar
- Registra la decisión con `decidedBy` y `decidedAt`

### Capacidades simuladas
- En tests: auto-resuelve escalaciones con delay simulado
- Sin persistencia real de escalaciones pendientes (usa Map en memoria)
- Sin notificaciones externas (email, Slack)

### Herramientas disponibles
- Bus de eventos para publicar escalaciones
- Integración con el sistema de aprobaciones SQLite (via API)

### Permisos
- Puede crear escalaciones de cualquier tipo
- Solo ADMINs pueden resolver escalaciones via API

### Riesgos
- Escalaciones en memoria se pierden si el servidor reinicia
- Las escalaciones de la API SQLite y las del agente MINOS son sistemas separados

### Funcionalidades empresariales faltantes
- **Notificaciones**: email/Slack cuando llega una escalación urgente
- **SLA de respuesta**: alerta si una escalación no se resuelve en X horas
- **Unificación**: conectar el Map en memoria a la persistencia SQLite

---

## 5. CERBERUS — Motor de seguridad (GUARD + AUDIT)

**Archivos:** `packages/core/src/cerberus/guard.ts`, `audit.ts`, `policy.ts`

### Capacidades reales
- GUARD determinista: evalúa operaciones contra política configurable
- Reglas: PERMIT, DENY, ESCALATE según tipo de operación y monto
- AUDIT: crea registros con hash SHA-256 de cada decisión
- Hash `contentHash` para verificación de integridad
- NEAR Bridge: almacena hashes on-chain en modo real

### Capacidades simuladas
- `NEAR_EXECUTION_MODE=simulation`: genera tx hashes locales sin enviar a testnet

### Herramientas disponibles
- Política configurable en `policy.ts`
- NEARBridge con modo dual (simulation/real)

### Permisos
- Motor interno, no tiene endpoints API directos (usa rutas `/api/v1/cerberus/*`)

### Riesgos
- Política hardcoded en código; cambiarla requiere redeploy
- En modo simulación, los hashes NEAR no tienen validez on-chain

### Funcionalidades empresariales faltantes
- **Política configurable en runtime**: cargar reglas desde DB o archivo de configuración
- **Dashboard de política**: UI para ver y modificar reglas sin redeploy
- **NEAR real**: crear cuenta testnet y desplegar contrato de auditoría

---

## 6. ELYSIUM — Agente de planificación estratégica

**Archivo:** `packages/core/src/agents/elysium.ts`

### Capacidades reales
- Recibe tareas de planificación estratégica
- Genera estructura de plan con fases

### Capacidades simuladas
- Plan completamente hardcoded para TechCore Industries
- No adapta el plan al contexto real de la misión

### Herramientas disponibles
- CERBERUS GUARD/AUDIT
- Bus de eventos

### Permisos
- Puede proponer planes; no puede ejecutarlos sin aprobación

### Riesgos
- Sin LLM, no puede planificar casos de uso fuera del demo fijo

### Funcionalidades empresariales faltantes
- **LLM para planificación**: conectar a Claude para planes dinámicos
- **Análisis de riesgo**: identificar dependencias críticas y cuellos de botella
- **Gestión de recursos**: estimar tiempo y costo de cada fase

---

## 7. TARTARUS — Agente de incidentes y contingencias

**Archivo:** `packages/core/src/agents/tartarus.ts`

### Capacidades reales
- Recibe tareas de análisis de anomalías
- Genera reporte de incidente con timestamp y agente responsable

### Capacidades simuladas
- Análisis completamente simulado sin detección real
- No tiene acceso a logs reales del sistema

### Herramientas disponibles
- CERBERUS GUARD/AUDIT (para registrar incidentes)
- Bus de eventos

### Permisos
- Puede crear registros de incidente
- No puede suspender agentes directamente (debe ser via API)

### Riesgos
- Sin acceso a logs reales, no puede detectar incidentes genuinos
- La suspensión de agentes es simulada en el frontend, no en el core

### Funcionalidades empresariales faltantes
- **Acceso a logs del sistema**: leer errores y warnings del API en tiempo real
- **Detección de anomalías**: alertar cuando un agente falla repetidamente
- **Auto-recuperación**: reintentar operaciones fallidas con backoff

---

## 8. NEAR Bridge

**Archivo:** `packages/core/src/near-bridge/index.ts`

### Estado actual
- Interfaz implementada con modo dual
- `NEAR_EXECUTION_MODE=simulation`: retorna tx hash local sin NEAR
- `NEAR_EXECUTION_MODE=real`: intenta conectar a NEAR testnet (bloqueado por VER-003)

### Riesgos / Bloqueantes
- **VER-003 BLOQUEANTE**: crear cuenta `audit.hades-omega.testnet`
- Sin contrato desplegado, el modo real falla silenciosamente

---

## 9. Plan de implementación para Fase 5

### Prioridad P0 (MVP empresarial mínimo)

| Tarea | Agente | Esfuerzo estimado |
|---|---|---|
| Seed de usuario admin en arranque | server.ts | 1h |
| Planificador LLM básico (Claude) para HADES | HADES | 4h |
| Análisis de documentos texto plano | HADES/CHARON | 3h |
| Política CERBERUS configurable en archivo | CERBERUS | 2h |
| Unificar escalaciones MINOS con SQLite | MINOS | 3h |
| Crear cuenta NEAR testnet | NEAR Bridge | 1h (setup manual) |

### Prioridad P1 (demo hackathon)

| Tarea | Agente | Esfuerzo estimado |
|---|---|---|
| CHARON con análisis de PDF de cotización | CHARON | 6h |
| PERSEPHONE con reporte de gasto en PDF | PERSEPHONE | 4h |
| Notificaciones de escalación por WebSocket | MINOS | 2h |
| NEAR contrato de auditoría on-chain | NEAR Bridge | 8h |
| Dashboard de política CERBERUS en UI | CERBERUS | 4h |

### Prioridad P2 (post-hackathon)

- Integración ERP/contabilidad real
- SLAs de respuesta en escalaciones
- Auto-recuperación en TARTARUS
- Detección de anomalías con logs

---

## 10. Capacidades empresariales reales disponibles HOY

Con la infraestructura de Fase 4, HADES puede ejecutar **ahora mismo** las siguientes tareas empresariales reales:

1. **Calcular SHA-256 de cualquier documento/texto** con aprobación ADMIN obligatoria
2. **Registrar evidencia de auditoría** con hash verificable en SQLite
3. **Gestionar sesiones multi-usuario** con roles diferenciados (ADMIN/OPERATOR/AUDITOR/VIEWER)
4. **Simular el flujo completo de aprobación** de una compra para demo
5. **Revocar acceso** de un usuario inmediatamente sin reiniciar el servidor
6. **Recuperar todas las misiones y auditorías** tras un reinicio del servidor

La Fase 5 convertirá la simulación en operaciones empresariales reales conectando LLM y datos externos.
