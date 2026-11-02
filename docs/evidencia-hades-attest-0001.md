# Reporte de evidencia — primer registro de auditoría de HADES OMEGA en NEAR Testnet

**Registro:** `hades-attest-0001` · **Red:** NEAR Testnet · **Verificado:** 2026-11-02 23:32 UTC (RPC de solo lectura, independiente de HADES)

Este documento no contiene claves privadas, frases semilla ni contraseñas. Las claves públicas y los hashes que aparecen son públicos en la cadena.

## 1. Resumen

HADES (orquestador multiagente con puerta de seguridad CERBERUS) registró en un contrato NEAR el hash SHA-256 de su propia atestación de contrato
(`hades-audit-registry` v0.4.0 + el SHA-256 exacto del WASM desplegado). La operación pasó por CERBERUS, exigió una **aprobación humana de un solo uso ligada
al hash exacto de la operación**, se firmó con una **llave restringida** (solo `store_audit_hash` en un único contrato, 0.25 NEAR de gas) y quedó confirmada en la cadena.

| | |
|---|---|
| **Transacción** | `BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3` |
| **Explorador** | https://explorer.testnet.near.org/transactions/BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3 |
| **Estado** | FINAL, `SuccessValue`, 0 fallos en 3 recibos |
| **Contenido** | 1 acción `FunctionCall store_audit_hash`, 30 TGas, depósito 0 NEAR |
| **Firmante → contrato** | `hades-omega.testnet` → `audit.hades-omega.testnet` |
| **Llave usada** | `ed25519:Gm4bBKzHhAsHhQGUfSPpphL1QxTCA8uxbaJmPYvVtw7n` (FunctionCall restringida; no la FullAccess) |
| **Bloque del registro** | 275967539 |
| **Costo** | 0.000195 NEAR (2.175 TGas quemados) |

## 2. Verificaciones por RPC independiente (reproducibles)

Cualquiera puede repetirlas sin claves: `node scripts/verify-attestation-onchain.cjs` (18 comprobaciones; salida guardada en
`docs/evidence-hades-attest-0001.json`, resultado: **todas pasan**). Usa solo consultas JSON-RPC a un nodo público de testnet.

| Comprobación | Resultado |
|---|---|
| Hash de la transacción y enlace al explorador | arriba |
| Estado FINAL sin errores | `FINAL`, `SuccessValue`, ningún `Failure` en la transacción ni en sus recibos |
| Argumentos de la llamada | `audit_id` `hades-attest-0001`, `content_hash` `4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b`, `operation_type` `CONTRACT_ATTESTATION`, `agent_name` `HADES`, `decision` `PERMIT`, `timestamp_ms` `1793661717062` |
| `get_count` | **1** |
| `get_audit_entry("hades-attest-0001")` | `content_hash` **idéntico** al autorizado; `recorder` `hades-omega.testnet`; mismos tipo, agente, decisión y marca de tiempo |
| `get_owner` | `hades-omega.testnet` |
| Código del contrato | `code_hash` `CkaYdt6NcWYnwBPPFyPQ2xE1FRSE8nnxa6FC2bUdjyun`; el código descargado de la cadena (218,046 bytes) tiene SHA-256 `ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685`, igual al de `docs/contract-attestation.json` |
| Un solo envío | el nonce de la llave restringida on-chain es el de esta transacción (`275964626000001`, el primero tras crearla) y `get_count` es 1: no hay duplicados |
| Llave restringida | permiso `FunctionCall`, receptor `audit.hades-omega.testnet`, método único `store_audit_hash`; allowance restante **0.2498048 NEAR** (de 0.25: se consumió solo el gas de una transacción) |
| Saldos | `hades-omega.testnet` 6.99265 NEAR · `audit.hades-omega.testnet` 2.99824 NEAR (testnet, sin valor económico) |

Cadena de transacciones de la puesta en marcha (todas verificables en el explorador, ruta `/transactions/<hash>`):

| Paso | Transacción |
|---|---|
| Creación de `hades-omega.testnet` (faucet) | `Gax7rfX9iihxMVPWqRMrwuc7ZDiLqz2LbZcBx9oy8fso` |
| Creación de `audit.hades-omega.testnet` (3 NEAR) | `DdXYgiCoJZD6tfBNcjRNfhX1RmG4W74xB9Q4Dks7wsbJ` |
| Despliegue + `new` atómico | `QSf1bwTWzvvRCQ6W4HQ5fVmYYQN3BAyXudqqs6WsPqj` |
| Llave FunctionCall restringida | `GBWu3Lu5MeXmGkjYgWnDn9vvvNpdakD6Vm2vuP1SA3o9` |
| **Registro `hades-attest-0001`** | `BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3` |

## 3. Controles de CERBERUS (evidencia de la base de datos local de la demostración)

Estas comprobaciones salen de la base de datos local desechable donde corrió HADES; **no son verificables por un tercero** (lo que sí lo es está en la sección 2).

* **Una sola aprobación válida, consumida una vez:** 1 fila en `cerberus_approvals` (`09baa5d5…`), estado `APPROVED`, `consumed_at` informado; 2 decisiones sobre `near.audit_hash_submit`:
  `ESCALATE / APPROVAL_REQUIRED` («human approval required before execution») y, tras la aprobación, `PERMIT / OK` («approved by a human and consumed»).
* **Aprobación ligada al hash exacto:** intención `3c647b01-ea67-42b1-91f6-a2ad3a9da3fb`, hash de aprobación `b8b542be41e406ddb4d141c5225039ddbe77996aa567e7aabb8087d731df5183`
  (recalculado de forma independiente antes de aprobar y antes de firmar); parámetros idénticos a los autorizados, sin campos adicionales.
* **Un solo envío:** `near_submissions` tiene 1 fila (`broadcast_count` 1, `on_chain_verified` 1, sin errores). Ciclo de la intención:
  `DRAFT → PENDING_APPROVAL → APPROVED → SIGNING → BROADCAST_PENDING → BROADCASTED → CONFIRMED`. Eventos de auditoría: `NEAR_SIGNED` ×1, `NEAR_BROADCAST` ×1, `NEAR_CONFIRMED` ×1.
* **Destinatario permitido:** `cerberus_recipients` contiene únicamente `audit.hades-omega.testnet` para `near.audit_hash_submit`.
* **Parada de emergencia:** desactivada en la comprobación previa al envío (estado real leído de CERBERUS); su efecto (bloquea solicitudes nuevas y la firma de operaciones ya aprobadas) está cubierto por pruebas automáticas.
* **Cadena de auditoría local:** hash encadenado verificado (13 eventos, sin ruptura).
* **Línea de tiempo local (UTC):** intención creada y aprobada 23:21:57 · aprobación consumida y envío 23:26:52 · aprobación vigente 306 s antes de expirar. El reloj local iba ~23 s adelantado respecto de la cadena
  (por eso `timestamp_ms` y el bloque 23:26:32 difieren de las horas locales); no afecta a la validez.

## 4. Cierre y ausencia de credenciales

* `NEAR_SIGNING_ENABLED` solo existió en el proceso local del envío; no está definida en el proceso, el usuario ni la máquina. El API local está detenido (puerto sin escucha, 0 procesos). No hubo otra transacción.
* **Credenciales:** se buscó el valor exacto de la llave privada, de la frase semilla y de la contraseña del administrador local en: todo el historial de Git (todos los refs, 0 commits),
  1,953 archivos del árbol de trabajo (0), la base de datos local y su WAL (0) y los archivos temporales de la sesión (0). Gitleaks sobre 135 commits: **0 hallazgos**. La salida del servidor no contenía material secreto.
  El repositorio solo contiene claves **públicas** y hashes.
* La llave restringida y su frase semilla existen **solo** en `%USERPROFILE%\.near-credentials` (ACL: únicamente el usuario) y la clave FullAccess solo en el llavero de Windows.

## 5. Lo que este reporte NO demuestra

* Es **testnet**: no hay valor económico ni garantías de mainnet.
* Prueba que HADES registró y verificó un hash on-chain con controles de seguridad; **no** prueba por sí solo una misión empresarial completa enlazada a un registro ni una demostración pública (ver el plan de cierre).
* La sección 3 depende de la base de datos local; un tercero solo puede reproducir la sección 2.
* La copia adicional del archivo de la llave restringida sigue en disco (riesgo acotado, documentado en `docs/near-primera-operacion-propuesta.md` A.3).
