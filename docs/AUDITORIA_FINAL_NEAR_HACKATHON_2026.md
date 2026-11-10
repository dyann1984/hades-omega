# AUDITORÍA FINAL INTEGRAL — HADES OMEGA · NEAR HACKATHON 2026

**Fecha de la auditoría:** 2026-11-10 (21:00–22:00 UTC)
**Rama auditada:** `codex/hades-omega-finalizacion` @ `265357c` (171 commits)
**Rama de la auditoría:** `audit/final-near-hackathon-2026` (descendiente directa de `265357c`)
**Alcance:** inspección de código, ejecución real de pruebas locales, verificación on-chain de solo lectura, comprobación en vivo del despliegue público, lectura de las fuentes oficiales del concurso.

**Nada se publicó, desplegó, firmó ni envió. No se hizo `push`, `merge`, `rebase` ni `reset`. No se ejecutó ninguna transacción blockchain. No se mostró, copió ni exportó ningún secreto.**

Todas las cifras de este informe provienen de comandos ejecutados durante esta auditoría. Donde algo no pudo verificarse, se marca **NO VERIFICADO** con la causa exacta. Las cifras de documentos anteriores (397 pruebas, etc.) se trataron como antecedentes y se sustituyeron por mediciones nuevas.

---

## A. RESUMEN EJECUTIVO

| Pregunta | Respuesta |
|---|---|
| **Estado general** | Producto funcional, seguro y verificable. El trabajo está terminado; **la entrega no**. |
| **¿HADES es elegible?** | **Sí.** Testnet es elegible en todos los tracks; el repositorio es público; el código está dentro de la ventana (primer commit 2026-10-24, anuncio 2026-10-19). |
| **¿El producto es funcional?** | **Sí, comprobado.** 461 pruebas unitarias, 22 E2E de navegador, 22 comprobaciones del flujo completo sobre HTTP real y 25 de seguridad de la demo pública, todas ejecutadas hoy y en verde. |
| **¿Puede demostrarse?** | **Sí, de tres formas**: demo pública en vivo (verificada hoy), flujo local reproducible en ~2 minutos, y prueba on-chain real verificable por terceros en 30 segundos. |
| **¿Está listo para entregarse?** | **No todavía.** Existe **un bloqueante real y una sola causa raíz**: lo que GitHub publica en `main` está **82 commits por detrás** del trabajo real. Los jueces abrirían un repositorio sin licencia, sin el endurecimiento de CERBERUS, sin el verificador on-chain y sin `docs/JUDGES.md` actualizado. |

### Diagnóstico

> ## **LISTO CON ACCIONES EXTERNAS PENDIENTES**

El producto es entregable **hoy mismo** en lo técnico. Lo que falta son cinco acciones que **sólo la dueña puede ejecutar** (publicar en GitHub, licencia, video, publicación en X, formulario). Ninguna requiere escribir código nuevo.

---

## B. MATRIZ TÉCNICA POR MÓDULO

Estado: **IMPLEMENTADO** · **PARCIAL** · **SIMULADO** · **PENDIENTE** · **NO VERIFICADO**

### B.1 Motor multiagente

| Agente | Estado | Implementación real verificada | Persistencia | Pruebas | Observaciones |
|---|---|---|---|---|---|
| **HADES** (orquestación) | **IMPLEMENTADO** | `packages/core/src/agents/hades.ts`; planificación de grafo acíclico, bus de misiones, despacho; `cap:crypto:hash` con ejecutor real | SQLite (`missions`, `tasks`) | `hades.test.ts`, `agents.test.ts` | Verificado: no ejecuta tareas dependientes tras un fallo y usa el ID real de misión |
| **CHARON** (ingesta) | **IMPLEMENTADO** | `cap:doc:intake@1.0.0` → ejecutor real en `capability-dispatcher.ts:25-29`; extracción TXT/PDF/DOCX/JSON | SQLite + evidencia SHA-256 | `documents.test.ts`, `documents-pdf-docx.test.ts` | 422 real ante PDF/DOCX corruptos |
| **MINOS** (validación) | **IMPLEMENTADO** | `cap:doc:validate@1.0.0` → ejecutor real (`:30-36`) | SQLite | `document-analysis.test.ts` | Falla explícitamente ante documento vacío o JSON inválido |
| **PERSEPHONE** (análisis financiero) | **IMPLEMENTADO** | `cap:doc:compare@1.0.0` → ejecutor real (`:37-55`); rangos por moneda explícita, importes, porcentajes | SQLite | `multi-document-evidence.test.ts` | Determinista, basado en reglas, no en LLM |
| **ELYSIUM** (generación) | **IMPLEMENTADO** | `cap:report:generate@1.0.0` → ejecutor real (`:56-61`), informe Markdown descargable | SQLite + entregable | `audit-flow.test.ts` | El informe declara "no es un dictamen jurídico" |
| **TARTARUS** (seguridad/sellado) | **IMPLEMENTADO** | `cap:crypto:hash@1.0.0` → SHA-256 real (`:62-65`) | Evidencia sellada | `audit-flow.test.ts` | Sello verificable de extremo a extremo |
| **CERBERUS** (políticas) | **IMPLEMENTADO** | `packages/core/src/cerberus/{guard,policy,audit}.ts` + `packages/api/src/cerberus-gate.ts` | SQLite, cadena de hash | 6 archivos de prueba dedicados | Ver §B.3 |
| **CHRONOS** (persistencia/seguimiento) | **IMPLEMENTADO** | `packages/api/src/chronos/`; tablas `chronos_tasks`/`chronos_runs`, cron real, reintento tras caída, recuperación por *lease* | SQLite | `chronos.test.ts` | El seguimiento diario `0 9 * * *` es **READ-only** por diseño |

**Capacidades declaradas sin ejecutor — honestidad verificada.** El registro declara 12 pares (agente, capacidad); **6 tienen ejecutor real** y 6 lanzan `CAPABILITY_NOT_IMPLEMENTED` (`capability-dispatcher.ts:66`). El endpoint `/capabilities` expone el campo `implemented` y **una prueba obliga a que la lista y las ramas del despachador no se desincronicen** (`capability-dispatcher.test.ts`). Sin ejecutor: `cap:procurement:eval`, `cap:policy:verify`, `cap:financial:analyze`, `cap:resilience:recover`, `cap:orchestration:plan`, `cap:security:guard`. **Esto está declarado en README y JUDGES.** No es un fallo: es una limitación declarada correctamente.

### B.2 Capa de aplicación

| Módulo | Estado | Nota |
|---|---|---|
| API Fastify (`packages/api`) | **IMPLEMENTADO** | 48 archivos de prueba; JWT, rate limit, CORS por origen |
| Persistencia SQLite + durable (`durable.ts`) | **IMPLEMENTADO** | Instantáneas consistentes, escrituras de admin *fail-closed* en estado degradado, TLS obligatorio para Neon, redacción de secretos |
| Frontend React/Vite | **IMPLEMENTADO** | 75 pruebas unitarias; 22 E2E de navegador en escritorio y móvil |
| Vault de secretos (`secret-vault.ts`, `vault-rotation.ts`) | **IMPLEMENTADO** | Rotación operativa con copia de seguridad y verificación; las pruebas afirman que ningún valor de secreto aparece en respuestas |
| Planificador LLM (Anthropic) | **PARCIAL / DESACTIVADO** | `ClaudeAnthropicPlanner.ts` implementado tras política de egreso; **desactivado por defecto y no ejercitado contra la API real**. Declarado como tal. |
| `payment.execute` | **PENDIENTE (por diseño)** | Registrado en la política de CERBERUS, **sin ejecutor**. Declarado. |
| Eventos de gobernanza on-chain NEP-297 | **PENDIENTE** | Requiere cambio del contrato. Sólo existen eventos locales en la cadena de auditoría. Declarado. |
| Enlace UI «evidencia de misión → registro on-chain» | **PENDIENTE** | La tubería prepara el *intent*; el único registro on-chain atesta el **contrato**, no una misión empresarial. Declarado. |

### B.3 CERBERUS — control preventivo

| Control | Estado | Evidencia |
|---|---|---|
| Deny-by-default | **IMPLEMENTADO** | `policy.ts` R-008 (`ALWAYS` → `DENY`, prioridad 1) cierra el conjunto; orden total de reglas |
| Efecto financiero oculto | **IMPLEMENTADO** | R-016, prioridad **250** (la más alta): una operación interna no puede llevar destinatarios, cuentas, depósitos ni credenciales |
| Permiso por tipo de operación | **IMPLEMENTADO** | R-009, prioridad 200 |
| Herramientas no registradas | **IMPLEMENTADO** | R-014, prioridad 190; registro de herramientas con clases de efecto (READ/WRITE/EXTERNAL/FINANCIAL/BLOCKCHAIN/EGRESS) |
| Aprobación humana de un solo uso | **IMPLEMENTADO** | `claimForSigning` consume la aprobación; ligada al hash exacto de parámetros y de la política; caduca ≤15 min |
| Vinculación de aprobación a la entrada | **IMPLEMENTADO** | Si los documentos o la comparación cambian tras pedir la aprobación → `409 APPROVAL_BINDING_MISMATCH`, también al reanudar tras reinicio (`local-approval-binding.test.ts`) |
| Parada de emergencia | **IMPLEMENTADO** | Persistente; bloquea lanzamientos, aprobaciones y reenvíos; **revoca concesiones y aprobaciones**; se reevalúa en el arranque (`emergency-stop-guard.ts`, `cerberus-failsecure.test.ts`) |
| Fail-secure | **IMPLEMENTADO** | Cualquier error interno de CERBERUS es `DENY` y queda auditado (`fail-secure.test.ts`, 11 pruebas) |
| Códigos de decisión estables | **IMPLEMENTADO** | `GET /api/v1/cerberus/gate/codes`, `docs/cerberus-deny-codes.md`; mensajes de denegación genéricos (no filtran la política) |
| Cadena de auditoría por hash | **IMPLEMENTADO** | Detecta alteración, **truncamiento de cola**, hash nulo y sustitución del último evento; ancla externa exportable |
| Control de acceso por rol | **IMPLEMENTADO** | Los roles se leen **siempre de la sesión del servidor, nunca del token** (`security.ts:26-27`) — defensa correcta contra manipulación de JWT |
| Protección contra *prompt injection* | **PARCIAL** | Mitigación arquitectónica (los agentes no pueden actuar; toda acción sensible pasa por la verja y requiere aprobación humana ligada a parámetros). **No hay filtro de contenido de prompts** porque el flujo por defecto no usa LLM. Correcto para el diseño actual. |

---

## C. NEAR — VERIFICACIÓN INDEPENDIENTE

Todo lo de esta sección fue consultado por la auditoría mediante **JSON-RPC público de solo lectura**, sin usar código del proyecto, y después re-confirmado con el verificador del repositorio.

### C.1 Cuentas y contrato

| Comprobación | Resultado verificado hoy |
|---|---|
| Red | `testnet`, altura de bloque **277 121 588** |
| `hades-omega.testnet` | **EXISTE**. Saldo 6,9926477633446827 NEAR. `code_hash` = `11111…1` (sin contrato, es la cuenta propietaria/firmante) ✔ |
| `audit.hades-omega.testnet` | **EXISTE**. Saldo 2,9982424587567502 NEAR. `code_hash` = `CkaYdt6NcWYnwBPPFyPQ2xE1FRSE8nnxa6FC2bUdjyun` ✔ **contrato desplegado** |
| WASM descargado de la cadena | **218 046 bytes**, SHA-256 `ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685` |
| ¿Coincide con `docs/contract-attestation.json`? | **SÍ, byte a byte** (bytes, SHA-256 y base58 idénticos) ✔ |
| `get_owner()` | `"hades-omega.testnet"` ✔ |
| `get_count()` | **1** ✔ |
| `contract_source_metadata()` | `{"version":"0.4.0","standards":[{"standard":"nep330","version":"1.3.0"}]}` ✔ |

### C.2 La transacción reportada

`BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3`

**Distinción obligatoria entre error de consulta y fallo real:**

* En el RPC estándar (`rpc.testnet.near.org`) devuelve `UNKNOWN_TRANSACTION` → *"doesn't exist"*. **Esto NO es un fallo del contrato**: los nodos normales de testnet descartan los datos de transacción pasadas unas épocas, y esta transacción se ejecutó en el bloque 275 967 539, ~1,15 millones de bloques atrás. Es un **límite de retención de la consulta**.
* En **dos nodos archival independientes** (`archival-rpc.testnet.near.org` y `archival-rpc.testnet.fastnear.com`) la transacción responde de forma idéntica:

| Campo | Valor verificado |
|---|---|
| `final_execution_status` | **FINAL** |
| `status` | **SuccessValue** (sin `Failure`) |
| Recibos con fallo | **0** de 3 |
| Firmante → receptor | `hades-omega.testnet` → `audit.hades-omega.testnet` ✔ |
| Llave usada | `ed25519:Gm4bBKzHhAsHhQGUfSPpphL1QxTCA8uxbaJmPYvVtw7n` → **la FunctionCall restringida, NO la FullAccess** ✔ |
| `nonce` | 275 964 626 000 001 (= nonce inicial + 1 → **un solo envío firmado con esa llave**) |
| Acciones | **una sola**: `FunctionCall store_audit_hash`, `deposit: "0"`, `gas: 30 TGas` ✔ |
| Argumentos | `audit_id: hades-attest-0001`, `content_hash: 4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b`, `operation_type: CONTRACT_ATTESTATION`, `agent_name: HADES`, `decision: PERMIT` |
| Log emitido | `HADES_AUDIT hades-attest-0001 4bb4f2d9…571b 275967539` |

`get_audit_entry("hades-attest-0001")` devuelve **exactamente** ese `content_hash`, `recorder: hades-omega.testnet`, `block_height: 275967539`, `block_timestamp: 1793661992804792486`.

**Conclusión: la afirmación on-chain del proyecto es verdadera y verificable por un tercero.** El hash registrado coincide con el autorizado; no hay duplicados; el despliegue + init atómico (`QSf1bwTWzvvRCQ6W4HQ5fVmYYQN3BAyXudqqs6WsPqj`) está atestado.

### C.3 Seguridad de la firma

| Validación requerida | Resultado |
|---|---|
| Permisos de la llave FunctionCall (**sólo información pública**) | `receiver_id: audit.hades-omega.testnet`, `method_names: ["store_audit_hash"]` (exactamente uno), `allowance: 249 804 814 853 308 100 000 000` yocto ≈ **0,2498 NEAR**. **Privilegio mínimo correcto.** ✔ |
| El contrato no permite acciones fuera de alcance | ✔ Verificado en `src/lib.rs`: sólo `new`, `store_audit_hash`, `get_audit_entry`, `get_count`, `get_owner`. **Sin** `promise_*`, transferencias, despliegue, alta/baja de llaves, *staking* ni llamadas cruzadas. No *payable*: cualquier depósito hace fallar la llamada. `store_audit_hash` es **owner-only**. |
| Prevención de transacciones duplicadas | ✔ **Cuatro capas**: (1) el contrato es idempotente — repetir un registro idéntico devuelve el existente y no cambia nada; reusar `audit_id` con contenido distinto hace *panic*; (2) `preflight` rechaza `DUPLICATE_SUBMISSION` y `ALREADY_RECORDED`; (3) restricciones `UNIQUE` en `audit_id` y `tx_hash`; (4) los bytes firmados se persisten **antes** de transmitir y cada reintento reenvía **bytes idénticos** (la red deduplica por hash) — **nunca se vuelve a firmar**. |
| Aprobación humana de un solo uso | ✔ `claimForSigning` la consume; los parámetros entregados al puente se re-verifican byte a byte contra el hash aprobado (`submission.ts:197`). |
| Parada de emergencia | ✔ Impide reclamar la firma, impide retransmitir (`submission.ts:269`) y se reevalúa en la recuperación de arranque. |
| Flujo firma → transmisión → confirmación → recuperación | ✔ Orden fijo verificado: `preflight` (solo lectura) → consumir aprobación → concesión CERBERUS → firmar → persistir bytes → transmitir → confirmar contra el estado **on-chain** → `reconcile` decide sólo desde el estado del contrato. Un fallo tras consumir la aprobación **nunca** vuelve a firmar; exige una aprobación humana nueva. |
| El modo demostración no puede ejecutar transacciones reales | ✔ **Verificado en vivo** contra el despliegue público (§D.3): `blockers: ["SIGNING_DISABLED","NO_SIGNER","NO_CONTRACT_CONFIGURED"]`, `signingEnabled: false`, y la sesión DEMO recibe **403** en todas las rutas NEAR/CERBERUS/Vault. |
| Protecciones adicionales | Firma **desactivada por defecto** (`NEAR_SIGNING_ENABLED` sin definir); llaves FullAccess **rechazadas** salvo opt-in explícito; *allowance* ilimitado rechazado; lista blanca de hosts RPC que **excluye mainnet**; `NEAR_AUDIT_CONTRACT_ID` obligado por expresión regular a ser `.testnet`. |

### C.4 ¿Puede vincularse ya la evidencia de una misión empresarial a NEAR?

**Casi, pero no está hecho.** La tubería completa existe y está probada; lo que falta es *ejecutar una vez* un `store_audit_hash` con el hash de evidencia de una misión real en lugar del hash del binario del contrato. Hoy el único registro on-chain atesta **el contrato** (`operation_type: CONTRACT_ATTESTATION`), no una misión. El `allowance` restante (0,2498 NEAR) alcanza sobradamente para otra transacción.

> **Requiere autorización expresa** (Grupo C). Es la mejora de impacto más alta disponible y la única que cerraría la brecha narrativa «misión empresarial → prueba on-chain».

---

## D. PRUEBAS — COMANDOS Y RESULTADOS REALES

Todo lo siguiente se ejecutó en esta máquina durante la auditoría (2026-11-10).

### D.1 Ejecutadas y aprobadas

| Comando | Resultado real | Código de salida |
|---|---|---|
| `npm run type-check` | **PASS**, 3 workspaces | 0 |
| `npx turbo lint --force` (sin caché) | **PASS**: 54 problemas = **0 errores, 54 advertencias** (todas `@typescript-eslint/no-explicit-any` en `@hades/api`) | 0 |
| `npm run build` | **PASS**, 3 workspaces | 0 |
| `npm test` | **461 aprobadas, 3 omitidas** en 69 archivos → core **92/92** (11 archivos); api **294 aprobadas + 3 omitidas** (47 archivos + 1 omitido); frontend **75/75** (10 archivos) | 0 |
| `npx playwright test` | **22 aprobadas, 2 omitidas, 0 fallidas, 0 inestables** (Edge; proyectos *desktop* 1366×800 y *mobile* 390×844) | 0 |
| `node scripts/e2e-audit-flow.cjs` | **22/22 PASS** | 0 |
| `node scripts/check-public-demo-safety.cjs` | **25/25 PASS** | 0 |
| `node scripts/verify-attestation-onchain.cjs` | **18/18 PASS** vía `archival-rpc.testnet.near.org` | 0 |
| `node scripts/verify-audit-chain.cjs --db data/hades.json.sqlite` | **PASS**, 61 eventos, 61 con hash | 0 |
| `node scripts/verify-audit-chain.cjs --db local-data/hades-live.sqlite` | **PASS**, 30 eventos, 30 con hash | 0 |
| `node scripts/check-doc-links.cjs` | **ALL LINKS OK** (0 enlaces rotos) | 0 |
| Verificación on-chain cruda por JSON-RPC (sin código del proyecto) | **Todo coincide** (§C) | — |
| Demo pública en vivo: control de acceso | **Todo correcto** (§D.3) | — |

**Las cifras anteriores de la documentación quedan corregidas:** 397 → **461** pruebas unitarias; 24 → **22 aprobadas + 2 omitidas** en Playwright. Las de E2E (22) y on-chain (18) se confirman.

### D.2 Omitidas y NO ejecutadas, con causa

| Prueba | Estado | Causa exacta |
|---|---|---|
| 3 pruebas de API | **OMITIDAS por diseño** | `src/near/rpc.live.test.ts` — pruebas contra RPC en vivo, desactivadas por defecto para no depender de la red |
| 2 pruebas Playwright | **OMITIDAS por diseño** | `evidence.spec.ts:10` «capture evidence screenshots», captura opcional de evidencia |
| **Pruebas unitarias Rust** (12 documentadas) | **NO EJECUTADAS · NO VERIFICADO** | `cargo` **no está instalado** en esta máquina. No se re-verificaron hoy. |
| **Pruebas de integración en `near-sandbox`** (6 documentadas) | **NO EJECUTADAS · NO VERIFICADO** | Misma causa: sin toolchain Rust. |
| **Reproducibilidad del WASM desde el código fuente** (`scripts/verify-contract-wasm.ps1`) | **NO VERIFICADO** | El CLI de Docker existe (v29.9.2) pero **el daemon no está corriendo**: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`. ⚠️ Esto **no** afecta a la verificación de que el WASM **en la cadena** coincide con la atestación — eso sí se comprobó byte a byte (§C.1). Lo no verificado hoy es que ese binario se regenere desde el código. |
| `gitleaks` | **NO EJECUTADO localmente** | No está instalado. **Sustituido** por un barrido propio de patrones sobre las 171 revisiones (§E.2). El workflow `.github/workflows/secret-scan.yml` lo ejecuta en CI. |

### D.3 Demostración pública — comprobada EN VIVO hoy

> **Hallazgo que contradice la documentación actual, en sentido favorable:** README y `docs/JUDGES.md` declaran el despliegue público como *«Pending»* y *«no alcanzable en la comprobación del 2026-11-05»*. **Hoy sí está en línea.**

| Comprobación | Resultado |
|---|---|
| `https://hades-omega-ten.vercel.app/` | **HTTP 200**, la SPA carga |
| `https://hades-omega.onrender.com/health` | **HTTP 200** · `{"status":"ok","version":"0.3.0"}` |
| `POST /api/v1/demo/session` sin credenciales | **OK**, `role: DEMO` |
| `GET /api/v1/demo/near/status` | `mode: simulation`, `label: SIMULADA`, `transactionsSigned: 0` ✔ |
| Etiquetas de capacidades en `/demo/info` | `cerberus=REAL`, `approval=REAL`, `audit=REAL`, `sha256=REAL`, `documents=DETERMINISTA`, `near=SIMULADA`, `purchases=SIMULADA`, `llm=NO_DISPONIBLE` ✔ **honesto en producción** |
| Sesión DEMO contra rutas sensibles | **403** en las 6 probadas (`/near/tx/status`, `/cerberus/policy`, `/vault/status`, `/missions`, `/chronos/tasks`, `/audit/integrity`) ✔ |
| Anónimo contra rutas sensibles | **401** en las 3 probadas ✔ |
| Exposición de credenciales | **Ninguna** detectada en las respuestas ✔ |

**Defecto real encontrado en el despliegue:** `https://hades-omega-ten.vercel.app/verify/index.html` devuelve **el `index.html` de la SPA**, byte a byte idéntico a la raíz. El archivo sí está en el *bundle* (`packages/frontend/dist/verify/index.html` existe y es **idéntico en SHA-256** a `docs/verify/index.html`), pero la regla `{"source": "/(.*)", "destination": "/index.html"}` de `vercel.json` se lo traga. Por tanto, la afirmación de `docs/JUDGES.md` §2 — *«The public demo site, once deployed, serves the same page at /verify/index.html»* — **es falsa hoy**. Corregido en §G (Grupo A), aunque surtir efecto requiere redesplegar (Grupo C).

### D.4 ¿Se puede demostrar en menos de tres minutos?

**Sí.** Ruta verificada, con un matiz importante:

| # | Paso | Dónde | Evidencia |
|---|---|---|---|
| 1 | Creación de una misión | UI local u `e2e-audit-flow` | ✔ real |
| 2 | Ejecución de agentes | CHARON → MINOS → PERSEPHONE | ✔ real, 3 etapas completadas |
| 3 | Evaluación de CERBERUS | La misión **se detiene** esperando a un humano | ✔ real — informe, sello y evidencia **no ejecutados** hasta aprobar |
| 4 | Aprobación humana | `Aprobar (ADMIN)` | ✔ real, de un solo uso, ligada a parámetros |
| 5 | Generación de evidencia | Informe ELYSIUM + sello SHA-256 TARTARUS | ✔ real y verificable |
| 6 | Registro y verificación blockchain | **Dos cosas distintas, hay que decirlo en voz alta** | ⚠️ ver abajo |

**El matiz del paso 6, que debe explicitarse ante los jueces:** en la demo en vivo NEAR aparece como `SIMULADA / transactionsSigned: 0` **a propósito** (el despliegue público no tiene llave y no puede firmar). La **prueba on-chain real e histórica** es la transacción `BGzHzQAr…` y se verifica aparte, en 30 segundos, con `node scripts/verify-attestation-onchain.cjs` o el explorador. El guion debe presentar ambas por separado y nunca insinuar que la demo firmó algo. El proyecto ya lo hace así en su documentación; el video debe mantener ese rigor.

---

## E. SEGURIDAD

### E.1 Resumen de hallazgos

**No se encontró ningún hallazgo CRÍTICO ni ALTO con explotabilidad real.**

| Severidad | # | Detalle |
|---|---|---|
| CRÍTICO | **0** | — |
| ALTO | **0** | — |
| MEDIO | **2** | E-01, E-02 |
| BAJO | **3** | E-03, E-04, E-05 |

---

**E-01 · MEDIO · El repositorio público expone una versión obsoleta sin el endurecimiento de seguridad**
*Evidencia:* `origin/main` = `701113b`, **82 commits por detrás** de `265357c`. GitHub reporta `license: null` y `pushed_at: 2026-11-03T01:54:52Z`.
*Riesgo:* lo publicado carece del *fail-secure* de CERBERUS, la revocación de concesiones en parada de emergencia, la vinculación de aprobaciones al hash de entrada, el detector de truncamiento de la cadena de auditoría y la política de llave de firma endurecida. Quien clone el repositorio hoy obtiene código con menos defensas.
*Explotabilidad real:* no hay instancia de producción de terceros corriendo ese código, por lo que el impacto es reputacional y de evaluación, no de compromiso activo.
*Acción correctiva:* publicar el trabajo actual (§G, Grupo C — requiere autorización).

**E-02 · MEDIO · Dos vulnerabilidades de severidad alta en dependencias, ambas de desarrollo**
*Evidencia:* `npm audit` sobre 627 dependencias → **0 críticas, 2 altas, 7 moderadas, 12 bajas**.
*Ubicación y tipo:*
- **Altas (2):** `playwright` / `@playwright/test` — *«downloads and installs browsers without verifying the authenticity of the SSL certificate»*. **Sólo `devDependency`**: no entra en el runtime de producción ni en el bundle del frontend.
- **Moderadas (7):** `minimatch` (DoS por amplificación de *globparts*) a través de la cadena `typescript-eslint`. **Sólo desarrollo.**
- **Bajas (12):** `elliptic` → `secp256k1` → `@near-js/crypto` → `near-api-js` (*«Uses a Cryptographic Primitive with a Risky Implementation»*). **Esta sí es dependencia de ejecución.** Atenuante: HADES firma con **ed25519**, no con secp256k1, por lo que la primitiva señalada no está en la ruta de firma del proyecto.
*Explotabilidad real:* baja. Ninguna es alcanzable por un atacante remoto contra el servicio desplegado.
*Acción correctiva:* `npm update @playwright/test typescript-eslint` antes de publicar reduce las 2 altas y las 7 moderadas a 0 sin tocar el runtime. **No se aplicó**: modifica `package-lock.json` y obliga a re-ejecutar toda la batería; a 4 días del cierre es una decisión de la dueña (Grupo B).

**E-03 · BAJO · Claves administrativas presentes en el árbol de trabajo**
*Evidencia:* `hades-admin.key`, `hades-admin-temporal.key` y `.env.local` existen en `L:\HADES\`.
*Verificación:* **nunca han estado en git**. `git check-ignore` confirma que están cubiertos por `.gitignore:20 (*.key)` y `.gitignore:127 (**/.env.*)`; una búsqueda de archivos añadidos en **todas** las revisiones no devuelve ningún `.key`, `.pem`, `.env` ni `.sqlite`.
*Riesgo:* local únicamente (copia de seguridad del disco, uso compartido de la carpeta).
*Acción correctiva:* ninguna urgente. **No se leyó, copió ni mostró el contenido de ningún archivo de claves.** Si la máquina se comparte o se respalda a la nube, muévanse a una ubicación cifrada.

**E-04 · BAJO · 54 advertencias de `no-explicit-any` en `@hades/api`**
*Riesgo:* calidad de tipos; puede enmascarar errores en los límites de deserialización. 0 errores de lint.
*Acción correctiva:* opcional, posterior al concurso.

**E-05 · BAJO · El contrato no tiene pausa ni actualización on-chain**
*Evidencia:* `src/lib.rs` no expone `pause`/`migrate`; la parada de emergencia vive **fuera de la cadena**, en CERBERUS.
*Riesgo:* si la llave FunctionCall se viera comprometida, la parada off-chain no impediría escrituras directas al contrato; el límite real sería el *allowance* de 0,2498 NEAR y el hecho de que sólo se puede llamar a `store_audit_hash` (que no mueve fondos).
*Valoración:* **es una decisión de diseño defendible** — el contrato no custodia fondos y la ausencia de `migrate` lo hace inmutable, lo que refuerza la garantía de auditoría. Debe **declararse** así, no corregirse a 4 días del cierre.

### E.2 Auditoría de secretos — resultado

Barrido propio sobre **las 171 revisiones** del repositorio, buscando: llaves privadas ed25519 en base58, `sk-ant-*`, `sk-*`, `AKIA*`, `gh[pousr]_*`, bloques PEM `BEGIN … PRIVATE KEY`, tokens `xox*` y URLs de Postgres con contraseña.

| Patrón | Resultado |
|---|---|
| Llave privada NEAR ed25519 | **limpio** |
| Bloque PEM de clave privada | **limpio** |
| Token de GitHub | **limpio** |
| Clave de AWS | **limpio** |
| Token de Slack | **limpio** |
| URL de Postgres con contraseña | **limpio** |
| Clave de OpenAI | **limpio** |
| Clave de Anthropic | **63 coincidencias, 1 sola ruta**: `packages/api/src/llm-governor.test.ts` → son los literales `sk-ant-FAKE-FAKE-FAKE-0000` y `sk-ant-TEST-not-a-real-key-0001`. **Señuelos de prueba, no credenciales.** |

Además: ningún `.key`, `.pem`, `.env`, `.sqlite` ni `.db` ha sido rastreado jamás; las bases de datos vivas (`data/`, `local-data/`) están correctamente ignoradas; `.gitleaksignore` documenta una única excepción justificada (una `Idempotency-Key` con forma de UUID en una prueba).

**Conclusión: el historial está limpio. El repositorio puede publicarse sin riesgo de filtración de credenciales.**

### E.3 Controles verificados positivamente

* **Autenticación:** JWT con secreto obligatorio de ≥32 caracteres comprobado al arrancar; expiración validada; sesión verificada contra el servidor en cada petición.
* **Autorización:** los roles se toman **siempre de la sesión del servidor, nunca del token** — defensa correcta contra manipulación de claims.
* **Aislamiento DEMO:** *default-deny* en el *hook* `onRequest`, antes de parsear el cuerpo; repositorio SQLite **en memoria por sesión**; `403` comodín para todo lo no listado; TTL 30 min; tope de sesiones por IP y de ejecuciones.
* **Bloqueo por fuerza bruta:** verificado (`locks an account after repeated failures, even for the right password`).
* **Validación de entradas:** límites de cuerpo por ruta, *rate limiting* por IP y por ruta, validación estricta de esquemas.
* **Egreso:** política de egreso autorizada para el LLM, desactivada por defecto; lista blanca de destinatarios NEAR que rechaza cuentas mainnet.
* **Fugas de información:** las pruebas afirman que ni los valores del vault ni cadenas señuelo aparecen en ninguna respuesta; los mensajes de denegación de CERBERUS son genéricos.
* **Recuperación:** reconciliación de misiones `RUNNING` al reiniciar sin pérdida de datos; recuperación de CHRONOS basada en *lease* que no roba ejecuciones vivas.

---

## F. CONCURSO — MATRIZ DE CUMPLIMIENTO

**Fuentes releídas hoy (2026-11-10), ambas HTTP 200:** `https://nearhackathon.com/` y `https://nearhackathon.com/HACKATHON.md`.
**Fecha límite confirmada: `2026-11-14T23:59:00Z`. Quedan 4 días.** Juicio 16–18 nov; resultados antes del 18 nov.

| # | Requisito oficial | Estado | Evidencia / bloqueo exacto |
|---|---|---|---|
| 1 | **Repositorio público** durante el juicio | ✅ | API de GitHub sin autenticar: `visibility: public`, `private: false` |
| 2 | **La rama que abren los jueces contiene el trabajo** | ⛔ **BLOQUEANTE** | `default_branch: main` = `701113b`, **82 commits por detrás**. No hay regla oficial de rama, pero los jueces abren la URL del repositorio y aterrizan en `main`. 👤 **Acción de la dueña** |
| 3 | **`LICENSE`** (Q-014: *"Any. MIT is fine… add a LICENSE file"*) | ⚠️ | Existe **localmente** (`LICENSE`, MIT, Copyright 2026 Diana Lopez, commit `e53f624`). GitHub devuelve `license: null` porque **no está publicado**. 👤 **Requiere su confirmación explícita** (ver §G) |
| 4 | **Código funcional** | ✅ | §D: 461 + 22 + 22 + 25 + 18 comprobaciones en verde hoy |
| 5 | **Integración NEAR construida en la ventana y explicada** | ✅ | Contrato Rust propio desplegado, transacción real verificada hoy (§C), tubería de firma completa. Primer commit 2026-10-24 > anuncio 2026-10-19 |
| 6 | **Testnet elegible** (Q-010: *"Testnet-only projects eligible? Yes, all tracks"*) | ✅ | Todo en testnet |
| 7 | **README reproducible** (Q-017: cribado por Claude Code/Codex) | ✅ | `npm ci && npm run build` + 2 scripts; 0 enlaces rotos verificados hoy |
| 8 | **Declarar librerías / código de IA en el README** (Q-005) | ✅ | Sección «Hackathon disclosures»: Claude Code declarado, librerías listadas. *(No existe un requisito explícito de declaración de IA; este requisito se cumple de sobra.)* |
| 9 | **Evidencia técnica** | ✅ | `docs/JUDGES.md`, `contract-attestation.json`, `evidence-*.json`, verificador independiente |
| 10 | **Afirmaciones veraces** | ✅ **con 5 correcciones pendientes** | Las tablas «real / simulado / pendiente» son ejemplarmente honestas, pero **5 afirmaciones están desactualizadas** (§G, Grupo A). Dos de ellas *subestiman* el proyecto |
| 11 | **Video demostrativo** adjunto a la publicación en X | ⛔ **BLOQUEANTE** | Guion listo en `docs/guion-video-3min.md`. **No existe el video.** Sin límite de duración oficial. 👤 |
| 12 | **Publicación en X** con `@NEARProtocol` y `#NEARHackathon` + video/capturas | ⛔ **BLOQUEANTE** | No existe. Opcionales: `@NearLegion`, `@NearBuilders`. 👤 |
| 13 | **Descripción del proyecto** (20–2000 caracteres) | ⚠️ | Borrador en `docs/entrega-oficial-borradores.md`. 👤 Revisar y fijar |
| 14 | **Dirección de billetera para premios** | ⛔ **BLOQUEANTE** | **Debe ser de MAINNET** (cuenta nombrada tipo `algo.near` o implícita de 64 caracteres). **Una cuenta testnet no cobra.** No consta ninguna decidida. 👤 |
| 15 | **Formulario oficial** `https://nearhackathon.com/#apply` | ⛔ **BLOQUEANTE** | No enviado. **Una sola entrega por proyecto y por repositorio**; los cambios posteriores van por `/request-changes`, no por reenvío. 👤 |
| 16 | **Fecha límite** | ⚠️ | `2026-11-14T23:59:00Z` — **4 días** |
| 17 | Demo alojada (Q-012: *"Hosted demo is a plus; keep it up to 2026-11-18, ideally 2026-11-25"*) | ✅ **mejor de lo documentado** | **Está en línea y es segura** (§D.3). Mantenerla hasta el 2026-11-25 |
| 18 | Derechos promocionales sobre video/capturas | ℹ️ | 👤 Verificar que no contengan claves ni datos personales |

### F.1 Tracks — recomendación fundamentada

Texto oficial, literal:

* **AI Security & Defense** (`security`): *«Build spending limits, policy engines, sandboxed wallets, reputation and scam detection. Give AI money without giving it the keys to everything.»*
* **AI Swarms** (`swarms`): *«Build coordination markets, bidding, collective purchasing, intent-based settlement and emergent economies between agents.»*

| Track | Correspondencia | Justificación |
|---|---|---|
| **AI Security & Defense** | **MUY ALTA — es el track del proyecto** | Correspondencia punto por punto: *policy engine* = CERBERUS con deny-by-default y orden total de reglas; *spending limits* = *allowance* acotado de 0,2498 NEAR y tope de importe; *sandboxed wallet* = llave FunctionCall limitada a **un método de un contrato**, con FullAccess rechazada. La frase *«give AI money without giving it the keys to everything»* **es literalmente la tesis del README**. Todo ello es demostrable y está verificado on-chain. |
| **AI Swarms** | **BAJA — recomiendo NO marcarlo** | El track pide mercados de coordinación, pujas, compra colectiva, liquidación basada en *intents* y economías emergentes entre agentes. HADES tiene **orquestación jerárquica** (HADES despacha a agentes especializados), que no es lo mismo: **no hay mercado, ni pujas, ni liquidación entre agentes**. Además `docs/NEAR_INTENT_GATE.md` y el README declaran NEAR Intents como **no usado**. Marcarlo invita a un juez a concluir que el proyecto se sobre-declara, justo en la dimensión — la honestidad — en la que hoy es más fuerte. |

> **Recomendación: marcar únicamente AI Security & Defense.** Esto **contradice** la recomendación actual de `docs/matriz-cumplimiento-hackathon.md`, que sugiere ambos. *(Varios tracks pueden marcarse en una misma entrega, de modo que la elección es libre; esta recomendación es de estrategia, no de reglamento.)* No se hace ninguna afirmación sobre probabilidades de ganar.

---

## G. FALTANTES PRIORIZADOS Y PLAN DE CIERRE

### GRUPO A — Correcciones internas seguras (aplicadas en `audit/final-near-hackathon-2026`)

Todas son **correcciones de exactitud documental**: ponen los documentos de acuerdo con hechos verificados hoy. **Ninguna cambia el comportamiento del producto.** Ninguna inventa un resultado.

| # | Corrección | Por qué |
|---|---|---|
| A-1 | `docs/contract-attestation.json`: `getCount: 0` → `1`; `auditRecords: 0` → `1`; eliminar la nota *«Nothing has been deployed»* | **El defecto documental más grave.** El archivo se contradice a sí mismo: su bloque `deployment` describe un despliegue con su transacción, y a la vez afirma que no se desplegó nada y que hay 0 registros. On-chain: desplegado y `get_count` = **1**. Un juez que lea este archivo concluye que no ocurrió nada. |
| A-2 | `docs/matriz-cumplimiento-hackathon.md`: fila 3 (LICENSE «ausente» → existe), fila 8 (verificación on-chain «INCONCLUSIVE» → 18/18 PASS hoy), fecha de relectura de las fuentes oficiales, y la recomendación de tracks | Subestiman el estado real y desaconsejan correctamente sólo tras el análisis de §F.1 |
| A-3 | `docs/JUDGES.md`: reparar dos literales de PowerShell filtrados (`` `n `` en la línea 92 y `` `node `` convertido en «ode» cerca de la 106) | Corrupción tipográfica que deja un comando inejecutable en la guía de los jueces |
| A-4 | README y `docs/JUDGES.md`: el despliegue público **está en línea**, con la salvedad de `/verify/` | Hoy **subestiman** el proyecto: declaran «Pending / no alcanzable» algo que funciona y es seguro |
| A-5 | `docs/JUDGES.md` §6: cifras de pruebas re-verificadas hoy (461 unitarias; 22+2 Playwright; 22 E2E; 25 demo; 18 on-chain) y marcar explícitamente Rust/sandbox/WASM como no re-ejecutados hoy, con su causa | Exactitud y trazabilidad |
| A-6 | `vercel.json`: excluir `/verify/` de la reescritura comodín de la SPA | Hace verdadera una afirmación hoy falsa de `JUDGES.md` §2. **Sólo surte efecto al redesplegar** (Grupo C) |

### GRUPO B — Requieren su autorización

| # | Acción | Riesgo / decisión |
|---|---|---|
| B-1 | **Confirmar la licencia MIT.** Se añadió en el commit `e53f624` de una sesión anterior, con «Copyright (c) 2026 Diana Lopez». Su regla nº 10 dice que no se añada licencia sin su decisión. **No está publicada, así que aún es reversible.** El concurso la **exige** (Q-014). | Define derechos sobre su obra. **Necesito su confirmación explícita antes de que se publique.** |
| B-2 | Integrar el trabajo a `main`. Técnicamente es un **fast-forward limpio**: `origin/main` es ancestro directo de `265357c`, **0 commits divergentes, 0 conflictos**. | Cambia lo que ven los jueces. Decisión suya: PR o avance directo. |
| B-3 | Actualizar dependencias de desarrollo (`@playwright/test`, `typescript-eslint`) para eliminar 2 altas + 7 moderadas | Modifica `package-lock.json` y obliga a re-ejecutar toda la batería. A 4 días del cierre, es un juicio suyo. |

### GRUPO C — Acciones externas (sólo usted puede hacerlas)

| # | Acción | Nota |
|---|---|---|
| C-1 | `git push` del trabajo a GitHub y dejar `main` como rama juzgada | **Es el único bloqueante técnico.** |
| C-2 | Redesplegar la demo (recoge A-6 y el resto del trabajo) | Vercel + Render ya configurados y en línea |
| C-3 | Grabar y publicar el **video** | Guion en `docs/guion-video-3min.md` |
| C-4 | **Publicación en X** con `@NEARProtocol` + `#NEARHackathon` + video | Requisito explícito |
| C-5 | Decidir la **cuenta NEAR de MAINNET** para el premio | Una testnet **no cobra** |
| C-6 | Enviar el **formulario** en `https://nearhackathon.com/#apply` | Una sola vez por proyecto; cambios por `/request-changes` |
| C-7 | *(Opcional, alto impacto)* Registrar on-chain el hash de evidencia de **una misión empresarial real** | Cerraría la brecha «misión → prueba on-chain» (§C.4). **Consume gas: requiere su autorización expresa.** |

### Priorización

**1. Bloqueantes de entrega:** C-1 (publicar), B-1 (licencia), C-3, C-4, C-5, C-6.
**2. Riesgos de seguridad:** E-01 (se resuelve con C-1); E-02 (opcional, B-3).
**3. Fallos funcionales:** A-6 + C-2 (la página `/verify/` del sitio desplegado).
**4. Mejoras opcionales:** C-7, E-04, E-05 (declarar, no corregir).

### Conjunto mínimo para entregar antes del 14 de noviembre

| Orden | Tarea | Quién | Tiempo |
|---|---|---|---|
| 1 | Confirmar la licencia MIT (B-1) | Usted | 1 min |
| 2 | Revisar los arreglos del Grupo A y autorizar su integración | Usted | 10 min |
| 3 | `push` del trabajo; `main` queda como rama juzgada (C-1) | Usted (yo puedo preparar el PR) | 10 min |
| 4 | Redesplegar la demo y comprobar `/verify/index.html` (C-2) | Usted | 10 min |
| 5 | Grabar el video de 3 minutos con el guion (C-3) | Usted | 45 min |
| 6 | Publicar en X con video, `@NEARProtocol`, `#NEARHackathon` (C-4) | Usted | 5 min |
| 7 | Decidir la cuenta mainnet del premio (C-5) | Usted | 5 min |
| 8 | Enviar el formulario, **sólo track AI Security & Defense** (C-6) | Usted | 15 min |

**Total ≈ 1 h 40 min de trabajo suyo. No queda trabajo de ingeniería pendiente para ser entregable.**

---

## H. RESULTADO FINAL

> # LISTO CON ACCIONES EXTERNAS PENDIENTES

**Lo que sostiene este diagnóstico:**

* El producto funciona y está probado: **461 pruebas unitarias, 22 E2E de navegador, 22 comprobaciones del flujo completo sobre HTTP real y 25 de seguridad de la demo pública**, todas ejecutadas hoy, todas en verde, cero fallos.
* La afirmación on-chain **es verdadera y la verificó esta auditoría de forma independiente**, por JSON-RPC crudo contra dos nodos archival, sin usar código del proyecto: transacción FINAL y exitosa, firmada con la llave restringida, `get_count` = 1, hash del contenido coincidente, y el WASM desplegado **idéntico byte a byte** a la atestación del repositorio.
* La arquitectura de seguridad es sólida y, en varios puntos, mejor que lo que el propio proyecto declara: deny-by-default con orden total, aprobación humana de un solo uso ligada al hash de los parámetros, privilegio mínimo verificado on-chain, firma única con bytes persistidos, reconciliación sólo desde el estado de la cadena y parada de emergencia persistente.
* El historial de git está **limpio de secretos** a lo largo de las 171 revisiones.
* La demo pública **está en línea y es segura**, lo que el proyecto hoy ni siquiera reclama.
* **Nada bloquea la entrega salvo publicar lo que ya está hecho** y las cinco acciones externas que sólo la dueña puede ejecutar.

**Sobre porcentajes:** no se emite ninguno. Los 18 requisitos de §F no son ponderables entre sí de forma no arbitraria — «repositorio público» y «video grabado» no son comparables —, de modo que un número único ocultaría justamente lo que importa: **cinco requisitos están en ⛔ y todos son acciones externas, no defectos del producto.**

**Nota de método:** la primera ejecución de Playwright de esta auditoría falló (`API did not start`). Se investigó hasta la causa raíz: **contención de recursos** por trabajos en segundo plano que la propia auditoría estaba ejecutando en paralelo. Reproducido el mecanismo de arranque de forma aislada, el token se captura de inmediato; re-ejecutada la batería en solitario, **22 aprobadas, 0 fallidas**. No es un defecto del producto y se documenta aquí por transparencia.

---

### Anexo — Reproducción de esta auditoría

```sh
npm ci && npm run build
npm run type-check && npx turbo lint --force && npm test
npx playwright test
node scripts/e2e-audit-flow.cjs
node scripts/check-public-demo-safety.cjs
node scripts/verify-attestation-onchain.cjs
node scripts/verify-audit-chain.cjs --db data/hades.json.sqlite --json
node scripts/check-doc-links.cjs
npm audit
```

Verificación on-chain cruda, sin código del proyecto (testnet, solo lectura):

```sh
curl -s -X POST https://archival-rpc.testnet.near.org \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tx","params":{"tx_hash":"BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3","sender_account_id":"hades-omega.testnet","wait_until":"FINAL"}}'
```

**No ejecutado por falta de herramientas en esta máquina:** `cargo test` (sin Rust) y `scripts/verify-contract-wasm.ps1` (daemon de Docker detenido).
