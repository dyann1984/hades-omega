# HADES OMEGA — Backlog Definitivo

**Versión:** 0.2 (Cierre de planificación)
**Período de desarrollo:** 1–14 de noviembre de 2026
**Cierre de entrega:** 14 de noviembre 2026, 23:59 UTC

---

## Leyendas

### Prioridad
- **P0** — Sin esto la demo no funciona. No negociable.
- **P1** — Mejora significativa de la demo. Solo si P0 termina antes del Día 11.
- **P2** — Deseable. Solo con margen real de tiempo.

### Estado de cada función (actualizado en desarrollo)
- `PLANIFICADA` — especificada en documentos, código no iniciado
- `EN CONSTRUCCIÓN` — en desarrollo activo
- `IMPLEMENTADA` — construida y con tests pasando
- `VERIFICADA` — probada de forma end-to-end en el flujo de demo

> **Nota:** En la fecha de este documento (Oct 2026) **todas las funciones están en estado PLANIFICADA**. Ningún componente de la aplicación ha sido desarrollado aún.

---

## ⚠ Verificaciones pendientes — no resueltas en esta fase

Las siguientes decisiones **no pueden resolverse desde este documento** y deben gestionarse de forma independiente antes o durante el Día 1:

| # | Verificación | Responsable | Impacto si no se resuelve |
|---|-------------|------------|--------------------------|
| VER-001 | **Elegibilidad de residentes mexicanos** — confirmar que el equipo puede participar en NEAR Hackathon 2026 según las bases de elegibilidad geográfica | Equipo | Bloquea submission completa |
| VER-002 | **Idioma de presentación** — confirmar si el submission acepta documentación en español o requiere inglés | Equipo | Afecta README, demo script y video |
| VER-003 | **Cuenta `hades-omega.testnet`** — NO verificada; su existencia debe confirmarse el Día 1 antes de planificar el trabajo NEAR | Equipo | Bloquea N-001 al N-004 |
| VER-004 | **Requisitos de submission** — confirmar lista exacta: repo, video, demo URL, descripción, contrato NEAR | Equipo | Puede añadir o eliminar entregables |

---

## Núcleo del MVP — 5 componentes P0

La demo funcional requiere exactamente estos cinco componentes. Todo lo demás es P1/P2.

```
HADES (orquestador)
  ↓ asigna tareas
CHARON (compras)  +  PERSEPHONE (presupuesto)
  ↓ propuestas de operación
CERBERUS GUARD + AUDIT (evaluación determinista + registro)
  ↓ ESCALATE
MINOS (aprobación humana)
  ↓ PERMIT con humanApprovedBy
NEAR Bridge → 1 transacción real verificable
```

---

## Tabla definitiva P0 — con distribución diaria

| ID | Tarea | Día | Est. | Depende de | Criterio de aceptación | Estado |
|----|-------|-----|------|-----------|----------------------|--------|
| **FUNDAMENTOS** |
| F-001 | Inicializar monorepo pnpm workspaces | 1 | 2h | — | `pnpm install` sin errores; estructura `packages/core`, `api`, `frontend`, `contracts` | PLANIFICADA |
| F-002 | TypeScript strict + Vitest en todos los paquetes | 1 | 2h | F-001 | `tsc --noEmit` pasa; `pnpm test` corre sin errores | PLANIFICADA |
| F-003 | Tipos base compartidos (interfaces de `06-api-contracts.md`) | 1 | 3h | F-002 | Todos los tipos del spec implementados; `tsc` pasa | PLANIFICADA |
| F-004 | SQLite + Drizzle ORM — schema inicial | 1 | 2h | F-001 | Tablas: Missions, Tasks, AuditRecords, Policies creadas con migraciones | PLANIFICADA |
| F-005 | `.gitignore` + `.env.example` + repo GitHub privado | 1 | 1h | — | `git grep -rE "private_key\|ed25519" .` retorna 0 coincidencias | VERIFICADA |
| F-006 | NEAR — verificar/crear cuenta `hades-omega.testnet` | 1 | 1h | VER-003 | `near state hades-omega.testnet` retorna datos de cuenta reales | PLANIFICADA |
| F-007 | Conectar `dyann1984/hades-omega` a Vercel `hades-omega-preview` + activar deploy desde `develop` | 1 | 0.5h | F-001 | URL Preview protegida activa; push a `develop` genera Preview automáticamente | PLANIFICADA |
| **CERBERUS** |
| C-001 | GUARD — parser y evaluador de políticas JSON | 2 | 4h | F-003 | TC-GUARD-001 al TC-GUARD-006 pasan | PLANIFICADA |
| C-002 | GUARD — determinismo verificado + política default | 2 | 3h | C-001 | TC-GUARD-007 pasa (100 iteraciones idénticas) | PLANIFICADA |
| C-003 | AUDIT — AuditRecord con SHA-256 + persistencia append-only | 3 | 4h | F-004, C-001 | TC-AUDIT-001 al TC-AUDIT-003 pasan; registros no modificables en DB | PLANIFICADA |
| C-004 | AUDIT — integración automática GUARD→AUDIT + criterios on-chain | 3 | 1h | C-001, C-003 | TC-AUDIT-004 pasa: toda decisión GUARD genera un AuditRecord; CRITICAL_OPS activa NEAR Bridge | PLANIFICADA |
| **AGENTES** |
| A-000 | Interfaz `LLMProvider` + `ClaudeProvider` + `MockProvider` | 3 | 3h | F-003 | `MockProvider` usado en tests; `ClaudeProvider` llama a Anthropic API real | PLANIFICADA |
| A-001 | Mission Bus (EventEmitter tipado) | 3 | 2h | F-003 | pub/sub funciona con tipos; mensajes no se pierden en flujo normal | PLANIFICADA |
| A-002 | AgentBase — ciclo de vida + `proposeOperation()` obligatorio | 4 | 3h | A-001, C-001 | `proposeOperation()` invoca CERBERUS siempre; nunca bypaseable | PLANIFICADA |
| A-003 | HADES — descomposición de misión en tareas | 4 | 5h | A-002, A-000 | Misión TechCore → TaskPlan con tareas para CHARON y PERSEPHONE generado | PLANIFICADA |
| A-004 | CHARON — evaluación de proveedores + PurchaseOrderProposal | 4 | 5h | A-002, A-000 | Evalúa 3 proveedores sintéticos; propone $78,500 MXN; re-propone $42,000 MXN tras DENY | PLANIFICADA |
| A-005 | PERSEPHONE — validación presupuestaria determinista | 5 | 4h | A-002 | TC-PERS-001 al TC-PERS-004 pasan; lógica sin LLM | PLANIFICADA |
| A-006 | MINOS — flujo de escalación + aprobación humana | 5 | 4h | A-002, C-001 | EscalationRequest llega desde CERBERUS ESCALATE; HumanDecision registrada con identidad | PLANIFICADA |
| **API GATEWAY** |
| G-001 | Fastify + JWT + endpoints de misiones | 6 | 4h | A-003 | POST /missions crea misión; GET /missions/:id retorna estado | PLANIFICADA |
| G-002 | WebSocket server — broadcast de eventos en tiempo real | 6 | 3h | G-001, A-001 | Eventos AgentStatus, CERBERUSDecision, EscalationCreated llegan al cliente | PLANIFICADA |
| G-003 | Endpoints CERBERUS (audit list + decision detail) | 6 | 2h | G-001, C-003 | TC-AUDIT-005 pasa: GET /cerberus/audit con filtros por agente/outcome/paginación; GET /cerberus/audit/:id | PLANIFICADA |
| G-004 | Endpoint MINOS — POST /escalations/:id/decide | 6 | 1h | G-001, A-006 | Operador puede aprobar/rechazar desde UI | PLANIFICADA |
| **NEAR** |
| N-001 | Contrato Rust `audit-registry` + tests unitarios | 7 | 6h | F-006 | `cargo test` pasa; `store_audit_hash` y `get_audit_entry` implementadas | PLANIFICADA |
| N-002 | Deploy contrato a `audit.hades-omega.testnet` | 8 | 2h | N-001 | `near call audit.hades-omega.testnet get_total_count` retorna 0 real | PLANIFICADA |
| N-003 | NEAR Bridge — modo simulación | 7 | 3h | F-003, C-004 | TC-INT-003 pasa; en simulación nunca llama a near-api-js | PLANIFICADA |
| N-004 | NEAR Bridge — modo real + criterios de registro on-chain | 8 | 3h | N-002, N-003 | TC-INT-004 pasa manualmente; al menos 1 tx real con hash visible en explorador | PLANIFICADA |
| G-005 | Endpoint NEAR — GET /near/transactions | 8 | 1h | G-001, N-004 | Lista transacciones con txHash y explorerUrl | PLANIFICADA |
| G-006 | Railway — deploy Node.js + volumen SQLite (`PORT=3001`, `pnpm --filter api start`) | 8 | 1h | G-001, N-004 | Backend accesible públicamente vía HTTPS; `VITE_API_URL` apunta a Railway; frontend conecta sin CORS | PLANIFICADA |
| **FRONTEND** |
| UI-001 | Setup React+Vite+TailwindCSS + tokens de color | 9 | 2h | F-001 | App renderiza con tema oscuro correcto; paleta obsidiana/dorado/eléctrico aplicada | PLANIFICADA |
| UI-002 | Layout responsivo + WebSocket client + toggle tema | 9 | 3h | UI-001, G-002 | Eventos en tiempo real recibidos; layout correcto en mobile y desktop | PLANIFICADA |
| UI-003 | Dashboard: crear misión + progreso de tareas en tiempo real | 9 | 5h | UI-002, G-001 | Crear misión desde UI; tareas aparecen y actualizan estado en tiempo real | PLANIFICADA |
| UI-004 | Sidebar de agentes — estado en tiempo real | 9 | 3h | UI-002, G-002 | 5 AgentCards activas (HADES, CHARON, PERSEPHONE, MINOS, CERBERUS) + 2 stubs IDLE (ELYSIUM, TARTARUS) mostradas vía WebSocket | PLANIFICADA |
| UI-005 | Panel CERBERUS — AuditRecords + badges PERMIT/DENY/ESCALATE | 10 | 4h | UI-002, G-003 | Lista de records con badge correcto; clic muestra detalle con contentHash | PLANIFICADA |
| UI-006 | Panel MINOS — formulario de aprobación humana | 10 | 3h | UI-002, G-004 | Escalación aparece en UI; operador puede aprobar/rechazar; resultado visible | PLANIFICADA |
| UI-007 | NEARTransactionBadge + enlace al explorador | 10 | 2h | UI-002, G-005 | Badge con txHash abreviado; clic abre testnet.nearblocks.io en nueva pestaña | PLANIFICADA |
| **INTEGRACIÓN Y DEMO** |
| D-001 | E2E flujo completo (modo simulación) | 11 | 4h | Todo lo anterior | TC-E2E-001 pasa en simulación; flujo completo < 3 min sin errores | PLANIFICADA |
| D-002 | E2E flujo completo (modo NEAR real) | 11 | 2h | D-001, N-004 | Al menos 1 tx real con hash verificable en testnet.nearblocks.io | PLANIFICADA |
| D-003 | Datos de demo TechCore Industries pre-cargados | 11 | 1h | D-001 | Demo inicia sin setup manual; proveedores sintéticos y presupuesto listos | PLANIFICADA |
| D-004 | Checklist de seguridad completo (`05-security-threats.md §6`) | 12 | 1h | Todo | Todos los ítems ✓; `git grep` sin secretos | PLANIFICADA |
| D-005 | Corrección de bugs E2E | 12 | 4h | D-001, D-002 | Flujo de demo ejecuta sin interrupciones manuales | PLANIFICADA |
| D-006 | Video de demostración (2–4 min) | 13 | 2h | D-002 | Video muestra misión → DENY → ESCALATE → aprobación → tx NEAR real | PLANIFICADA |
| D-007 | Capturas de pantalla para X (Twitter) | 13 | 1h | D-002 | 3–5 capturas: núcleo, CERBERUS panel, NEAR tx en explorador | PLANIFICADA |
| D-008 | README final en **inglés** — instalación, demo y descripción del proyecto | 13 | 1h | D-001 | README en inglés; `pnpm install && pnpm dev` funciona en máquina limpia; pasos de demo en inglés | PLANIFICADA |
| D-009 | Repositorio GitHub — hacer público | 13 | 0.5h | D-008 | Repo accesible públicamente; sin secretos en historial de git | PLANIFICADA |
| D-010 | Publicación en X (Twitter) con video y capturas | 14 | 1h | D-006, D-007 | Post publicado con hashtag del hackathon, enlace al repo, video/capturas | PLANIFICADA |
| D-011 | Submission oficial al hackathon | 14 | 1h | D-009, D-010, VER-001, VER-002 | Formulario enviado antes del 14 Nov 23:59 UTC; confirmación recibida | PLANIFICADA |

---

## Distribución diaria — Días 1 al 14

| Día | Fecha | Tareas P0 | Carga (2 personas) | Resultado verificable al final del día |
|-----|-------|-----------|-------------------|---------------------------------------|
| 1 | Nov 1 | F-001, F-002, F-003, F-004, F-005 ✓, F-006, F-007 | 11.5h | Monorepo corriendo, tipos definidos, cuenta NEAR confirmada, Preview Vercel activo |
| 2 | Nov 2 | C-001, C-002 | 7h | CERBERUS GUARD con TC-GUARD-001 al 007 pasando |
| 3 | Nov 3 | C-003, C-004, A-000, A-001 | 10h | AUDIT funcionando; LLMProvider + Mission Bus listos |
| 4 | Nov 4 | A-002, A-003, A-004 | 13h | HADES descompone misión; CHARON evalúa y propone |
| 5 | Nov 5 | A-005, A-006 | 8h | PERSEPHONE valida presupuesto; MINOS recibe escalaciones |
| 6 | Nov 6 | G-001, G-002, G-003, G-004 | 10h | API Gateway con WebSocket; misión creada desde HTTP |
| 7 | Nov 7 | N-001, N-003 | 9h | Contrato Rust con tests; Bridge en simulación funcional |
| 8 | Nov 8 | N-002, N-004, G-005, G-006 | 7h | Contrato deployado en testnet; primera tx real visible; backend en Railway accesible |
| 9 | Nov 9 | UI-001, UI-002, UI-003, UI-004 | 13h | Dashboard funcional; agentes en tiempo real |
| 10 | Nov 10 | UI-005, UI-006, UI-007 | 9h | Panel CERBERUS; aprobación MINOS; badge NEAR |
| 11 | Nov 11 | D-001, D-002, D-003 | 7h | Flujo E2E completo con tx NEAR real verificada |
| 12 | Nov 12 | D-004, D-005 + P1 si disponible | 5h P0 + resto P1 | Demo sin bugs; núcleo holográfico R3F si tiempo |
| 13 | Nov 13 | D-006, D-007, D-008, D-009 | 4.5h | Repo público; video grabado; README final |
| 14 | Nov 14 | D-010, D-011 | 2h | Post en X publicado; submission enviada antes de 23:59 UTC |

**Carga total P0:** ~115h estimadas
**Capacidad disponible:** 2 personas × 14 días × 5h efectivas = **140h**
**Margen:** ~25h — distribuido en Días 12 y 13 para P1 y correcciones

---

## P1 — Si el P0 termina antes del Día 12

| ID | Tarea | Día tentativo | Est. |
|----|-------|--------------|------|
| C-010 | CERBERUS RESPONSE — triggers BLOCK/QUARANTINE/SHUTDOWN | 12 | 5h |
| A-007 | ELYSIUM — planificación de recursos | 12 | 4h |
| A-008 | TARTARUS — detección de anomalías | 12 | 4h |
| UI-009 | Núcleo holográfico React Three Fiber (R3F) | 12 | 8h |
| UI-000 | Fallback SVG 2D para núcleo | 12 | 3h |

> TARTARUS y ELYSIUM **no aparecen en el flujo de demo principal**. Si el tiempo es ajustado, priorizar UI-009 (impacto visual para jueces) sobre los agentes secundarios.

## P2 — Solo con margen real

| ID | Tarea |
|----|-------|
| UI-012 | Animaciones Framer Motion en AgentCards |
| UI-013 | `prefers-reduced-motion` aplicado |
| UI-014 | Pantalla de informe final de misión (MissionReport) |
| UI-015 | Interfaz bilingüe español/inglés (`react-i18next`) — toggle en header | 13 | 4h | UI-003, UI-005 | UI renderiza en ambos idiomas; textos clave en archivos `locales/en.json` y `locales/es.json` |

---

## Ruta crítica

```
F-001 (Día 1)
  └→ F-003 → C-001 → C-002 → A-002 → A-003 → G-001 → UI-003
                   └→ C-003 → C-004 → N-003 → N-004 → D-002 → D-011
                                                              ↑
                                              F-006 → N-001 → N-002 ┘
```

**El cuello de botella más crítico es F-006 (cuenta NEAR).**
Si la cuenta no puede crearse el Día 1, todo el trabajo NEAR (Días 7–8) y la tx real de la demo quedan en riesgo. Plan de contingencia: preparar cuenta alternativa con nombre diferente el mismo Día 1.

---

## Qué NO entra en el MVP (definitivo)

| Función | Razón de exclusión | Documento afectado |
|---------|-------------------|-------------------|
| ELYSIUM — planificación | No aparece en el flujo de demo principal | `02-agents-design.md` |
| TARTARUS — anomalías | La demo no requiere respuesta a incidentes activa | `02-agents-design.md` |
| CERBERUS RESPONSE completo | DENY y ESCALATE vienen de GUARD; RESPONSE es para incidentes activos | `03-cerberus-spec.md` |
| Múltiples misiones simultáneas | UI de una sola misión es suficiente para la demo | `07-frontend-design.md` |
| R3F holográfico (P0) | Movido a P1; SVG 2D es fallback aceptable si no hay tiempo | `07-frontend-design.md` |
| Base de datos de producción (PostgreSQL) | SQLite es suficiente para 14 días | `01-architecture.md` |

---

*Relacionado: `01-architecture.md`, `08-test-plan.md`, `10-demo-script.md`, `04-near-integration.md`*
