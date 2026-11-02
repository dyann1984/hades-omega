# NEAR testnet — preparación y primera operación (para autorización)

Estado verificado el 2026-11-02. **Nada de esto se ha ejecutado**: no hay cuenta, ni contrato desplegado, ni transacción.
Consulta RPC de solo lectura: `hades-omega.testnet` y `audit.hades-omega.testnet` → `UNKNOWN_ACCOUNT` (libres, pero cualquiera
puede registrarlas antes: elige un nombre propio, p. ej. `hades-<tuusuario>.testnet`).

## 1. El artefacto que se desplegaría

| Dato | Valor |
|---|---|
| Archivo | `hades_audit_registry.wasm` (217,149 bytes) |
| SHA-256 | `5b1429bb68198957a3fcc87d5e52c5484cb33a654b45f4fa2e69f78a11d0356a` |
| Código fuente | commit `6ce6921…`; blobs `lib.rs e0cdb97…`, `Cargo.toml 6dfdab7…`, `Cargo.lock a32aac1…` |
| Reproducible | compilado dos veces desde `git archive` en contenedores distintos: mismo hash; coincide con el primer build |
| Pruebas | `cargo test --locked`: 12 pasan |
| Importaciones del WASM | solo almacenamiento, log, `predecessor_account_id`, `attached_deposit`, bloque. **Ninguna** `promise_*`, transferencia, despliegue, claves ni llamadas a otros contratos |

Detalle en `docs/contract-attestation.json`. Para reproducirlo tú: `powershell -File scripts\verify-contract-wasm.ps1`
(Docker temporal; imprime `MATCH` si el hash coincide). **Despliega ese artefacto exacto.** No uses `cargo near build` salvo que
regeneremos la atestación para su binario (el hash sería distinto).

### Revisión de permisos y métodos públicos

| Método | Quién | Notas |
|---|---|---|
| `new(owner_id)` | cualquiera, **una sola vez** | falla si ya hay estado. Riesgo: si se despliega sin inicializar, otro podría fijar su propio dueño → **desplegar e inicializar en la misma transacción** (`with-init-call`, ya en el comando) |
| `store_audit_hash(...)` | solo `owner` | no acepta depósito; valida id (`[A-Za-z0-9-]`≤64), hash (64 hex minúsculas), tipo (`[A-Z_]`), agente, decisión (PERMIT/DENY/ESCALATE); reintento idéntico = no-op; mismo id con otro contenido = error |
| `get_audit_entry`, `get_count`, `get_owner` | cualquiera (vista) | sin efectos |

Sin función de cambio de dueño, borrado ni retiro: los registros son inmutables. Quien tenga una llave **full-access** de la
cuenta del contrato podría redesplegarlo, por eso esa llave no debe ir al servidor (ver §4).

## 2. Costos y requisitos (precios leídos de testnet hoy)

* Precio de gas: 100,000,000 yocto/gas → una llamada de 30 Tgas cuesta **como máximo 0.003 NEAR** (el gas no usado se reembolsa); despliegue+init 100 Tgas: máx. 0.01 NEAR.
* Almacenamiento: 10¹⁹ yocto/byte → el WASM bloquea **2.17149 NEAR** en la cuenta del contrato (reservado, no gastado).
* Cada registro ocupa unos cientos de bytes: orden de **0.003 NEAR** de almacenamiento reservado + gas < 0.003 NEAR.
* Total para empezar: cuenta firmante con unos 10 NEAR de faucet; sub-cuenta del contrato fondeada con **3 NEAR** (cubre 2.17 + margen).
  Son tokens de testnet sin valor. Depósito de la operación: **0**.

## 3. Procedimiento seguro (lo ejecutas tú; yo no firmo ni transmito)

1. Crea la cuenta firmante exclusiva en testnet y guarda su frase/llave fuera del repo (runbook §1). No reutilices llaves de mainnet.
2. Compila/verifica el WASM con el script de arriba; comprueba `MATCH`.
3. Crea la sub-cuenta `audit.<firmante>` con 3 NEAR y despliega **con init atómico** (runbook §3), `owner_id` = tu cuenta firmante.
4. Comprueba en solo lectura: `get_owner` devuelve tu cuenta; Vault → «Sondear red» (pasa por CERBERUS, `near.probe`) muestra «contrato desplegado: sí».
5. Crea una llave **function-call** limitada a `store_audit_hash` sobre el contrato (allowance 0.25 NEAR) y exporta solo esa al servidor (runbook §4). Nunca una full-access.
6. Configura el servidor (runbook §5), mantén `NEAR_SIGNING_ENABLED` sin definir hasta el último momento, y permite el contrato como destinatario (ADMIN).
7. Pídeme la autorización explícita; entonces se activa la firma y se ejecuta la operación de §4.

## 4. Primera operación exacta (depósito cero)

Atestigua en cadena el propio contrato desplegado. Registro canónico (JSON con claves ordenadas), cuyo SHA-256 es el `contentHash`:

```
{"auditId":"hades-attest-0001","contract":"hades-audit-registry@0.4.0","kind":"CONTRACT_WASM_ATTESTATION","sourceCommit":"6ce6921de17cf63dddc1c4837cad1fbd96256302","wasmSha256":"5b1429bb68198957a3fcc87d5e52c5484cb33a654b45f4fa2e69f78a11d0356a"}
SHA-256 = 2fb2ee51eef07c7085a11be1d60459ed31315c8a7ad529252e0eab382879d053
```

Intención para `POST /api/v1/near/intents` (solo prepara; los marcadores `<…>` se rellenan con tus cuentas reales):

```json
{ "network": "testnet", "signerId": "hades-<tuusuario>.testnet", "receiverId": "audit.hades-<tuusuario>.testnet",
  "type": "AUDIT_HASH", "amountYocto": "0", "auditId": "hades-attest-0001",
  "contentHash": "2fb2ee51eef07c7085a11be1d60459ed31315c8a7ad529252e0eab382879d053",
  "operationType": "CONTRACT_ATTESTATION", "agentName": "HADES", "decision": "PERMIT",
  "timestampMs": <milisegundos Unix al crearla>, "gas": "30000000000000" }
```

Equivale a una única acción `FunctionCall` → método `store_audit_hash`, gas 30 Tgas, depósito 0, destinatario el contrato.
La aprobación queda ligada al hash exacto de estos parámetros (10 min, un solo uso). Antes de firmar, el preflight comprueba
red, contrato desplegado, dueño, permisos de la llave, saldo y que el id no exista. Evidencia esperada: hash de transacción
real + `get_audit_entry("hades-attest-0001")` devolviendo ese `content_hash`. Solo entonces NEAR podrá darse por validado.

## 5. Funciones que siguen incompletas

* Ninguna transacción on-chain ni cuenta/contrato en testnet; sin demostración pública reproducible (sin despliegue web desde esta rama).
* Sin push ni despliegue; la rama `feat/hades-hackathon-hardening` está solo en local (12+ commits por delante de origin).
* Pruebas de contrato solo unitarias (sin simulación de red tipo workspaces).
* Los precios de IA son estimaciones configurables, no facturación.
* Sin detección de inyección de instrucciones en documentos (los flujos de documentos no usan IA).
