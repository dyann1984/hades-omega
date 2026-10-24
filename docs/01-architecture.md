# HADES OMEGA — Arquitectura Técnica

**Versión:** 0.1 (Fase de Planificación)
**Fecha:** Octubre 2026

---

## 1. Visión arquitectónica

HADES OMEGA sigue un patrón de **sistema multiagente con bus de eventos y motor de políticas centralizado**. Cada agente opera de forma autónoma dentro de su dominio, pero toda acción que cruce una frontera de sistema pasa obligatoriamente por CERBERUS antes de ejecutarse.

La arquitectura prioriza:

1. **Auditabilidad total**: ninguna operación crítica ocurre sin registro
2. **Determinismo en seguridad**: las políticas se evalúan en código, no en LLM
3. **Separación clara**: simulación vs. ejecución real (especialmente en NEAR)
4. **Trazabilidad end-to-end**: misión → tarea → agente → CERBERUS → NEAR

---

## 2. Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │  Dashboard  │  │  Holographic Core │  │  CERBERUS Panel    │ │
│  │  (Misiones) │  │  (Red de Agentes) │  │  (Audit / Policy)  │ │
│  └──────┬──────┘  └────────┬─────────┘  └─────────┬──────────┘ │
└─────────┼──────────────────┼───────────────────────┼────────────┘
          │  WebSocket (estado en tiempo real)        │
          ▼                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API GATEWAY (Fastify)                   │
│  REST endpoints + WebSocket server + autenticación JWT          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────────────────────┐
│ MISSION BUS  │ │  CERBERUS   │ │        AGENT RUNTIME         │
│ (Event Bus)  │ │  ENGINE     │ │                              │
│              │ │  GUARD      │ │  ┌──────┐  ┌──────────────┐  │
│  pub/sub de  │ │  AUDIT      │ │  │HADES │  │   CHARON     │  │
│  tareas y    │ │  RESPONSE   │ │  │(orch)│  │ (purchases)  │  │
│  eventos     │ │             │ │  └──┬───┘  └──────────────┘  │
│              │ │  ← toda op  │ │    │      ┌──────────────┐   │
│              │ │  pasa aquí  │ │    ├─────▶│  PERSEPHONE  │   │
│              │ │  antes de   │ │    │      │  (finance)   │   │
│              │ │  ejecutar   │ │    │      └──────────────┘   │
└──────────────┘ └──────┬──────┘ │    │      ┌──────────────┐   │
                        │        │    ├─────▶│    MINOS     │   │
                        │ PERMIT │    │      │ (validation) │   │
                        │        │    │      └──────────────┘   │
                        ▼        │    │      ┌──────────────┐   │
               ┌─────────────┐   │    ├─────▶│   ELYSIUM    │   │
               │   NEAR      │   │    │      │ (planning)   │   │
               │  TESTNET    │   │    │      └──────────────┘   │
               │  BRIDGE     │   │    │      ┌──────────────┐   │
               └──────┬──────┘   │    └─────▶│   TARTARUS   │   │
                      │          │           │ (incidents)  │   │
                      ▼          └───────────└──────────────┘   │
               testnet.near.org  └─────────────────────────────┘
```

---

## 3. Flujo de datos — Misión empresarial

```
1. Usuario ingresa misión: "Evaluar proveedores de servidores, presupuesto $50,000 MXN"
2. API Gateway recibe → crea MissionRecord → publica en Mission Bus
3. HADES (orquestador) consume evento → descompone en tareas:
   - Tarea A → CHARON: buscar y evaluar proveedores
   - Tarea B → PERSEPHONE: validar presupuesto disponible
   - Tarea C → ELYSIUM: calcular cronograma de implementación
4. Cada agente ejecuta su tarea y genera OperationProposal
5. OperationProposal → CERBERUS GUARD:
   - Evalúa contra política vigente
   - Resultado: PERMIT | DENY | ESCALATE
6. Si PERMIT:
   - CERBERUS AUDIT genera AuditRecord firmado
   - Si operación es crítica → NEAR Bridge → tx on-chain
   - Agente ejecuta la operación
7. Si ESCALATE → MINOS presenta a usuario para aprobación humana
8. Si DENY → TARTARUS registra intento, RESPONSE evalúa severidad
9. Todos los eventos fluyen por WebSocket al frontend en tiempo real
```

---

## 4. Capas del sistema

### 4.1 Capa de presentación (Frontend)

- React 18 + Vite
- TailwindCSS para layout y tipografía
- React Three Fiber (R3F) para el núcleo holográfico animado — carga diferida, con fallback SVG 2D
- Framer Motion para transiciones de estado de agentes
- WebSocket client para updates en tiempo real
- Zustand para estado global del cliente

### 4.2 Capa de API

- Fastify (Node.js) — alta performance, validación de schemas
- JWT para autenticación de sesión
- WebSocket server (ws) para streaming de eventos
- Rate limiting y validación de inputs en esta capa

### 4.3 Capa de agentes

- TypeScript + patrón custom agent loop
- Cada agente: clase independiente con estado propio
- Comunicación vía Mission Bus (EventEmitter interno en dev, Redis pub/sub en prod)
- LLM calls solo para razonamiento, nunca para decisiones de política

### 4.4 Motor CERBERUS

- TypeScript puro, sin dependencias de LLM
- Políticas en formato JSON Schema validadas en runtime
- AuditRecord con hash SHA-256 del contenido + timestamp
- Interfaz con NEAR Bridge para registro on-chain de operaciones críticas

### 4.5 Capa NEAR

- `near-api-js` para interacción con testnet
- Contrato de auditoría en Rust + NEAR SDK
- Manejo de claves via `~/.near-credentials` (nunca en código fuente)
- Modo simulación (default en dev) vs. modo real (flag explícito)

### 4.6 Capa de datos

- SQLite para desarrollo local
- Esquema: Missions, Tasks, AuditRecords, Policies, AgentStates, NEARTransactions
- Migraciones versionadas desde el inicio

---

## 5. Decisiones técnicas clave

### 5.1 ¿Por qué TypeScript para agentes en lugar de Python?

TypeScript permite compartir tipos entre frontend, backend y lógica de agentes en el mismo monorepo. Reduce la superficie de errores de serialización y facilita el trabajo de un equipo pequeño en 14 días.

**Compromiso:** el ecosistema de LLM en TypeScript es menos maduro que Python. Mitigación: Anthropic SDK oficial para TypeScript (`@anthropic-ai/sdk`) + capa de abstracción interna.

### 5.1b ¿Por qué Anthropic Claude como proveedor LLM principal?

**Decisión aprobada (Oct 2026):** Anthropic Claude es el proveedor principal. Se implementa una interfaz `LLMProvider` que abstrae los llamados al LLM, permitiendo incorporar OpenAI u otros proveedores sin cambiar la lógica de los agentes.

```typescript
interface LLMProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<string>
  stream(messages: Message[], options?: CompletionOptions): AsyncIterable<string>
}
// ClaudeProvider implementa LLMProvider
// OpenAIProvider implementa LLMProvider (para uso futuro)
```

CERBERUS es completamente independiente del proveedor LLM — no realiza ningún llamado a modelos de IA en su pipeline de evaluación.

### 5.2 ¿Por qué motor CERBERUS determinista en lugar de LLM-as-judge?

Un LLM como árbitro de seguridad introduce no-determinismo, latencia y puntos de falla. Las políticas empresariales son reglas precisas que deben comportarse igual en cada evaluación. El código determinista es testeable, auditable y predecible.

**Compromiso:** menor flexibilidad para políticas muy complejas. Mitigación: las políticas se expresan en JSON Schema extensible.

### 5.3 ¿Por qué SQLite para dev en lugar de PostgreSQL directo?

Cero configuración, ideal para sprint de 14 días. La capa de acceso a datos usa un ORM (Drizzle) que permite migrar a PostgreSQL sin cambiar código de negocio.

### 5.4 ¿Por qué un solo contrato NEAR en lugar de múltiples?

**Decisión confirmada (Oct 2026):** El MVP usa un único contrato de auditoría. Evitar contratos innecesarios reduce la superficie de bugs bajo presión de tiempo y mantiene la integración NEAR verificable y auditable. Las transacciones simuladas y las confirmadas en blockchain se distinguen explícitamente en el sistema.

### 5.5 Separación simulación / ejecución real

Toda operación tiene un campo `executionMode: 'simulation' | 'real'`. En modo simulación, NEAR Bridge escribe en una base de datos local en lugar de enviar tx. El modo real requiere flag explícito `NEAR_EXECUTION_MODE=real` en variables de entorno.

---

## 6. Estructura de directorios (propuesta para Fase 1)

```
L:\HADES\
├── README.md
├── docs\                          # Documentación (Fase 0)
├── packages\
│   ├── core\                      # Agentes + CERBERUS (TypeScript)
│   │   ├── src\
│   │   │   ├── agents\            # P0: HADES, CHARON, PERSEPHONE, MINOS + stubs ELYSIUM/TARTARUS
│   │   │   ├── cerberus\          # P0: GUARD, AUDIT  |  P1: RESPONSE
│   │   │   ├── mission-bus\       # Event bus
│   │   │   ├── near-bridge\       # Integración NEAR
│   │   │   └── types\             # Interfaces compartidas
│   │   └── tests\
│   ├── api\                       # Fastify API Gateway
│   ├── frontend\                  # React App
│   └── contracts\                 # Rust NEAR contracts
├── .env.example                   # Variables sin valores sensibles
├── package.json                   # Workspace root
└── turbo.json                     # Turborepo config
```

---

## 7. Riesgos arquitectónicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Latencia LLM hace la demo lenta | Alta | Medio | Respuestas cacheadas para demo + streaming visible |
| Contrato Rust con bug en testnet | Media | Alto | Test unitarios exhaustivos antes de deploy |
| Integración NEAR falla en demo | Media | Alto | Modo simulación como fallback visible |
| Three.js performance en hardware de jueces | Media | Medio | LOD dinámico, fallback a SVG animado |
| Coordinación entre agentes con race conditions | Alta | Medio | Diseño secuencial primero, async solo donde necesario |

---

## 8. Decisiones pendientes

- [ ] Seleccionar LLM provider (Anthropic Claude vs. OpenAI) — evaluar latencia y costo
- [ ] Confirmar si el hackathon requiere código abierto en GitHub
- [ ] Decidir si usar Turborepo o pnpm workspaces simple
- [ ] Definir el caso de negocio concreto para la demo (ver `10-demo-script.md`)
- [ ] Evaluar si Three.js holographic core es viable en 14 días o usar alternativa

---

*Relacionado: `02-agents-design.md`, `03-cerberus-spec.md`, `04-near-integration.md`*
