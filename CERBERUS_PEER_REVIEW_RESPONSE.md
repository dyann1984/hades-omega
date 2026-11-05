# Respuesta a la revisión externa de CERBERUS (NEXUS / HiveBid / AEGIS)

Fecha: 2026-11-05. Rama `codex/hades-omega-finalizacion`, HEAD `98b9ee1`. Documento revisado: `docs/CERBERUS_PEER_REVIEW.es.md` (copiado desde `Downloads`, sin cambios). Auditoría **solo de lectura**: no se modificó código, contratos, configuración, credenciales ni transacciones; los únicos archivos nuevos son este informe y la copia del documento original.

## 0. Cómo leer este informe

- La revisión de NEXUS se escribió contra especificaciones antiguas (`D:/Temp/hades-omega/docs/*`, copias en `docs/03…09`), donde la integración NEAR figuraba como «PLANIFICADA — 0 txs reales» (`docs/04-near-integration.md:26`). Aquí se contrasta con el **código actual**.
- Una conclusión marcada «(lectura)» viene de leer el código, no de ejecutarlo. Las pruebas con RPC o contrato simulados **no** cuentan como evidencia on-chain.
- Ejecutado en esta auditoría: (a) experimento sobre una base SQLite temporal con el compilado actual para la cadena de auditoría; (b) una ejecución del verificador on-chain de solo lectura.
- Nota de método: una versión previa de este informe se hizo sin el documento y asumió algunos temas por tu descripción. Esta versión los reemplaza; las diferencias relevantes son C-1 (se refiere a la ruta del pago y a guardar la decisión en la llamada), C-4 (`policy_hash` dentro de la propuesta), C-5 (sensibilidad controlada por quien llama) y C-9 (promesa de garantía on-chain).

## 1. Resumen

> **Actualización:** la tabla siguiente es el diagnóstico inicial (antes de corregir). El estado vigente tras las correcciones locales está en la **sección 8**.

| ID | Hallazgo de NEXUS | Estado real | Severidad residual | Prioridad hackathon |
|---|---|---|---|---|
| C-1 | Fail-secure solo declarado; falta hard gate y decisión en la llamada | **PARCIAL** | Media | P1 |
| C-2 | Orden/prioridad de reglas y property-tests | **PARCIAL** | Baja-Media | P2 |
| C-3 | Cadena de auditoría verificable (prev-hash, comando verify) | **PARCIAL** | Media-Alta | **P0** |
| C-4 | `policy_hash` obsoleto entre propuesta y ejecución | **RESUELTO** en la vía de aprobaciones; **PARCIAL** en la propuesta | Baja | P2 |
| C-5 | Sensibilidad definida por quien llama | **RESUELTO** (salvedad menor) | Baja | P3 |
| C-6 | Confianza del puente NEAR; reconciliación y «pending on-chain» | **RESUELTO** en intenciones; **PARCIAL** en la vía de agentes heredada | Baja-Media | P2 |
| C-7 | Catálogo estable de deny-reasons | **VIGENTE** (parcialmente mitigado) | Media | P1 |
| C-8 | Eventos de gobernanza NEP-297 | **PARCIAL** (locales) / **VIGENTE** (on-chain) | Media | P1 (documentar) |
| C-9 | No prometer garantía on-chain con un deploy de papel | **PARCIAL**: ya hay deploy y una tx real documentados; **NO VERIFICABLE hoy**; documento 04 desactualizado | Media | **P0** |

## 2. Análisis por hallazgo

### C-1 — Fail-secure declarado vs hard gate · PARCIAL

**Qué dijo NEXUS:** CERBERUS no está en el camino de la llamada; la decisión no se compromete en la llamada NEAR; cualquier agente podría evadirlo. Pide hard gate en operaciones críticas y guardar la decisión en la transacción/log.

**Estado actual:**
- **Hard gate para efectos externos: sí, estructural.** `CerberusGate.authorize/consumeGrant` (`packages/api/src/cerberus-gate.ts:129,138`). El puente NEAR en modo real **falla cerrado** sin gate o sin grant válido para exactamente los mismos parámetros, y el gate no puede sustituirse (`packages/core/src/near-bridge/index.ts:24-26,51-52`; `core/src/cerberus/bypass.test.ts:101-130`). CHRONOS autoriza cada ejecución (`chronos/chronos.ts:209`); el LLM pasa por `llm-governor.ts:142-144`; la parada se revalida en `consumeGrant`. Pruebas: `cerberus-gate.test.ts:195-274`; parada en lanzamientos y aprobaciones: `emergency-stop-guard.test.ts` (commit `9a0fbc0`).
- **La decisión viaja en la llamada NEAR:** `storeAuditHash` envía `decision`, `contentHash` (hash del registro de auditoría, que incluye `policyHash`, `ruleMatched` y razón), `operationType` y `agentName` (`core/src/agents/base.ts:62-82`; argumentos validados en `tools.ts` `near.audit_hash_submit`). La decisión queda comprometida on-chain como atestación **posterior**; el contrato **no** valida política (es un registro, `lib.rs:46-90`). No existe ruta de pago que dependa del contrato: `payment.execute` está registrado sin ejecutor.
- **Fail-closed ante error interno: no cumplido.** La especificación declara `DENY GUARD_INTERNAL_ERROR` ante excepción o timeout (`docs/03-cerberus-spec.md:68,309`); `CerberusGUARD.evaluate` (`core/src/cerberus/guard.ts`) no tiene `try/catch` (0 coincidencias de `try`/`GUARD_INTERNAL_ERROR`). Una excepción se propaga al agente.

**Vías sin `CerberusGate` (lectura):**
1. **Agentes heredados:** `proposeOperation` devuelve la decisión y el agente actúa por convención; sólo el efecto NEAR está protegido por el puente. Hoy los agentes sólo hacen operaciones internas sin efecto externo.
2. **Misiones locales** usan `policyGuard.evaluate` (operación `CRYPTO_HASH`, efecto local) sin grant (`sqlite.ts:601,642`).
3. **Parada:** la aplica el nuevo hook HTTP y el gate, pero la reconciliación de arranque (`reconcileOnStartup`, `sqlite.ts:446`) reanuda operaciones `APPROVED` sin consultar `gate.isStopped()` (lectura; efecto local).
4. `docs/09-cerberus-gate.md` admite: un ejecutor nuevo que no llame a `authorize`/`consumeGrant` no está protegido.

**Pruebas faltantes:** excepción en `evaluate` → DENY; prueba de arquitectura que falle si aparece código con efecto externo fuera de rutas con gate; arranque con parada activa.
**Riesgo real:** bajo hoy (efectos externos con gate; firma apagada por defecto). El riesgo es de regresión y de la brecha de la excepción no capturada.
**Corrección:** `try/catch` → `DENY GUARD_INTERNAL_ERROR` con auditoría; prueba de arquitectura; `isStopped()` en el arranque. Aclarar en documentación que el contrato es un registro y no impone política.

### C-2 — Orden y prioridades · PARCIAL

**Qué dijo NEXUS:** la spec no define orden ni desempate; pide prioridad explícita, orden determinista y property-tests «mismo input → mismo veredicto».

**Estado actual:** la limitación descrita en la spec ya no aplica al código: cada regla tiene `priority` (`core/src/cerberus/policy.ts`), `evaluate` filtra las activas, ordena por prioridad descendente y devuelve la primera coincidente; sin coincidencia, `DENY` (R-008, prioridad 1) (`guard.ts`, `evaluate`). No depende del orden de diccionarios. Pruebas de ejemplo: determinismo (`guard.test.ts:147`), sin elusión por cambio de agente (`:121`), matriz de permisos en el hash (`:154`), `bypass.test.ts`. Las reglas no son editables en vivo: `updatePolicy` (`guard.ts:167`) sólo cambia lista de proveedores y presupuestos y no tiene llamadores en producción.

**Huecos:**
- **Desempates implícitos:** empates de prioridad se resuelven por el orden estable del arreglo (hay empates reales, p. ej. R-003/R-013 = 80, R-012/R-014 = 190; hoy inocuos por tipos de operación distintos). No hay regla «DENY gana al empatar» ni validación de unicidad.
- **No hay property-tests** (búsqueda de `fast-check`/`property` en las pruebas de core: 0 resultados); sólo pruebas de ejemplo.
- No hay prueba de reglas contradictorias.

**Riesgo real:** bajo con la política fija; sube si se permite editar reglas.
**Corrección:** orden total (prioridad ↓, DENY > ESCALATE > PERMIT, id) con validación al construir; añadir `fast-check` (revisar licencia MIT y fijar versión) con propiedades de determinismo, de monotonía de DENY y de «clave de permutación de reglas no altera el veredicto».

### C-3 — Cadena de auditoría verificable · PARCIAL

**Qué dijo NEXUS:** falta prev-hash/Merkle y un comando verify independiente.

**Estado actual (la limitación descrita ya no aplica en lo básico):** `recordAuditEvent` encadena SHA-256 sobre `prev_hash|id|actor|mission|action|result|correlation|timestamp` (`sqlite.ts:223`); `verifyAuditIntegrity` recalcula la cadena (`sqlite.ts:243`); existe el trabajo de CHRONOS `AUDIT_CHAIN_VERIFY`; el gate audita cada decisión, aprobación y parada. Prueba: `cerberus-gate.test.ts:266`. Evidencia documentada: 13 eventos sin ruptura.

**Experimento ejecutado** (SQLite temporal, compilado actual, 4 eventos):

| Prueba | Resultado |
|---|---|
| Base | `verified: true` |
| T1: alterar evento intermedio y poner `hash = NULL` | **Detectado** (el `prev_hash` del siguiente no coincide) |
| T2: borrar el último evento | **`verified: true`, `totalEvents: 3`** — el truncamiento de cola no se detecta |

**Debilidades:** (1) truncamiento de cola indetectable (T2 ejecutado); (2) un evento con `hash` nulo se omite como «pre-migración» (`sqlite.ts:248-251`): si es el último, alterarlo pasa la verificación (lectura); (3) sin clave (HMAC) quien escriba en la base puede recalcular una cadena válida; (4) lectura-luego-inserción no atómica entre procesos (lectura); (5) **no hay comando de verificación independiente**: el verificador existente sólo comprueba NEAR; (6) la cadena sólo está anclada on-chain si se sube su cabeza, y hoy no se hace; (7) `CerberusAUDIT` de core es en memoria y reemplazable (`setNearTx`), a pesar de que la spec lo llama «inmutable» (`docs/03-cerberus-spec.md:149`).

**Riesgo real:** quien tenga acceso a la base puede ocultar actividad reciente. Para jueces, no afirmar «inmutable» sin matices.
**Corrección (P0):** endurecer `verifyAuditIntegrity` (hash nulo posterior al primero con hash; devolver `headHash`/`totalEvents`), ancla local de la cabeza, `scripts/verify-audit-chain.cjs` de sólo lectura que pueda ejecutar un tercero, `recordAuditEvent` en transacción inmediata. Opcional y con autorización: anclar `headHash` con el contrato ya desplegado (`store_audit_hash`, requiere habilitar firma y aprobación humana) — equivalente funcional a la raíz Merkle por lote que propone NEXUS, sin tocar el contrato.

### C-4 — `policy_hash` obsoleto entre propuesta y ejecución · RESUELTO (aprobaciones) · PARCIAL (propuesta)

**Qué dijo NEXUS:** fijar `policy_hash`/`policy_version` en `OperationProposal` y verificar coincidencia antes de PERMIT.

**Estado actual (demostrado con pruebas):** las aprobaciones del gate guardan `params_hash = SHA-256(canonicalJson({tool, agent, params}))` y `policy_hash = SHA-256(hash de política | hash del registro de herramientas)` (`cerberus-gate.ts:65,155,210-215`); `decide` y el uso rechazan `POLICY_CHANGED` (`:123,225`), `PARAMS_ALTERED`, `APPROVAL_EXPIRED` y `APPROVAL_REUSED`; el consumo es atómico y la vigencia máxima 15 min. El hash del registro de herramientas cambia si cambia cualquier límite o permiso. Las intenciones NEAR guardan `policyHash` y lo comparan al aprobar (`near-intents.ts:76,84`). Pruebas: `cerberus-gate.test.ts:91,99,112,120,131,142,181`; `near-intents.test.ts:23,37,49`. En la transacción real documentada se consumió una aprobación de un solo uso ligada a un hash.

**Diferencia con la recomendación literal:** `OperationProposal` **no** contiene `policyHash`/`policyVersion` (`core/src/types/index.ts`, interfaz con 8 campos). En la vía de agentes la evaluación y el registro (`base.ts:63-69`) ocurren en la misma llamada con la política vigente, por lo que no hay ventana de obsolescencia dentro de ella; el hash se guarda en el `AuditRecord`. En misiones locales se compara `guardPolicyHash` entre ESCALATE y aprobación (`sqlite.ts`, `decideDispatchedMission`), pero la aprobación local no se liga a un hash de los parámetros.
**Corrección (P2):** añadir `policyHash` opcional a la propuesta y rechazar si difiere de la vigente; ligar las aprobaciones locales al hash de la entrada. Cambios aditivos.

### C-5 — Sensibilidad definida por quien llama · RESUELTO (salvedad menor)

**Qué dijo NEXUS:** si el llamante controla «sensitive», es un agujero; pide clasificación del lado del servidor y enumeración inmutable.

**Estado actual:** no existe ninguna bandera «sensitive» en la propuesta (`OperationProposal` sin ese campo) ni los endpoints HTTP aceptan `operationType` para evaluación (sólo como filtro de consulta, `routes/cerberus.ts:38`). La sensibilidad deriva de constantes del servidor: `tool.effect` del registro (`requiresHumanApproval`, `SENSITIVE_EFFECTS`, `core/src/cerberus/tools.ts`) y, en el motor heredado, de listas fijas (`SENSITIVE_APPROVAL`, `UNAUTHORIZED_TOOL`, `REGISTERED_OPERATIONS` en `guard.ts`). `allowedParams` rechaza cualquier argumento extra (`cerberus-gate.ts:183`; prueba `cerberus-gate.test.ts:59`); herramientas desconocidas se deniegan (`:46`); operaciones internas con claves de efecto oculto se deniegan (R-016, `bypass.test.ts:32`). El tipo de operación lo fija el código del agente en el servidor, y un tipo no registrado cae en R-008 (DENY).
**Salvedad:** la detección de efectos ocultos es una **lista negra por nombre** de clave (`HIDDEN_EFFECT_KEYS`); la defensa efectiva es la lista blanca de herramientas y tipos registrados. Si el término «campos sensibles» incluye datos personales en logs, no hay clasificador de datos (hay redacción puntual, hash del nombre de secreto en auditoría y minimización en LLM): fuera del alcance probado.
**Corrección (P3):** prueba que invierta a lista blanca por tipo de operación interna.

### C-6 — Puente NEAR, reconciliación y «pending on-chain» · RESUELTO (intenciones) · PARCIAL (agentes)

**Qué dijo NEXUS:** el audit-hash en NEAR depende de contrato desplegado y de reintentos/reconciliación; pide cola de reconciliación y estado «pending on-chain».

**Estado actual (cumple la recomendación en la vía de intenciones):** estados persistidos `SIGNING → BROADCAST_PENDING → BROADCASTED → CONFIRMED | FAILED | RECONCILIATION_REQUIRED` (`near/submission.ts`, `near-intents.ts`); preflight de sólo lectura (red, contrato desplegado, propietario, llave, saldo, duplicado, `ALREADY_RECORDED`); firma persistida **antes** de difundir (`near_submissions`, `audit_id` y `tx_hash` únicos); reintentos con bytes idénticos y sin refirmar; caducidad de firma → `RECONCILIATION_REQUIRED`; `reconcile` decide con el estado del contrato; `recoverAll` al arrancar y cada 60 s (`server.ts:94-97`). El contrato es idempotente: mismo contenido devuelve el registro, contenido distinto aborta (`lib.rs:46,72`; pruebas `:138,143`). Pruebas: `near/submission.test.ts` (359 líneas, **RPC y firmante simulados**), `near-intents.test.ts`, `contract-conformance.test.ts`, pruebas de contrato en sandbox. Evidencia real: **una** transacción documentada (C-9).

**Brechas:** (1) `recoverAll` sólo se programa con la firma habilitada (`server.ts:94`): con el valor por defecto (apagada) una intención en vuelo no se refresca sola aunque la consulta sea de lectura; (2) la serialización `exclusive` es por proceso; (3) en la vía heredada `proposeOperation` espera `near.storeAuditHash` sin captura (`base.ts:72`): en modo real un fallo de red se propaga y se pierde la publicación del evento (lectura; en simulación por defecto no ocurre), y el `AuditRecord` heredado sólo tiene `nearTxHash: null`, sin estado explícito «pending on-chain» (el estado existe en la intención y en `mission_evidence.near_state`).
**Corrección (P2):** `refresh` de sólo lectura con firma apagada; capturar el fallo del puente en la vía heredada y registrar `NEAR_PENDING`.

### C-7 — Catálogo estable de deny-reasons · VIGENTE (parcialmente mitigado)

**Qué dijo NEXUS:** `DenyReason` no está enumerado; UI/indexadores no distinguen clases; piden enum estable + códigos.

**Estado actual:** el tipo `DenyReason` de la spec **no existe en el código** (búsqueda en `packages/**/*.ts(x)`: 0 resultados). Hay dos vocabularios: `GateCode`, unión TypeScript cerrada de 21 códigos (`cerberus-gate.ts:17-21`), persistida en `cerberus_decisions.code`/`reason` y servida a ADMIN en `GET /api/v1/cerberus/gate/decisions` (`routes/cerberus.ts:142`); y, en el motor heredado, `ruleMatched` (R-xxx) con texto libre en español. No hay catálogo documentado ni prueba que fije el conjunto de códigos (añadir o renombrar uno no rompe nada). Los textos `reason` incluyen valores dinámicos (agente, límites, gasto del día, p. ej. `daily budget … (spent N)`). Los errores HTTP mezclan códigos propios y del gate (`routes/cerberus.ts:86`). No verifiqué qué roles distintos de ADMIN alcanzan los endpoints de decisiones.
**Riesgo real:** medio para el indexador/UI; bajo para seguridad si el acceso es sólo ADMIN.
**Corrección (P1, aditiva):** exportar `GATE_CODES` (código, descripción, clase, HTTP) y un tipo `DenyReason` que cubra también los R-xxx; prueba que fije el conjunto; `docs/cerberus-deny-codes.md`; respuestas a no administradores sólo con `code` y mensaje genérico.

### C-8 — Eventos de gobernanza NEP-297 · PARCIAL (locales) · VIGENTE (on-chain)

**Qué dijo NEXUS:** cambios de política, rotación de agentes y pausa no emiten eventos; el indexador ve gastos pero no gobernanza; piden eventos NEP-297.

**Locales (existen, en la cadena de auditoría SQLite):** pausa/reanudación global = `EMERGENCY_STOP`/`EMERGENCY_CLEAR` (`cerberus-gate.ts:79`); `CERBERUS_APPROVAL` (`:125`); `CERBERUS_RECIPIENT_ADDED/REMOVED` (`:90,94`); decisiones `CERBERUS_GATE` (`:238`); `VAULT_SECRET_*` y `VAULT_KEY_ROTATED`; `CHRONOS_TASK_PAUSED/RESUMED/CANCELLED`; `NEAR_SIGNED/BROADCAST/CONFIRMED`. Brechas: la revocación por parada registra **un** evento de parada, no uno por aprobación revocada (`:73-80`); **cambio de política:** `updatePolicy` no tiene llamadores y no emite evento, y no se registra «política activa = hash X» al arrancar; **rotación de agentes:** no existe la función.
**On-chain: VIGENTE.** El contrato sólo escribe un registro y un log de texto libre `HADES_AUDIT {id} {hash} {height}` (`lib.rs:89`), que no sigue NEP-297 (`EVENT_JSON:{…}`); la búsqueda de `NEP-297`/`EVENT_JSON` en `packages`, `scripts` y `docs` no encuentra nada. Ningún evento de gobernanza se emitió on-chain.
**Restricción:** emitir NEP-297 exige modificar y redesplegar el contrato; requiere tu autorización.
**Corrección:** (1) sin tocar el contrato: `POLICY_ACTIVE` al arrancar y un evento por aprobación revocada; documentar la distinción local/on-chain; (2) con autorización: anclar la cabeza de la cadena (C-3); (3) contrato v0.5 con evento NEP-297 en `store_audit_hash` (y eventos de gobernanza), con pruebas en sandbox, tras el hackathon o sólo en testnet con aprobación expresa.

### C-9 — Realidad on-chain · PARCIAL (documentada) · NO VERIFICABLE hoy

**Qué dijo NEXUS:** el on-chain era un hash-log de 184 líneas, «0 txs reales»; no prometan garantía de cadena en un deploy de papel.

**Estado actual:** la premisa ya no es cierta para el repo, pero **la afirmación sigue necesitando demostración vigente**. Existe contrato desplegado (`audit.hades-omega.testnet`, 225 líneas con pruebas, `packages/contracts/src/lib.rs`), una transacción real `BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3` (commit `d0c02d6`) y evidencia (`docs/evidencia-hades-attest-0001.md`, `docs/evidence-hades-attest-0001.json`, informe `ea04e04`). El verificador `scripts/verify-attestation-onchain.cjs` es de sólo lectura y tiene 18 comprobaciones (estado FINAL sin fallos, una sola acción `store_audit_hash` con 0 depósito, argumentos exactos, llave FunctionCall restringida, `get_count`, `get_audit_entry`, propietario, SHA-256 del WASM descargado de la cadena, despliegue atómico, allowance). El `.json` guardado es del 2026-11-02T23:32:51Z (`allPassed: true`).

**Verificación actual (ejecutada, 2026-11-05T20:56Z):** el script terminó con código 2 y `"error": "RPC tx: HTTP 408"`, **0 comprobaciones ejecutadas** (coincide con los fallos de conexión de sesiones previas). Hoy sólo hay evidencia documentada, no una reverificación.

**Desfases de documentación:** `docs/04-near-integration.md:26` aún dice «PLANIFICADA — 0 txs reales» (contradice la evidencia); `docs/JUDGES.md:14-23,61` invita a verificar y espera que «pase cada comprobación», lo cual depende de que el RPC responda. La garantía real es acotada: una atestación única de un hash, no «auditoría inmutable» ni «política en cadena» (C-1, C-3, C-8).
**Corrección (P0):** reintentos y lista `NEAR_RPC_URLS` en el script; distinguir «sin veredicto» de «falló una comprobación»; reverificar cuando el RPC responda y versionar el resultado con fecha; actualizar `docs/04-near-integration.md`; en JUDGES, indicar fecha de la última verificación y la alternativa manual en el explorador.

## 3. Respuesta a las siete recomendaciones de NEXUS

| # | Recomendación | Estado |
|---|---|---|
| 1 | Hard gate en operaciones críticas; `policy_hash` en la propuesta | Gate: **sí** para efectos externos. `policy_hash` en propuesta: **no** (sí en aprobaciones y registro de auditoría) |
| 2 | Orden determinista + property-tests | Orden por prioridad: **sí**. Desempate explícito y property-tests: **no** |
| 3 | Audit-chain verificable (prev-hash/Merkle) | prev-hash: **sí**. Comando independiente, ancla y cabeza: **no** |
| 4 | Eventos de gobernanza | Locales: **sí** (con huecos). NEP-297: **no** |
| 5 | Cola de reconciliación NEAR | **Sí** en intenciones (estados, recuperación, reconcile); brechas menores en la vía heredada |
| 6 | Clasificación sensitive server-side | **Sí** (registro y listas del servidor; sin bandera del llamante) |
| 7 | Enum estable de DenyReason | **No** (existe `GateCode`, sin catálogo ni prueba de estabilidad) |

## 4. Capacidades demostradas vs pendientes

| Capacidad | Demostrada con | Pendiente |
|---|---|---|
| Gate de efectos externos, grants de un solo uso, parada | Pruebas con SQLite real; puente falla cerrado sin grant | Fail-closed ante excepción; prueba de arquitectura; parada en arranque |
| Aprobación ligada a parámetros y política | Pruebas + 1 tx real documentada | `policyHash` en propuesta; hash en aprobaciones locales |
| Cadena de auditoría | Experimento T1; `AUDIT_CHAIN_VERIFY` | Truncamiento, hash nulo final, ancla, verificador independiente |
| Reconciliación NEAR | Pruebas con RPC simulado y contrato en sandbox | Más de una tx real; refresco con firma apagada |
| Eventos de gobernanza locales | Auditoría de parada, aprobaciones, Vault, CHRONOS | Política activa; revocaciones individuales |
| Eventos NEP-297 | — | No existe (requiere contrato nuevo) |
| Verificación pública | Script y evidencia del 2026-11-02 | Reverificación actual (hoy HTTP 408); documentos desactualizados |

## 5. Diferencias entre especificaciones antiguas y código actual

| Documento | Afirmación antigua | Realidad |
|---|---|---|
| `docs/04-near-integration.md:26` | 0 txs reales | Contrato desplegado y 1 tx real documentada |
| `docs/04-near-integration.md:243` | Reintentar 3 veces y marcar `NEAR_PENDING` | Estados `BROADCAST_PENDING`/`RECONCILIATION_REQUIRED` con firma persistida y recuperación periódica |
| `docs/03-cerberus-spec.md:68,309` | Excepción → `DENY GUARD_INTERNAL_ERROR` | `evaluate` no captura excepciones |
| `docs/03-cerberus-spec.md:37` | Tipo `DenyReason` | No existe |
| `docs/03-cerberus-spec.md:149` | AUDIT «inmutable» | `CerberusAUDIT` en memoria; cadena SQLite detectable, no inviolable |
| `docs/03-cerberus-spec.md:188` | Registro en NEAR por criterios | Sólo flujo manual aprobado; en agentes, PERMIT de 3 tipos críticos |
| `docs/09-cerberus-gate.md` | «No signer or broadcaster exists»; el planificador no pasa por el gate | **Desactualizado**: existen firmante y difusión (apagados por defecto) y el LLM usa el gate |
| `docs/matriz-trazabilidad-cierre.md` | Rutas alternativas de la parada no cubiertas | Atendido para lanzamientos y aprobaciones (`9a0fbc0`); quedan arranque y motor heredado |

## 6. Prioridades y plan sin regresiones

**P0:** C-9 (reverificar, reintentos/RPC alternativos, actualizar `04` y JUDGES) · C-3 (endurecer verificación, ancla, verificador independiente, retirar «inmutable»).
**P1:** C-7 (catálogo + prueba de conjunto) · C-1 (excepción → DENY, prueba de arquitectura, parada en arranque) · C-8 (evento `POLICY_ACTIVE`, documentar local vs on-chain).
**P2:** C-2 (orden total + property-tests) · C-4 (`policyHash` en propuesta) · C-6 (vía heredada, refresco con firma apagada).
**P3:** C-5 (lista blanca por tipo).
**Requieren tu autorización expresa:** contrato con NEP-297, anclaje on-chain de la cabeza de la cadena, habilitar firma, cualquier transacción.

Plan por bloques (todos aditivos; pruebas rojas primero; tras cada bloque `npx turbo run test type-check lint build --force --concurrency=1` y `npm run test:e2e`; línea base: 414 aprobadas, 3 omitidas, Playwright 22/2; firma NEAR apagada por defecto en todos):
- **A (C-9):** script del verificador + documentación de jueces y `04`.
- **B (C-3):** `verifyAuditIntegrity` endurecido, tabla de ancla (migración nueva), `verify-audit-chain.cjs`, transacción inmediata.
- **C (C-7):** `GATE_CODES`/`DenyReason`, prueba de conjunto, documento, respuestas seguras.
- **D (C-1):** `try/catch` en `evaluate`, prueba de arquitectura, parada en arranque.
- **E (C-2, C-4, C-5, C-6, C-8 local):** orden total y `fast-check` (verificar licencia y versión antes de añadir), `policyHash` en propuesta, `POLICY_ACTIVE`, eventos por revocación, captura de fallo en la vía heredada.
- **F (opcional, con autorización):** anclaje y diseño del contrato v0.5 con NEP-297 en sandbox.

Antes de cada bloque, reutilizar lo existente: `verifyAuditIntegrity`, `AUDIT_CHAIN_VERIFY`, el verificador on-chain, `near_security` y `GateCode`; no duplicar. No se copia código externo; `fast-check` y cualquier otra dependencia requieren revisión de licencia y seguridad.


## 8. Estado tras las correcciones locales (fase de cierre)

Alcance: sólo cambios locales y verificables. **No** se tocaron contratos, despliegues, claves reales, firma ni transmisión de transacciones NEAR (firma desactivada por defecto). Las pruebas con dobles (RPC simulado) **no** se presentan como evidencia on-chain.

| ID | Estado inicial | Estado actual | Qué cambió | Evidencia (pruebas) |
|---|---|---|---|---|
| C-9 | PARCIAL / NO VERIFICABLE | **MEJORADO** (verificador robusto; la verificación real depende de que haya RPC disponible → veredicto INCONCLUSIVE si no) | Cliente RPC con reintentos y RPC alternos; veredictos PASS/FAIL/INCONCLUSIVE; `docs/04-near-integration.md` y `docs/JUDGES.md` actualizados | `verifier-rpc.test.ts` (7) |
| C-3 | PARCIAL | **RESUELTO (local)** | Detección de truncamiento, hash nulo, cabeza y ancla local (`audit_anchor`); verificador independiente de sólo lectura `scripts/verify-audit-chain.cjs` con `--expect-head/--expect-count`. Límite: un atacante con control total del archivo puede reescribir también el ancla interna; sólo un ancla **externa** lo detecta | `audit-chain-hardening.test.ts` (10) |
| C-1 | PARCIAL | **RESUELTO (local)** | `CerberusGUARD.evaluate` y `CerberusGate.authorize` nunca lanzan: ante error → DENY `GUARD_INTERNAL_ERROR`/`GATE_INTERNAL_ERROR`, auditado y sin detalle interno; la recuperación al arranque no reanuda operaciones APPROVED mientras la parada de emergencia está activa (`APPROVED_RESUME_SKIPPED:EMERGENCY_STOP`) | `fail-secure.test.ts`, `cerberus-failsecure.test.ts` |
| C-7 | VIGENTE | **RESUELTO** | Catálogo único y estable `decision-codes.ts` (34 códigos), `GUARDDecision.reasonCode`, `GET /api/v1/cerberus/gate/codes` (cualquier rol autenticado), mensajes HTTP genéricos; prueba anti-deriva sobre los literales del gate. Ver `docs/cerberus-deny-codes.md` | `cerberus-codes.test.ts`, `cerberus-failsecure.test.ts` |
| C-2 | PARCIAL | **RESUELTO** | Orden total: prioridad, luego DENY > ESCALATE > PERMIT, luego id; prueba de propiedades con PRNG propio | `fail-secure.test.ts` |
| C-4 | RESUELTO / PARCIAL | **RESUELTO** en la vía de agentes | `OperationProposal.policyHash` fijado por el agente; propuesta con política obsoleta → DENY `GUARD_POLICY_STALE`. **Limitación:** las aprobaciones de misiones locales siguen sin ligarse a un hash de entrada (no se implementó; queda como mejora) | `fail-secure.test.ts`, `near-failure.test.ts` |
| C-5 | RESUELTO | **RESUELTO** | Prueba de regresión: la sensibilidad no la decide quien llama | `fail-secure.test.ts` |
| C-6 | RESUELTO / PARCIAL | **RESUELTO** | Un fallo del puente en la vía de agentes ya no pierde la decisión: queda `nearPending` (código fijo, sin detalle). La recuperación NEAR corre siempre y es de sólo lectura si existe cualquier bloqueo de firma | `near-failure.test.ts`, `submission.test.ts` (C-6) |
| C-8 | PARCIAL / VIGENTE | **PARCIAL** | Eventos locales: `POLICY_ACTIVE` (una vez por cambio de hash de política/herramientas) y `CERBERUS_APPROVAL_REVOKED` por cada aprobación revocada. **Los eventos NEP-297 on-chain siguen sin existir** (requiere cambio de contrato: bloque F, no autorizado) | `cerberus-failsecure.test.ts` |

**Limitaciones restantes:** (1) C-8 on-chain y cualquier cambio de contrato (bloque F); (2) ancla externa de la cadena de auditoría (hoy sólo se puede fijar `--expect-head` fuera de banda); (3) vinculación de aprobaciones de misiones locales a un hash de entrada; (4) la verificación on-chain de la tx de referencia requiere un RPC accesible en el momento de ejecutar el verificador.
