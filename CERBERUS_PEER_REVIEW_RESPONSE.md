# Respuesta a la revisiÃ³n externa de CERBERUS (NEXUS / HiveBid / AEGIS)

Fecha: 2026-11-05. Rama `codex/hades-omega-finalizacion`, HEAD `98b9ee1`. Documento revisado: `docs/CERBERUS_PEER_REVIEW.es.md` (copiado desde `Downloads`, sin cambios). AuditorÃ­a **solo de lectura**: no se modificÃ³ cÃ³digo, contratos, configuraciÃ³n, credenciales ni transacciones; los Ãºnicos archivos nuevos son este informe y la copia del documento original.

## 0. CÃ³mo leer este informe

- La revisiÃ³n de NEXUS se escribiÃ³ contra especificaciones antiguas (`D:/Temp/hades-omega/docs/*`, copias en `docs/03â€¦09`), donde la integraciÃ³n NEAR figuraba como Â«PLANIFICADA â€” 0 txs realesÂ» (`docs/04-near-integration.md:26`). AquÃ­ se contrasta con el **cÃ³digo actual**.
- Una conclusiÃ³n marcada Â«(lectura)Â» viene de leer el cÃ³digo, no de ejecutarlo. Las pruebas con RPC o contrato simulados **no** cuentan como evidencia on-chain.
- Ejecutado en esta auditorÃ­a: (a) experimento sobre una base SQLite temporal con el compilado actual para la cadena de auditorÃ­a; (b) una ejecuciÃ³n del verificador on-chain de solo lectura.
- Nota de mÃ©todo: una versiÃ³n previa de este informe se hizo sin el documento y asumiÃ³ algunos temas por tu descripciÃ³n. Esta versiÃ³n los reemplaza; las diferencias relevantes son C-1 (se refiere a la ruta del pago y a guardar la decisiÃ³n en la llamada), C-4 (`policy_hash` dentro de la propuesta), C-5 (sensibilidad controlada por quien llama) y C-9 (promesa de garantÃ­a on-chain).

## 1. Resumen

> **ActualizaciÃ³n:** la tabla siguiente es el diagnÃ³stico inicial (antes de corregir). El estado vigente tras las correcciones locales estÃ¡ en la **secciÃ³n 8**.

| ID | Hallazgo de NEXUS | Estado real | Severidad residual | Prioridad hackathon |
|---|---|---|---|---|
| C-1 | Fail-secure solo declarado; falta hard gate y decisiÃ³n en la llamada | **PARCIAL** | Media | P1 |
| C-2 | Orden/prioridad de reglas y property-tests | **PARCIAL** | Baja-Media | P2 |
| C-3 | Cadena de auditorÃ­a verificable (prev-hash, comando verify) | **PARCIAL** | Media-Alta | **P0** |
| C-4 | `policy_hash` obsoleto entre propuesta y ejecuciÃ³n | **RESUELTO** en la vÃ­a de aprobaciones; **PARCIAL** en la propuesta | Baja | P2 |
| C-5 | Sensibilidad definida por quien llama | **RESUELTO** (salvedad menor) | Baja | P3 |
| C-6 | Confianza del puente NEAR; reconciliaciÃ³n y Â«pending on-chainÂ» | **RESUELTO** en intenciones; **PARCIAL** en la vÃ­a de agentes heredada | Baja-Media | P2 |
| C-7 | CatÃ¡logo estable de deny-reasons | **VIGENTE** (parcialmente mitigado) | Media | P1 |
| C-8 | Eventos de gobernanza NEP-297 | **PARCIAL** (locales) / **VIGENTE** (on-chain) | Media | P1 (documentar) |
| C-9 | No prometer garantÃ­a on-chain con un deploy de papel | **PARCIAL**: ya hay deploy y una tx real documentados; **NO VERIFICABLE hoy**; documento 04 desactualizado | Media | **P0** |

## 2. AnÃ¡lisis por hallazgo

### C-1 â€” Fail-secure declarado vs hard gate Â· PARCIAL

**QuÃ© dijo NEXUS:** CERBERUS no estÃ¡ en el camino de la llamada; la decisiÃ³n no se compromete en la llamada NEAR; cualquier agente podrÃ­a evadirlo. Pide hard gate en operaciones crÃ­ticas y guardar la decisiÃ³n en la transacciÃ³n/log.

**Estado actual:**
- **Hard gate para efectos externos: sÃ­, estructural.** `CerberusGate.authorize/consumeGrant` (`packages/api/src/cerberus-gate.ts:129,138`). El puente NEAR en modo real **falla cerrado** sin gate o sin grant vÃ¡lido para exactamente los mismos parÃ¡metros, y el gate no puede sustituirse (`packages/core/src/near-bridge/index.ts:24-26,51-52`; `core/src/cerberus/bypass.test.ts:101-130`). CHRONOS autoriza cada ejecuciÃ³n (`chronos/chronos.ts:209`); el LLM pasa por `llm-governor.ts:142-144`; la parada se revalida en `consumeGrant`. Pruebas: `cerberus-gate.test.ts:195-274`; parada en lanzamientos y aprobaciones: `emergency-stop-guard.test.ts` (commit `9a0fbc0`).
- **La decisiÃ³n viaja en la llamada NEAR:** `storeAuditHash` envÃ­a `decision`, `contentHash` (hash del registro de auditorÃ­a, que incluye `policyHash`, `ruleMatched` y razÃ³n), `operationType` y `agentName` (`core/src/agents/base.ts:62-82`; argumentos validados en `tools.ts` `near.audit_hash_submit`). La decisiÃ³n queda comprometida on-chain como atestaciÃ³n **posterior**; el contrato **no** valida polÃ­tica (es un registro, `lib.rs:46-90`). No existe ruta de pago que dependa del contrato: `payment.execute` estÃ¡ registrado sin ejecutor.
- **Fail-closed ante error interno: no cumplido.** La especificaciÃ³n declara `DENY GUARD_INTERNAL_ERROR` ante excepciÃ³n o timeout (`docs/03-cerberus-spec.md:68,309`); `CerberusGUARD.evaluate` (`core/src/cerberus/guard.ts`) no tiene `try/catch` (0 coincidencias de `try`/`GUARD_INTERNAL_ERROR`). Una excepciÃ³n se propaga al agente.

**VÃ­as sin `CerberusGate` (lectura):**
1. **Agentes heredados:** `proposeOperation` devuelve la decisiÃ³n y el agente actÃºa por convenciÃ³n; sÃ³lo el efecto NEAR estÃ¡ protegido por el puente. Hoy los agentes sÃ³lo hacen operaciones internas sin efecto externo.
2. **Misiones locales** usan `policyGuard.evaluate` (operaciÃ³n `CRYPTO_HASH`, efecto local) sin grant (`sqlite.ts:601,642`).
3. **Parada:** la aplica el nuevo hook HTTP y el gate, pero la reconciliaciÃ³n de arranque (`reconcileOnStartup`, `sqlite.ts:446`) reanuda operaciones `APPROVED` sin consultar `gate.isStopped()` (lectura; efecto local).
4. `docs/09-cerberus-gate.md` admite: un ejecutor nuevo que no llame a `authorize`/`consumeGrant` no estÃ¡ protegido.

**Pruebas faltantes:** excepciÃ³n en `evaluate` â†’ DENY; prueba de arquitectura que falle si aparece cÃ³digo con efecto externo fuera de rutas con gate; arranque con parada activa.
**Riesgo real:** bajo hoy (efectos externos con gate; firma apagada por defecto). El riesgo es de regresiÃ³n y de la brecha de la excepciÃ³n no capturada.
**CorrecciÃ³n:** `try/catch` â†’ `DENY GUARD_INTERNAL_ERROR` con auditorÃ­a; prueba de arquitectura; `isStopped()` en el arranque. Aclarar en documentaciÃ³n que el contrato es un registro y no impone polÃ­tica.

### C-2 â€” Orden y prioridades Â· PARCIAL

**QuÃ© dijo NEXUS:** la spec no define orden ni desempate; pide prioridad explÃ­cita, orden determinista y property-tests Â«mismo input â†’ mismo veredictoÂ».

**Estado actual:** la limitaciÃ³n descrita en la spec ya no aplica al cÃ³digo: cada regla tiene `priority` (`core/src/cerberus/policy.ts`), `evaluate` filtra las activas, ordena por prioridad descendente y devuelve la primera coincidente; sin coincidencia, `DENY` (R-008, prioridad 1) (`guard.ts`, `evaluate`). No depende del orden de diccionarios. Pruebas de ejemplo: determinismo (`guard.test.ts:147`), sin elusiÃ³n por cambio de agente (`:121`), matriz de permisos en el hash (`:154`), `bypass.test.ts`. Las reglas no son editables en vivo: `updatePolicy` (`guard.ts:167`) sÃ³lo cambia lista de proveedores y presupuestos y no tiene llamadores en producciÃ³n.

**Huecos:**
- **Desempates implÃ­citos:** empates de prioridad se resuelven por el orden estable del arreglo (hay empates reales, p. ej. R-003/R-013 = 80, R-012/R-014 = 190; hoy inocuos por tipos de operaciÃ³n distintos). No hay regla Â«DENY gana al empatarÂ» ni validaciÃ³n de unicidad.
- **No hay property-tests** (bÃºsqueda de `fast-check`/`property` en las pruebas de core: 0 resultados); sÃ³lo pruebas de ejemplo.
- No hay prueba de reglas contradictorias.

**Riesgo real:** bajo con la polÃ­tica fija; sube si se permite editar reglas.
**CorrecciÃ³n:** orden total (prioridad â†“, DENY > ESCALATE > PERMIT, id) con validaciÃ³n al construir; aÃ±adir `fast-check` (revisar licencia MIT y fijar versiÃ³n) con propiedades de determinismo, de monotonÃ­a de DENY y de Â«clave de permutaciÃ³n de reglas no altera el veredictoÂ».

### C-3 â€” Cadena de auditorÃ­a verificable Â· PARCIAL

**QuÃ© dijo NEXUS:** falta prev-hash/Merkle y un comando verify independiente.

**Estado actual (la limitaciÃ³n descrita ya no aplica en lo bÃ¡sico):** `recordAuditEvent` encadena SHA-256 sobre `prev_hash|id|actor|mission|action|result|correlation|timestamp` (`sqlite.ts:223`); `verifyAuditIntegrity` recalcula la cadena (`sqlite.ts:243`); existe el trabajo de CHRONOS `AUDIT_CHAIN_VERIFY`; el gate audita cada decisiÃ³n, aprobaciÃ³n y parada. Prueba: `cerberus-gate.test.ts:266`. Evidencia documentada: 13 eventos sin ruptura.

**Experimento ejecutado** (SQLite temporal, compilado actual, 4 eventos):

| Prueba | Resultado |
|---|---|
| Base | `verified: true` |
| T1: alterar evento intermedio y poner `hash = NULL` | **Detectado** (el `prev_hash` del siguiente no coincide) |
| T2: borrar el Ãºltimo evento | **`verified: true`, `totalEvents: 3`** â€” el truncamiento de cola no se detecta |

**Debilidades:** (1) truncamiento de cola indetectable (T2 ejecutado); (2) un evento con `hash` nulo se omite como Â«pre-migraciÃ³nÂ» (`sqlite.ts:248-251`): si es el Ãºltimo, alterarlo pasa la verificaciÃ³n (lectura); (3) sin clave (HMAC) quien escriba en la base puede recalcular una cadena vÃ¡lida; (4) lectura-luego-inserciÃ³n no atÃ³mica entre procesos (lectura); (5) **no hay comando de verificaciÃ³n independiente**: el verificador existente sÃ³lo comprueba NEAR; (6) la cadena sÃ³lo estÃ¡ anclada on-chain si se sube su cabeza, y hoy no se hace; (7) `CerberusAUDIT` de core es en memoria y reemplazable (`setNearTx`), a pesar de que la spec lo llama Â«inmutableÂ» (`docs/03-cerberus-spec.md:149`).

**Riesgo real:** quien tenga acceso a la base puede ocultar actividad reciente. Para jueces, no afirmar Â«inmutableÂ» sin matices.
**CorrecciÃ³n (P0):** endurecer `verifyAuditIntegrity` (hash nulo posterior al primero con hash; devolver `headHash`/`totalEvents`), ancla local de la cabeza, `scripts/verify-audit-chain.cjs` de sÃ³lo lectura que pueda ejecutar un tercero, `recordAuditEvent` en transacciÃ³n inmediata. Opcional y con autorizaciÃ³n: anclar `headHash` con el contrato ya desplegado (`store_audit_hash`, requiere habilitar firma y aprobaciÃ³n humana) â€” equivalente funcional a la raÃ­z Merkle por lote que propone NEXUS, sin tocar el contrato.

### C-4 â€” `policy_hash` obsoleto entre propuesta y ejecuciÃ³n Â· RESUELTO (aprobaciones) Â· PARCIAL (propuesta)

**QuÃ© dijo NEXUS:** fijar `policy_hash`/`policy_version` en `OperationProposal` y verificar coincidencia antes de PERMIT.

**Estado actual (demostrado con pruebas):** las aprobaciones del gate guardan `params_hash = SHA-256(canonicalJson({tool, agent, params}))` y `policy_hash = SHA-256(hash de polÃ­tica | hash del registro de herramientas)` (`cerberus-gate.ts:65,155,210-215`); `decide` y el uso rechazan `POLICY_CHANGED` (`:123,225`), `PARAMS_ALTERED`, `APPROVAL_EXPIRED` y `APPROVAL_REUSED`; el consumo es atÃ³mico y la vigencia mÃ¡xima 15 min. El hash del registro de herramientas cambia si cambia cualquier lÃ­mite o permiso. Las intenciones NEAR guardan `policyHash` y lo comparan al aprobar (`near-intents.ts:76,84`). Pruebas: `cerberus-gate.test.ts:91,99,112,120,131,142,181`; `near-intents.test.ts:23,37,49`. En la transacciÃ³n real documentada se consumiÃ³ una aprobaciÃ³n de un solo uso ligada a un hash.

**Diferencia con la recomendaciÃ³n literal:** `OperationProposal` **no** contiene `policyHash`/`policyVersion` (`core/src/types/index.ts`, interfaz con 8 campos). En la vÃ­a de agentes la evaluaciÃ³n y el registro (`base.ts:63-69`) ocurren en la misma llamada con la polÃ­tica vigente, por lo que no hay ventana de obsolescencia dentro de ella; el hash se guarda en el `AuditRecord`. En misiones locales se compara `guardPolicyHash` entre ESCALATE y aprobaciÃ³n (`sqlite.ts`, `decideDispatchedMission`), pero la aprobaciÃ³n local no se liga a un hash de los parÃ¡metros.
**CorrecciÃ³n (P2):** aÃ±adir `policyHash` opcional a la propuesta y rechazar si difiere de la vigente; ligar las aprobaciones locales al hash de la entrada. Cambios aditivos.

### C-5 â€” Sensibilidad definida por quien llama Â· RESUELTO (salvedad menor)

**QuÃ© dijo NEXUS:** si el llamante controla Â«sensitiveÂ», es un agujero; pide clasificaciÃ³n del lado del servidor y enumeraciÃ³n inmutable.

**Estado actual:** no existe ninguna bandera Â«sensitiveÂ» en la propuesta (`OperationProposal` sin ese campo) ni los endpoints HTTP aceptan `operationType` para evaluaciÃ³n (sÃ³lo como filtro de consulta, `routes/cerberus.ts:38`). La sensibilidad deriva de constantes del servidor: `tool.effect` del registro (`requiresHumanApproval`, `SENSITIVE_EFFECTS`, `core/src/cerberus/tools.ts`) y, en el motor heredado, de listas fijas (`SENSITIVE_APPROVAL`, `UNAUTHORIZED_TOOL`, `REGISTERED_OPERATIONS` en `guard.ts`). `allowedParams` rechaza cualquier argumento extra (`cerberus-gate.ts:183`; prueba `cerberus-gate.test.ts:59`); herramientas desconocidas se deniegan (`:46`); operaciones internas con claves de efecto oculto se deniegan (R-016, `bypass.test.ts:32`). El tipo de operaciÃ³n lo fija el cÃ³digo del agente en el servidor, y un tipo no registrado cae en R-008 (DENY).
**Salvedad:** la detecciÃ³n de efectos ocultos es una **lista negra por nombre** de clave (`HIDDEN_EFFECT_KEYS`); la defensa efectiva es la lista blanca de herramientas y tipos registrados. Si el tÃ©rmino Â«campos sensiblesÂ» incluye datos personales en logs, no hay clasificador de datos (hay redacciÃ³n puntual, hash del nombre de secreto en auditorÃ­a y minimizaciÃ³n en LLM): fuera del alcance probado.
**CorrecciÃ³n (P3):** prueba que invierta a lista blanca por tipo de operaciÃ³n interna.

### C-6 â€” Puente NEAR, reconciliaciÃ³n y Â«pending on-chainÂ» Â· RESUELTO (intenciones) Â· PARCIAL (agentes)

**QuÃ© dijo NEXUS:** el audit-hash en NEAR depende de contrato desplegado y de reintentos/reconciliaciÃ³n; pide cola de reconciliaciÃ³n y estado Â«pending on-chainÂ».

**Estado actual (cumple la recomendaciÃ³n en la vÃ­a de intenciones):** estados persistidos `SIGNING â†’ BROADCAST_PENDING â†’ BROADCASTED â†’ CONFIRMED | FAILED | RECONCILIATION_REQUIRED` (`near/submission.ts`, `near-intents.ts`); preflight de sÃ³lo lectura (red, contrato desplegado, propietario, llave, saldo, duplicado, `ALREADY_RECORDED`); firma persistida **antes** de difundir (`near_submissions`, `audit_id` y `tx_hash` Ãºnicos); reintentos con bytes idÃ©nticos y sin refirmar; caducidad de firma â†’ `RECONCILIATION_REQUIRED`; `reconcile` decide con el estado del contrato; `recoverAll` al arrancar y cada 60 s (`server.ts:94-97`). El contrato es idempotente: mismo contenido devuelve el registro, contenido distinto aborta (`lib.rs:46,72`; pruebas `:138,143`). Pruebas: `near/submission.test.ts` (359 lÃ­neas, **RPC y firmante simulados**), `near-intents.test.ts`, `contract-conformance.test.ts`, pruebas de contrato en sandbox. Evidencia real: **una** transacciÃ³n documentada (C-9).

**Brechas:** (1) `recoverAll` sÃ³lo se programa con la firma habilitada (`server.ts:94`): con el valor por defecto (apagada) una intenciÃ³n en vuelo no se refresca sola aunque la consulta sea de lectura; (2) la serializaciÃ³n `exclusive` es por proceso; (3) en la vÃ­a heredada `proposeOperation` espera `near.storeAuditHash` sin captura (`base.ts:72`): en modo real un fallo de red se propaga y se pierde la publicaciÃ³n del evento (lectura; en simulaciÃ³n por defecto no ocurre), y el `AuditRecord` heredado sÃ³lo tiene `nearTxHash: null`, sin estado explÃ­cito Â«pending on-chainÂ» (el estado existe en la intenciÃ³n y en `mission_evidence.near_state`).
**CorrecciÃ³n (P2):** `refresh` de sÃ³lo lectura con firma apagada; capturar el fallo del puente en la vÃ­a heredada y registrar `NEAR_PENDING`.

### C-7 â€” CatÃ¡logo estable de deny-reasons Â· VIGENTE (parcialmente mitigado)

**QuÃ© dijo NEXUS:** `DenyReason` no estÃ¡ enumerado; UI/indexadores no distinguen clases; piden enum estable + cÃ³digos.

**Estado actual:** el tipo `DenyReason` de la spec **no existe en el cÃ³digo** (bÃºsqueda en `packages/**/*.ts(x)`: 0 resultados). Hay dos vocabularios: `GateCode`, uniÃ³n TypeScript cerrada de 21 cÃ³digos (`cerberus-gate.ts:17-21`), persistida en `cerberus_decisions.code`/`reason` y servida a ADMIN en `GET /api/v1/cerberus/gate/decisions` (`routes/cerberus.ts:142`); y, en el motor heredado, `ruleMatched` (R-xxx) con texto libre en espaÃ±ol. No hay catÃ¡logo documentado ni prueba que fije el conjunto de cÃ³digos (aÃ±adir o renombrar uno no rompe nada). Los textos `reason` incluyen valores dinÃ¡micos (agente, lÃ­mites, gasto del dÃ­a, p. ej. `daily budget â€¦ (spent N)`). Los errores HTTP mezclan cÃ³digos propios y del gate (`routes/cerberus.ts:86`). No verifiquÃ© quÃ© roles distintos de ADMIN alcanzan los endpoints de decisiones.
**Riesgo real:** medio para el indexador/UI; bajo para seguridad si el acceso es sÃ³lo ADMIN.
**CorrecciÃ³n (P1, aditiva):** exportar `GATE_CODES` (cÃ³digo, descripciÃ³n, clase, HTTP) y un tipo `DenyReason` que cubra tambiÃ©n los R-xxx; prueba que fije el conjunto; `docs/cerberus-deny-codes.md`; respuestas a no administradores sÃ³lo con `code` y mensaje genÃ©rico.

### C-8 â€” Eventos de gobernanza NEP-297 Â· PARCIAL (locales) Â· VIGENTE (on-chain)

**QuÃ© dijo NEXUS:** cambios de polÃ­tica, rotaciÃ³n de agentes y pausa no emiten eventos; el indexador ve gastos pero no gobernanza; piden eventos NEP-297.

**Locales (existen, en la cadena de auditorÃ­a SQLite):** pausa/reanudaciÃ³n global = `EMERGENCY_STOP`/`EMERGENCY_CLEAR` (`cerberus-gate.ts:79`); `CERBERUS_APPROVAL` (`:125`); `CERBERUS_RECIPIENT_ADDED/REMOVED` (`:90,94`); decisiones `CERBERUS_GATE` (`:238`); `VAULT_SECRET_*` y `VAULT_KEY_ROTATED`; `CHRONOS_TASK_PAUSED/RESUMED/CANCELLED`; `NEAR_SIGNED/BROADCAST/CONFIRMED`. Brechas: la revocaciÃ³n por parada registra **un** evento de parada, no uno por aprobaciÃ³n revocada (`:73-80`); **cambio de polÃ­tica:** `updatePolicy` no tiene llamadores y no emite evento, y no se registra Â«polÃ­tica activa = hash XÂ» al arrancar; **rotaciÃ³n de agentes:** no existe la funciÃ³n.
**On-chain: VIGENTE.** El contrato sÃ³lo escribe un registro y un log de texto libre `HADES_AUDIT {id} {hash} {height}` (`lib.rs:89`), que no sigue NEP-297 (`EVENT_JSON:{â€¦}`); la bÃºsqueda de `NEP-297`/`EVENT_JSON` en `packages`, `scripts` y `docs` no encuentra nada. NingÃºn evento de gobernanza se emitiÃ³ on-chain.
**RestricciÃ³n:** emitir NEP-297 exige modificar y redesplegar el contrato; requiere tu autorizaciÃ³n.
**CorrecciÃ³n:** (1) sin tocar el contrato: `POLICY_ACTIVE` al arrancar y un evento por aprobaciÃ³n revocada; documentar la distinciÃ³n local/on-chain; (2) con autorizaciÃ³n: anclar la cabeza de la cadena (C-3); (3) contrato v0.5 con evento NEP-297 en `store_audit_hash` (y eventos de gobernanza), con pruebas en sandbox, tras el hackathon o sÃ³lo en testnet con aprobaciÃ³n expresa.

### C-9 â€” Realidad on-chain Â· PARCIAL (documentada) Â· NO VERIFICABLE hoy

**QuÃ© dijo NEXUS:** el on-chain era un hash-log de 184 lÃ­neas, Â«0 txs realesÂ»; no prometan garantÃ­a de cadena en un deploy de papel.

**Estado actual:** la premisa ya no es cierta para el repo, pero **la afirmaciÃ³n sigue necesitando demostraciÃ³n vigente**. Existe contrato desplegado (`audit.hades-omega.testnet`, 225 lÃ­neas con pruebas, `packages/contracts/src/lib.rs`), una transacciÃ³n real `BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3` (commit `d0c02d6`) y evidencia (`docs/evidencia-hades-attest-0001.md`, `docs/evidence-hades-attest-0001.json`, informe `ea04e04`). El verificador `scripts/verify-attestation-onchain.cjs` es de sÃ³lo lectura y tiene 18 comprobaciones (estado FINAL sin fallos, una sola acciÃ³n `store_audit_hash` con 0 depÃ³sito, argumentos exactos, llave FunctionCall restringida, `get_count`, `get_audit_entry`, propietario, SHA-256 del WASM descargado de la cadena, despliegue atÃ³mico, allowance). El `.json` guardado es del 2026-11-02T23:32:51Z (`allPassed: true`).

**VerificaciÃ³n actual (ejecutada, 2026-11-05T20:56Z):** el script terminÃ³ con cÃ³digo 2 y `"error": "RPC tx: HTTP 408"`, **0 comprobaciones ejecutadas** (coincide con los fallos de conexiÃ³n de sesiones previas). Hoy sÃ³lo hay evidencia documentada, no una reverificaciÃ³n.

**Desfases de documentaciÃ³n:** `docs/04-near-integration.md:26` aÃºn dice Â«PLANIFICADA â€” 0 txs realesÂ» (contradice la evidencia); `docs/JUDGES.md:14-23,61` invita a verificar y espera que Â«pase cada comprobaciÃ³nÂ», lo cual depende de que el RPC responda. La garantÃ­a real es acotada: una atestaciÃ³n Ãºnica de un hash, no Â«auditorÃ­a inmutableÂ» ni Â«polÃ­tica en cadenaÂ» (C-1, C-3, C-8).
**CorrecciÃ³n (P0):** reintentos y lista `NEAR_RPC_URLS` en el script; distinguir Â«sin veredictoÂ» de Â«fallÃ³ una comprobaciÃ³nÂ»; reverificar cuando el RPC responda y versionar el resultado con fecha; actualizar `docs/04-near-integration.md`; en JUDGES, indicar fecha de la Ãºltima verificaciÃ³n y la alternativa manual en el explorador.

## 3. Respuesta a las siete recomendaciones de NEXUS

| # | RecomendaciÃ³n | Estado |
|---|---|---|
| 1 | Hard gate en operaciones crÃ­ticas; `policy_hash` en la propuesta | Gate: **sÃ­** para efectos externos. `policy_hash` en propuesta: **no** (sÃ­ en aprobaciones y registro de auditorÃ­a) |
| 2 | Orden determinista + property-tests | Orden por prioridad: **sÃ­**. Desempate explÃ­cito y property-tests: **no** |
| 3 | Audit-chain verificable (prev-hash/Merkle) | prev-hash: **sÃ­**. Comando independiente, ancla y cabeza: **no** |
| 4 | Eventos de gobernanza | Locales: **sÃ­** (con huecos). NEP-297: **no** |
| 5 | Cola de reconciliaciÃ³n NEAR | **SÃ­** en intenciones (estados, recuperaciÃ³n, reconcile); brechas menores en la vÃ­a heredada |
| 6 | ClasificaciÃ³n sensitive server-side | **SÃ­** (registro y listas del servidor; sin bandera del llamante) |
| 7 | Enum estable de DenyReason | **No** (existe `GateCode`, sin catÃ¡logo ni prueba de estabilidad) |

## 4. Capacidades demostradas vs pendientes

| Capacidad | Demostrada con | Pendiente |
|---|---|---|
| Gate de efectos externos, grants de un solo uso, parada | Pruebas con SQLite real; puente falla cerrado sin grant | Fail-closed ante excepciÃ³n; prueba de arquitectura; parada en arranque |
| AprobaciÃ³n ligada a parÃ¡metros y polÃ­tica | Pruebas + 1 tx real documentada | `policyHash` en propuesta; hash en aprobaciones locales |
| Cadena de auditorÃ­a | Experimento T1; `AUDIT_CHAIN_VERIFY` | Truncamiento, hash nulo final, ancla, verificador independiente |
| ReconciliaciÃ³n NEAR | Pruebas con RPC simulado y contrato en sandbox | MÃ¡s de una tx real; refresco con firma apagada |
| Eventos de gobernanza locales | AuditorÃ­a de parada, aprobaciones, Vault, CHRONOS | PolÃ­tica activa; revocaciones individuales |
| Eventos NEP-297 | â€” | No existe (requiere contrato nuevo) |
| VerificaciÃ³n pÃºblica | Script y evidencia del 2026-11-02 | ReverificaciÃ³n actual (hoy HTTP 408); documentos desactualizados |

## 5. Diferencias entre especificaciones antiguas y cÃ³digo actual

| Documento | AfirmaciÃ³n antigua | Realidad |
|---|---|---|
| `docs/04-near-integration.md:26` | 0 txs reales | Contrato desplegado y 1 tx real documentada |
| `docs/04-near-integration.md:243` | Reintentar 3 veces y marcar `NEAR_PENDING` | Estados `BROADCAST_PENDING`/`RECONCILIATION_REQUIRED` con firma persistida y recuperaciÃ³n periÃ³dica |
| `docs/03-cerberus-spec.md:68,309` | ExcepciÃ³n â†’ `DENY GUARD_INTERNAL_ERROR` | `evaluate` no captura excepciones |
| `docs/03-cerberus-spec.md:37` | Tipo `DenyReason` | No existe |
| `docs/03-cerberus-spec.md:149` | AUDIT Â«inmutableÂ» | `CerberusAUDIT` en memoria; cadena SQLite detectable, no inviolable |
| `docs/03-cerberus-spec.md:188` | Registro en NEAR por criterios | SÃ³lo flujo manual aprobado; en agentes, PERMIT de 3 tipos crÃ­ticos |
| `docs/09-cerberus-gate.md` | Â«No signer or broadcaster existsÂ»; el planificador no pasa por el gate | **Desactualizado**: existen firmante y difusiÃ³n (apagados por defecto) y el LLM usa el gate |
| `docs/matriz-trazabilidad-cierre.md` | Rutas alternativas de la parada no cubiertas | Atendido para lanzamientos y aprobaciones (`9a0fbc0`); quedan arranque y motor heredado |

## 6. Prioridades y plan sin regresiones

**P0:** C-9 (reverificar, reintentos/RPC alternativos, actualizar `04` y JUDGES) Â· C-3 (endurecer verificaciÃ³n, ancla, verificador independiente, retirar Â«inmutableÂ»).
**P1:** C-7 (catÃ¡logo + prueba de conjunto) Â· C-1 (excepciÃ³n â†’ DENY, prueba de arquitectura, parada en arranque) Â· C-8 (evento `POLICY_ACTIVE`, documentar local vs on-chain).
**P2:** C-2 (orden total + property-tests) Â· C-4 (`policyHash` en propuesta) Â· C-6 (vÃ­a heredada, refresco con firma apagada).
**P3:** C-5 (lista blanca por tipo).
**Requieren tu autorizaciÃ³n expresa:** contrato con NEP-297, anclaje on-chain de la cabeza de la cadena, habilitar firma, cualquier transacciÃ³n.

Plan por bloques (todos aditivos; pruebas rojas primero; tras cada bloque `npx turbo run test type-check lint build --force --concurrency=1` y `npm run test:e2e`; lÃ­nea base: 414 aprobadas, 3 omitidas, Playwright 22/2; firma NEAR apagada por defecto en todos):
- **A (C-9):** script del verificador + documentaciÃ³n de jueces y `04`.
- **B (C-3):** `verifyAuditIntegrity` endurecido, tabla de ancla (migraciÃ³n nueva), `verify-audit-chain.cjs`, transacciÃ³n inmediata.
- **C (C-7):** `GATE_CODES`/`DenyReason`, prueba de conjunto, documento, respuestas seguras.
- **D (C-1):** `try/catch` en `evaluate`, prueba de arquitectura, parada en arranque.
- **E (C-2, C-4, C-5, C-6, C-8 local):** orden total y `fast-check` (verificar licencia y versiÃ³n antes de aÃ±adir), `policyHash` en propuesta, `POLICY_ACTIVE`, eventos por revocaciÃ³n, captura de fallo en la vÃ­a heredada.
- **F (opcional, con autorizaciÃ³n):** anclaje y diseÃ±o del contrato v0.5 con NEP-297 en sandbox.

Antes de cada bloque, reutilizar lo existente: `verifyAuditIntegrity`, `AUDIT_CHAIN_VERIFY`, el verificador on-chain, `near_security` y `GateCode`; no duplicar. No se copia cÃ³digo externo; `fast-check` y cualquier otra dependencia requieren revisiÃ³n de licencia y seguridad.


## 8. Estado tras las correcciones locales (fase de cierre)

Alcance: sÃ³lo cambios locales y verificables. **No** se tocaron contratos, despliegues, claves reales, firma ni transmisiÃ³n de transacciones NEAR (firma desactivada por defecto). Las pruebas con dobles (RPC simulado) **no** se presentan como evidencia on-chain.

| ID | Estado inicial | Estado actual | QuÃ© cambiÃ³ | Evidencia (pruebas) |
|---|---|---|---|---|
| C-9 | PARCIAL / NO VERIFICABLE | **MEJORADO** (verificador robusto; la verificaciÃ³n real depende de que haya RPC disponible â†’ veredicto INCONCLUSIVE si no) | Cliente RPC con reintentos y RPC alternos; veredictos PASS/FAIL/INCONCLUSIVE; `docs/04-near-integration.md` y `docs/JUDGES.md` actualizados | `verifier-rpc.test.ts` (7) |
| C-3 | PARCIAL | **RESUELTO (local)** | DetecciÃ³n de truncamiento, hash nulo, cabeza y ancla local (`audit_anchor`); verificador independiente de sÃ³lo lectura `scripts/verify-audit-chain.cjs` con `--expect-head/--expect-count`. LÃ­mite: un atacante con control total del archivo puede reescribir tambiÃ©n el ancla interna; sÃ³lo un ancla **externa** lo detecta | `audit-chain-hardening.test.ts` (10) |
| C-1 | PARCIAL | **RESUELTO (local)** | `CerberusGUARD.evaluate` y `CerberusGate.authorize` nunca lanzan: ante error â†’ DENY `GUARD_INTERNAL_ERROR`/`GATE_INTERNAL_ERROR`, auditado y sin detalle interno; la recuperaciÃ³n al arranque no reanuda operaciones APPROVED mientras la parada de emergencia estÃ¡ activa (`APPROVED_RESUME_SKIPPED:EMERGENCY_STOP`) | `fail-secure.test.ts`, `cerberus-failsecure.test.ts` |
| C-7 | VIGENTE | **RESUELTO** | CatÃ¡logo Ãºnico y estable `decision-codes.ts` (34 cÃ³digos), `GUARDDecision.reasonCode`, `GET /api/v1/cerberus/gate/codes` (cualquier rol autenticado), mensajes HTTP genÃ©ricos; prueba anti-deriva sobre los literales del gate. Ver `docs/cerberus-deny-codes.md` | `cerberus-codes.test.ts`, `cerberus-failsecure.test.ts` |
| C-2 | PARCIAL | **RESUELTO** | Orden total: prioridad, luego DENY > ESCALATE > PERMIT, luego id; prueba de propiedades con PRNG propio | `fail-secure.test.ts` |
| C-4 | RESUELTO / PARCIAL | **RESUELTO** en la vÃ­a de agentes | `OperationProposal.policyHash` fijado por el agente; propuesta con polÃ­tica obsoleta â†’ DENY `GUARD_POLICY_STALE`. **LimitaciÃ³n:** las aprobaciones de misiones locales siguen sin ligarse a un hash de entrada (no se implementÃ³; queda como mejora) | `fail-secure.test.ts`, `near-failure.test.ts` |
| C-5 | RESUELTO | **RESUELTO** | Prueba de regresiÃ³n: la sensibilidad no la decide quien llama | `fail-secure.test.ts` |
| C-6 | RESUELTO / PARCIAL | **RESUELTO** | Un fallo del puente en la vÃ­a de agentes ya no pierde la decisiÃ³n: queda `nearPending` (cÃ³digo fijo, sin detalle). La recuperaciÃ³n NEAR corre siempre y es de sÃ³lo lectura si existe cualquier bloqueo de firma | `near-failure.test.ts`, `submission.test.ts` (C-6) |
| C-8 | PARCIAL / VIGENTE | **PARCIAL** | Eventos locales: `POLICY_ACTIVE` (una vez por cambio de hash de polÃ­tica/herramientas) y `CERBERUS_APPROVAL_REVOKED` por cada aprobaciÃ³n revocada. **Los eventos NEP-297 on-chain siguen sin existir** (requiere cambio de contrato: bloque F, no autorizado) | `cerberus-failsecure.test.ts` |

**Limitaciones restantes:** (1) C-8 on-chain y cualquier cambio de contrato (bloque F); (2) ancla externa de la cadena de auditorÃ­a (hoy sÃ³lo se puede fijar `--expect-head` fuera de banda); (3) vinculaciÃ³n de aprobaciones de misiones locales a un hash de entrada; (4) la verificaciÃ³n on-chain de la tx de referencia requiere un RPC accesible en el momento de ejecutar el verificador.

