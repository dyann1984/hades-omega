# HADES OMEGA — AUDITORÍA FUNCIONAL
**Fecha:** 26 de octubre de 2026
**Rama:** codex/recovery-omega-20261026
**Propósito:** Diagnóstico del estado real funcional empresarial, separando preocupaciones visuales de la lógica operativa.

---

## 1. RESUMEN EJECUTIVO

### ✅ Funcionalidades Operativas (Conservadas)
- **API Fastify** con endpoints REST para misiones, agentes y CERBERUS
- **WebSocket** para eventos en tiempo real
- **Autenticación JWT** y RBAC
- **Motor CERBERUS** (GUARD + AUDIT) funcionando
- **Integración NEAR Testnet** en modo simulación
- **6 agentes especializados** implementados (CHARON, PERSEPHONE, MINOS, ELYSIUM, TARTARUS, CERBERUS)
- **9 módulos del dashboard** funcionales

### ⚠️ Limitaciones Críticas Identificadas
- **Planificación de misiones NO dinámica:** HadesOrchestrator usa un plan predefinido estático (DEMO_MISSION_PLAN)
- **Falta de IA real en planificación:** No hay LLM para descomponer instrucciones empresariales en tareas específicas
- **Tareas no personalizadas:** Cada misión ejecuta el mismo conjunto de tareas predefinidas
- **Escalaciones MINOS simuladas:** No hay flujo real de aprobación humana conectado a la API
- **CHRONOS local-only:** Automatizaciones no persisten ni se programan en backend

### ❌ Gaps Empresariales
- No hay análisis de lenguaje natural para generar planes de misión específicos
- No hay optimización dinámica de asignación de tareas
- No hay contexto empresarial real (organización, historial, presupuestos reales)
- No hay integración con sistemas externos (ERP, SAP, sistemas financieros)

---

## 2. ESTADO DE LOS 9 MÓDULOS DEL DASHBOARD

| Módulo | Funcionalidad | Estado | Observaciones |
|--------|---------------|--------|---------------|
| **THRONE** | Consola de instrucciones, creación de misiones, registro de ejecución | ✅ Funcional | Crea misiones vía API, muestra logs en tiempo real, quick commands predefinidos |
| **PANTHEON** | Estado de agentes, activación/suspensión, métricas por agente | ✅ Funcional | Control local de estado de agentes, muestra historial de operaciones por agente |
| **DOMINION** | Gestión de misiones, filtrado por estado, progreso | ✅ Funcional | Lista todas las misiones, muestra progreso de tareas, navegación a detalle |
| **CERBERUS** | Motor de seguridad, decisiones GUARD/AUDIT, políticas | ✅ Funcional | Muestra las 3 cabezas (GUARD, AUDIT, RESPONSE), tabla de registros, estadísticas |
| **ORACLE** | Análisis operativo, métricas por agente, tipos de operación | ✅ Funcional | Gráficos de actividad, desglose de decisiones CERBERUS, progreso de misiones |
| **VAULT** | Conexiones (API, WS, NEAR), políticas CERBERUS, variables de entorno | ✅ Funcional | Estado de integraciones, políticas activas/inactivas, configuración visible |
| **CHRONOS** | Automatizaciones programadas, tareas recurrentes | ⚠️ Simulación local | UI completa, pero tareas solo se guardan en sesión local, no persisten en backend |
| **ARCHIVES** | Historial de misiones, auditoría, NEAR txs, exportación JSON | ✅ Funcional | Exporta misiones individuales y lotes, filtrado, búsqueda |
| **JUDGMENT** | Escalaciones pendientes, auditoría detallada, aprobación humana | ⚠️ Parcial | UI para aprobar/rechazar escalaciones, pero flujo no conecta a backend real |
| **OBSERVATORY** | Métricas consolidadas, actividad por agente, NEAR testnet | ✅ Funcional | Vista de alto nivel de todas las métricas del sistema |

---

## 3. AUDITORÍA DE PLANIFICACIÓN DINÁMICA DE MISIONES

### Archivo: `packages/core/src/agents/hades.ts`

#### Problema Principal
**HadesOrchestrator usa un plan de misión estático predefinido:**

```typescript
const DEMO_MISSION_PLAN = [
  { title: 'Evaluar proveedores de infraestructura',      agent: 'CHARON',     priority: 'P0' },
  { title: 'Validar presupuesto disponible ($50,000 MXN)', agent: 'PERSEPHONE', priority: 'P0' },
  { title: 'Calcular plan de implementación',              agent: 'ELYSIUM',    priority: 'P1' },
  { title: 'Revisar escalaciones pendientes',              agent: 'MINOS',      priority: 'P1' },
  { title: 'Analizar anomalías y políticas',               agent: 'TARTARUS',   priority: 'P1' },
]
```

#### Impacto
- **Cualquier instrucción empresarial** generará el mismo conjunto de 5 tareas
- **No hay análisis del texto de la instrucción** para generar tareas específicas
- **No hay adaptación** al contexto, presupuesto, urgencia o complejidad del caso real
- **La plataforma no es una IA multiagente real**, sino un script preprogramado

#### Código Relevante
Líneas 19-25: `DEMO_MISSION_PLAN` estático
Líneas 74-87: Tareas creadas directamente del array predefinido
Líneas 95-101: Ejecución fija (P0 en paralelo, P1 secuencial)

---

## 4. AUDITORÍA DE COORDINACIÓN ENTRE AGENTES

### Agentes Implementados

| Agente | Función Real | Limitación |
|--------|--------------|------------|
| **CHARON** | Evalúa 5 proveedores demo, genera orden de compra | Proveedores hardcodeados, no conecta a directorio real |
| **PERSEPHONE** | Valida presupuesto contra límite estático ($50,000) | Presupuesto no persiste, no hay categorías de gasto reales |
| **MINOS** | Crea escalaciones para aprobación humana | UI para aprobar existe, pero no hay persistencia ni notificación real |
| **ELYSIUM** | Genera plan de implementación (3 fases, 5 días) | Plan siempre es el mismo, no hay optimización basada en recursos |
| **TARTARUS** | Detecta anomalías basado en DENY de CERBERUS | Anomalías son simuladas, no hay monitoreo real de patrones |
| **CERBERUS** | Evalúa políticas, genera SHA-256, registra en NEAR simulado | Funcional, pero políticas son hardcodeadas |

### Falta de Coordinación Dinámica
- **No hay dependencias reales entre tareas:** El campo `dependsOn` siempre está vacío
- **No hay re-planificación:** Si una tarea falla, no hay recuperación o reasignación
- **No hay comunicación entre agentes:** Cada agente opera en silos, sin información compartida
- **No hay negociación:** CHARON y PERSEPHONE no coordinan presupuestos vs proveedores

---

## 5. GAPS EMPRESARIALES CRÍTICOS

### 5.1 Falta de Análisis de Lenguaje Natural
**Estado actual:**
- La instrucción del usuario se pasa como string a `createMission(title, description, budgetLimit)`
- HadesOrchestrator **ignora completamente** el contenido de `description`
- Las tareas se generan del array estático `DEMO_MISSION_PLAN`

**Qué falta:**
1. **LLM para descomponer instrucciones:** Analizar "Evaluar proveedores de servidores cloud para TechCore, presupuesto $100k, urgencia alta" y generar tareas específicas
2. **Extracción de entidades:** Detectar presupuestos, plazos, restricciones, stakeholders
3. **Generación de tareas dinámicas:** Crear tareas específicas según el caso, no reusar las mismas 5
4. **Adaptación de prioridades:** P0/P1/P2 según urgencia detectada en el texto

### 5.2 Falta de Contexto Empresarial Persistente
**Estado actual:**
- `MissionContext` tiene campos (`organizationId`, `budgetLimit`, `deadline`, `priority`, `tags`) pero son llenados con valores hardcodeados
- No hay base de datos de presupuestos, proyectos, proveedores, empleados

**Qué falta:**
1. **Modelo de datos real:** Tablas para presupuestos, proveedores, proyectos
2. **Integración ERP:** Conexión a sistemas reales (opcional pero deseable)
3. **Historial de decisiones:** Aprendizaje de aprobaciones pasadas para mejorar futuras

### 5.3 Escalaciones MINOS No Conectadas
**Estado actual:**
- MINOS crea objetos `EscalationRequest` y los publica al bus de eventos
- Frontend (JudgmentPanel) muestra las escalaciones y permite aprobar/rechazar
- **Pero:** la aprobación no se comunica de vuelta al backend para continuar la misión

**Qué falta:**
1. **Endpoint API:** `/api/v1/escalations/:id/decide` para recibir aprobación humana
2. **Reanudación de misión:** Cuando se aprueba, la misión debe continuar desde donde se pausó
3. **Notificación:** Alertas reales por email/Slack cuando se requiere intervención

### 5.4 CHRONOS No Persiste
**Estado actual:**
- UI permite crear tareas programadas con expresiones cron
- Tareas se guardan en estado local del navegador
- **Pero:** No hay backend job scheduler (node-cron, Bull Queue, etc.)

**Qué falta:**
1. **Job scheduler persistente:** Bull Queue + Redis o similar
2. **Endpoint para programar tareas:** API para crear/eliminar jobs programados
3. **Ejecución real:** Jobs deben ejecutar misiones vía API, no solo simular

---

## 6. SEPARACIÓN LÓGICA FUNCIONAL VS REPRESENTACIÓN GRÁFICA

### Estado Actual
**Separación parcial:**
- ✅ Lógica de agentes está en `packages/core/src/agents/`
- ✅ UI de dashboard está en `packages/frontend/src/pages/`
- ❌ Componentes 3D (HadesCore, HolographicCore, etc.) están mezclados con lógica de estado

### Problema de Acoplamiento
- **Dashboard.tsx** tiene código de orquestación hardcoded en `STAGE_TIMELINE` (líneas 34-41)
- Las 9 páginas del dashboard no deberían depender de cómo se visualiza el núcleo
- El núcleo visual es **un componente de presentación**, no parte de la lógica de negocio

### Arquitectura Híbrida Propuesta

```
┌─────────────────────────────────────────────────────────────────┐
│                     LÓGICA FUNCIONAL                          │
│  (packages/core/)                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Agents   │  │ CERBERUS │  │ Mission  │                  │
│  │ (LLM)    │  │ (Policies)│  │ Planner  │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│        │              │              │                         │
│        └──────────────┴──────────────┘                         │
│                       ↓                                      │
│              Event Bus (Mission Bus)                        │
│                       ↓                                      │
│                  API Gateway (Fastify)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ REST + WebSocket
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  DASHBOARD EJECUTIVO (React)                     │
│  (packages/frontend/src/pages/)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Throne   │  │ Dominion │  │ Judgment │  ← 9 módulos   │
│  └──────────┘  └──────────┘  └──────────┘                  │
│        (sin dependencia de cómo se ve el núcleo)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Componente React opcional
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│               COMPONENTE VISUAL INDEPENDIENTE                   │
│  (paquete separado o módulo lazy-loaded)                       │
│  ┌──────────────────────────────────────┐                      │
│  │ VisualRepresentation.tsx            │                      │
│  │ - Puede ser:                       │                      │
│  │   • SVG estático                    │                      │
│  │   • GLB/glTF (cuando esté listo)   │                      │
│  │   • Procedimental (no más por ahora)│                      │
│  │ - Recibe estado de agentes via props│                      │
│  │ - NO modifica lógica de negocio    │                      │
│  └──────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. PRIORIDADES TÉCNICAS PARA PLATAFORMA ÚTIL

### P0 — Crítico para Funcionalidad Empresarial
1. **Implementar LLM en HadesOrchestrator**
   - Usar Anthropic Claude SDK (ya aprobado en docs)
   - Prompt engineering para descomponer instrucciones en tareas específicas
   - Extraer: presupuesto, plazos, stakeholders, restricciones

2. **Generación dinámica de tareas**
   - Reemplazar `DEMO_MISSION_PLAN` con tareas generadas por LLM
   - Adaptar número y tipo de tareas según complejidad de la instrucción
   - Calcular dependencias entre tareas reales

3. **Endpoint de escalaciones MINOS**
   - API POST `/api/v1/escalations/:id/decide`
   - Reanudar misión desde punto de pausa
   - Notificar usuario vía WebSocket

### P1 — Importante para Completitud
4. **Persistencia de CHRONOS**
   - Integrar Bull Queue + Redis o similar
   - Jobs persistentes que sobreviven reinicios
   - Ejecución real de misiones programadas

5. **Contexto empresarial persistente**
   - SQLite → PostgreSQL en producción
   - Tablas: budgets, vendors, projects, approvals
   - Seed data inicial con datos demo realistas

6. **Decoupling visual**
   - Crear componente `VisualRepresentation` separado
   - Dashboard usa visual simplificado por defecto (SVG)
   - Visual premium (GLB) lazy-loaded cuando esté disponible

### P2 — Mejoras Continuas
7. **Optimización de CHARON**
   - Conectar a directorio de proveedores real
   - Caché de evaluaciones de proveedores
   - Historial de precios

8. **Mejoras en PERSEPHONE**
   - Categorías de presupuesto reales
   - Flujos de aprobación multietapa
   - Alertas de desvío proactivas

9. **Testing end-to-end**
   - Playwright o Cypress para flujos completos
   - Tests de integración para API + WebSocket
   - Tests de contrato para NEAR bridge

---

## 8. RECOMENDACIÓN VISUAL

### Estado del Núcleo Visual
- **Múltiples implementaciones:** HadesCore (v7), SovereignCore, HolographicCore3D, PremiumObsidianCore (rechazado)
- **Ninguna cumple la referencia:** Todas usan primitivas (icosaedros, esferas, torus, wireframes)
- **No es viable con procedimental:** La referencia requiere geometría obsidiana compleja que no se puede generar programáticamente sin Blender

### Recomendación
1. **Preservar HolographicCore3D** como visual simplificado actual (útil, funcional)
2. **No crear más intentos procedimentales** hasta tener recurso gráfico aprobado
3. **Contratar artista 3D o modelar en Blender** para crear GLB/glTF del núcleo obsidiana
4. **Mientras tanto:** Usar visual simplificado (SVG estático) en dashboard, enfocarse en funcionalidad

---

## 9. ESTADO DE LA RAMA

- **Rama:** `codex/recovery-omega-20261026`
- **Commits recientes:**
  - `db8bfa3` - backup antes de rediseño visual
  - `06ac259` - núcleo obsidiana procedimental (RECHAZADO VISUALMENTE)
- **TypeScript:** Sin errores
- **Build:** Exitoso
- **API y Seguridad:** Intactos

---

## 10. PRÓXIMOS PASOS RECOMENDADOS

1. ✅ Preservar dashboard funcional (9 módulos)
2. ✅ No integrar PremiumObsidianCore
3. ✅ Mantener API, seguridad y WebSocket intactos
4. 🔄 Implementar LLM en HadesOrchestrator para planificación dinámica
5. 🔄 Crear endpoint de escalaciones MINOS
6. 🔄 Separar lógica funcional de representación gráfica
7. ⏸️ Pausar desarrollo visual hasta tener recurso GLB aprobado
8. 🔄 Focalizar en funcionalidad empresarial real

---

**Conclusión:** HADES OMEGA tiene una base sólida de agentes, CERBERUS y NEAR, pero **no es una IA multiagente real** hasta que implemente planificación dinámica basada en LLM. La prioridad debe ser funcionalidad empresarial, no gráficos 3D.
