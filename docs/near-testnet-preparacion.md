# NEAR testnet — preparación segura y primera operación (para autorización)

Estado verificado el 2026-11-02. **Nada de esto se ha ejecutado**: no hay cuenta, ni contrato desplegado, ni transacción.
Consulta RPC de solo lectura: `hades-omega.testnet` y `audit.hades-omega.testnet` → `UNKNOWN_ACCOUNT` (libres hoy, pero cualquiera
puede registrarlas antes: elige un nombre propio, p. ej. `hades-<tuusuario>.testnet`).

## 1. Artefacto (después de corregir la inicialización)

| Dato | Valor |
|---|---|
| Archivo | `hades_audit_registry.wasm`, 218,046 bytes |
| SHA-256 | `ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685` |
| Fuente | commit `e6b7ea6092483e437c03ac9c239626aca8622640` (`lib.rs` blob `d320b52…`) |
| Reproducible | compilado desde `git archive` del commit (no del árbol de trabajo), varias veces y vía script: mismo hash |
| Pruebas | 12 unitarias + **6 de integración en near-sandbox local** contra este WASM exacto: todas pasan |
| Importaciones | almacenamiento, log, `current_account_id`, `predecessor_account_id`, `attached_deposit`, bloque. Ninguna `promise_*`, transferencia, despliegue, claves ni llamadas a otros contratos |

Reproducirlo: `powershell -File scripts\verify-contract-wasm.ps1` (imprime `MATCH`) y
`powershell -File scripts\test-contract-sandbox.ps1` (pruebas, solo sandbox local; Docker temporal). Detalle: `docs/contract-attestation.json`.
**Despliega ese artefacto exacto**; `cargo near build` produce otro binario y exigiría una nueva atestación.

### Riesgo de inicialización — corregido

Antes, `new(owner_id)` podía llamarlo cualquiera: si el contrato se desplegaba sin inicializar, un tercero podía fijar su propio dueño
(front-running). Ahora `new` es `#[init] #[private]`: **solo la propia cuenta del contrato** (quien tiene su llave y firma el despliegue)
puede inicializarlo; `#[init]` rechaza una segunda inicialización. Demostrado en el sandbox:

| Escenario | Resultado verificado |
|---|---|
| Despliegue + `new` en una transacción (cuenta del contrato firma) | éxito; `get_owner` = tu cuenta |
| Tercero llama `new` sobre un contrato desplegado sin inicializar | **falla**; sigue sin inicializar |
| Contrato sin inicializar | no responde (`get_owner`/`get_count` fallan) ni acepta registros |
| Despliegue interrumpido (solo deploy) | seguro; la cuenta del contrato puede completar `new` después |
| `new` duplicado (cuenta del contrato o tercero) | **falla**; el dueño no cambia |
| Lote deploy+init con init inválido | **revierte todo**: no queda código desplegado |
| Depósito ≠ 0, o llamante no dueño | falla; no queda ningún registro |
| Mutación: quitar `#[private]` | la prueba de apropiación **falla** (la prueba es efectiva) |

(Con `panic = "abort"` los fallos on-chain no muestran el texto del panic; las pruebas verifican el fallo y que el estado no cambia.)

Otros métodos: `store_audit_hash` solo dueño, sin depósito, validación estricta, reintento idéntico idempotente, conflicto falla;
`get_audit_entry`, `get_count`, `get_owner` son vistas. No hay cambio de dueño, borrado ni retiro (registros inmutables).
Quien posea una llave **full-access** de la cuenta del contrato podría redesplegarlo: esa llave nunca va al servidor.

## 2. Procedimiento vigente para crear la cuenta de HADES (testnet)

Fuentes oficiales: [NEAR CLI](https://docs.near.org/tools/cli), [guía near-cli-rs](https://github.com/near/near-cli-rs/blob/main/docs/GUIDE.en.md),
[crear una cuenta](https://docs.near.org/getting-started/create-account). La sintaxis cambia entre versiones: confirma con `near <comando> --help`.

Reglas: solo testnet; **cuenta nueva y exclusiva**, sin reutilizar llaves ni frases de mainnet o personales; no pegues llaves ni frases
en el repo, chats, logs ni informes (la salida del comando puede mostrar una frase semilla: no la copies a ningún lado, guárdala en un gestor de contraseñas).

```powershell
# 0) Instalar near-cli-rs (una opción; instalación en tu equipo, la haces tú)
irm https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.ps1 | iex

# 1) Cuenta firmante exclusiva, fondeada por el faucet (testnet). Elige un nombre libre.
near account create-account sponsor-by-faucet-service hades-<tuusuario>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
near account view-account-summary hades-<tuusuario>.testnet network-config testnet now

# 2) Sub-cuenta del contrato, fondeada con 3 NEAR por la firmante (cubre ~2.18 de almacenamiento + gas)
near account create-account fund-myself audit.hades-<tuusuario>.testnet '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as hades-<tuusuario>.testnet network-config testnet sign-with-keychain send
```

## 3. Despliegue preparado (NO ejecutado)

Despliega **con la llave de la propia cuenta del contrato** (`sign-with-keychain` usa la de `audit.…`, que `#[private]` exige) e inicialización atómica:

```powershell
near contract deploy audit.hades-<tuusuario>.testnet use-file <ruta>\hades_audit_registry.wasm with-init-call new json-args '{"owner_id":"hades-<tuusuario>.testnet"}' prepaid-gas '100 TGas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract call-function as-read-only audit.hades-<tuusuario>.testnet get_owner json-args '{}' network-config testnet now   # debe imprimir tu cuenta firmante
```

| Parámetro | Valor |
|---|---|
| Cuenta firmante / dueña | `hades-<tuusuario>.testnet` |
| Cuenta del contrato | `audit.hades-<tuusuario>.testnet` (firma el despliegue con su propia llave) |
| Red | `testnet` (el servidor rechaza cualquier otra) |
| Hash del WASM | `ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685` — comprobar con `sha256` del archivo antes de desplegar |
| Gas máximo | despliegue+init: 100 TGas (≤ 0.01 NEAR, lo no usado se reembolsa); cada registro: 30 TGas (≤ 0.003 NEAR) |
| Depósito | 0 NEAR en init y en cada `store_audit_hash` |
| Costo estimado | almacenamiento reservado 2.18046 NEAR (218,046 B × 10¹⁹ yocto, precio leído de testnet) + gas < 0.01; testnet, sin valor |
| Inicialización | `new` atómico en el mismo lote que el despliegue; `#[private]` impide que un tercero la tome |
| Riesgos | nombre ya registrado por otro; llaves expuestas; desplegar un binario distinto al atestado; llave full-access del contrato filtrada; faucet agotado/limitado |
| Recuperación | ver §4 |

**Llave del servidor (mínimo privilegio)**: una llave *function-call* de la cuenta firmante, limitada al contrato y al método, con allowance:

```powershell
near account add-key hades-<tuusuario>.testnet grant-function-call-access --allowance '0.25 NEAR' --contract-account-id audit.hades-<tuusuario>.testnet --function-names 'store_audit_hash' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-keychain send
```

(Sintaxis tomada de la guía oficial; `save-to-legacy-keychain` y la exportación de la llave dependen de tu versión: revisa `--help`.) El servidor lee la llave
de `NEAR_SIGNER_KEY_FILE` (JSON `{account_id, private_key}`) o `NEAR_SIGNER_PRIVATE_KEY`, solo en su entorno. Nunca la full-access.

## 4. Recuperación

| Situación | Acción |
|---|---|
| Despliegue interrumpido antes de `new` | contrato inerte y seguro; la cuenta del contrato llama `new` (`call-function as-transaction … sign-as audit.…`) o se borra la cuenta y se recrea |
| Init con dueño equivocado | el dueño no se puede cambiar: borrar la sub-cuenta (`near account delete-account … beneficiary hades-<tuusuario>.testnet`) y repetir §2-3 |
| Llave del servidor comprometida o perdida | revocar con `delete-keys` desde la firmante y crear otra function-call; la allowance limita el daño a 0.25 NEAR de testnet |
| Hash del WASM no coincide | no desplegar; correr `verify-contract-wasm.ps1` y revisar commit/lockfile |
| Fallo de red al enviar | el sistema reenvía los **mismos bytes firmados** (idempotente); con la parada de emergencia activa no se envía nada |

## 5. Primera operación exacta (depósito cero) — pendiente de tu autorización

Atestigua en cadena el contrato desplegado. Registro canónico (claves ordenadas) y su SHA-256 = `contentHash`:

```
{"auditId":"hades-attest-0001","contract":"hades-audit-registry@0.4.0","kind":"CONTRACT_WASM_ATTESTATION","sourceCommit":"e6b7ea6092483e437c03ac9c239626aca8622640","wasmSha256":"ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685"}
SHA-256 = 4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b
```

`POST /api/v1/near/intents` (solo prepara; completa tus cuentas reales y `timestampMs` = ms Unix al crearla):

```json
{ "network": "testnet", "signerId": "hades-<tuusuario>.testnet", "receiverId": "audit.hades-<tuusuario>.testnet",
  "type": "AUDIT_HASH", "amountYocto": "0", "auditId": "hades-attest-0001",
  "contentHash": "4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b",
  "operationType": "CONTRACT_ATTESTATION", "agentName": "HADES", "decision": "PERMIT",
  "timestampMs": <ms>, "gas": "30000000000000" }
```

Una sola acción `FunctionCall` → `store_audit_hash`, 30 TGas, depósito 0, destinatario el contrato. **Ensayo con cuentas de ejemplo**
(`packages/api/src/near/first-operation.test.ts`, sin firmar ni red) comprueba: el hash documentado, que parámetros con depósito ≠ 0 / otro gas /
mainnet / campos extra se rechazan, que sin el contrato en la lista de destinatarios CERBERUS deniega, que con ella exige una aprobación humana ligada al hash
exacto (15 min máx., un solo uso), que no se puede firmar antes de aprobar, y que la **parada de emergencia** bloquea tanto una solicitud nueva como la firma de una
operación ya aprobada (la aprobación sobrevive sin gastarse). Evidencia esperada tras la autorización: hash de transacción real +
`get_audit_entry("hades-attest-0001")` devolviendo ese `content_hash`.

## 6. Pasos pendientes antes del primer despliegue (en orden)

1. Tú: instalar near-cli-rs y crear la cuenta firmante y la sub-cuenta (§2). Decirme los **nombres** de cuenta (nunca claves).
2. Verificar el hash del WASM en tu equipo (`verify-contract-wasm.ps1` → `MATCH`; `Get-FileHash` del archivo a desplegar).
3. Autorizarme el despliegue **como operación concreta** (cuenta, WASM, init atómico, 100 TGas, depósito 0). Hasta entonces no se despliega.
4. Crear la llave function-call del servidor y configurar el entorno (`NEAR_EXECUTION_MODE=testnet`, cuenta, llave, contrato; `NEAR_SIGNING_ENABLED` aún sin definir).
5. ADMIN: permitir el contrato como destinatario en CERBERUS; Vault → «Sondear red» debe mostrar contrato desplegado y propietario = firmante.
6. Autorizarme **la primera transacción** (§5); solo entonces se define `NEAR_SIGNING_ENABLED=true`, se aprueba (10 min) y se firma.
7. Verificar en el explorador y con `get_audit_entry`; solo entonces NEAR puede darse por validado.

## 7. Aún incompleto

* Sin cuenta, contrato ni transacción en testnet; sin demostración pública reproducible.
* Los costos son estimaciones con el precio de gas/almacenamiento leído hoy; los comandos de near-cli-rs deben confirmarse con tu versión (`--help`).
* Las pruebas de sandbox son locales (no prueban testnet real).
