# Propuesta para autorización: llave limitada y registro `hades-attest-0001`

Preparado el 2026-11-02. **Estado:** el paso A (llave limitada) está **hecho y verificado**; el cargador de credenciales de HADES ya lo soporta (ver A.1-A.3).
Los pasos B, C y D **no se han ejecutado**: no hay intención creada, no se firmó ni transmitió ninguna operación de auditoría, `NEAR_SIGNING_ENABLED` sin definir.
Estado base verificado por RPC: contrato desplegado, `get_owner` = `hades-omega.testnet`, `get_count` = 0 (ver `docs/near-testnet-preparacion.md` §0).
Cada paso B-D requiere tu autorización **por separado**.

## A.0 Resultado del AddKey (ejecutado con autorización)

* Transacción `GBWu3Lu5MeXmGkjYgWnDn9vvvNpdakD6Vm2vuP1SA3o9` (FINAL, sin fallos), una sola acción `AddKey` firmada con la FullAccess existente (intacta).
  Explorador: https://explorer.testnet.near.org/transactions/GBWu3Lu5MeXmGkjYgWnDn9vvvNpdakD6Vm2vuP1SA3o9
* Llave `ed25519:Gm4bBKzHhAsHhQGUfSPpphL1QxTCA8uxbaJmPYvVtw7n`, verificada por RPC: `FunctionCall`, receptor `audit.hades-omega.testnet`, método único `store_audit_hash`, allowance 0.25 NEAR exactos.

## A.1 Cargador de credenciales (`loadSignerFromEnv`)

* near-cli-rs 0.30.1 escribe un JSON con los campos `seed_phrase_hd_path`, `master_seed_phrase`, `implicit_account_id`, `public_key` y `private_key`, **sin `account_id`**
  (inspección solo de nombres de campo; no se leyeron ni imprimieron valores). El cargador ahora lo acepta usando `NEAR_SIGNER_ACCOUNT_ID` como identidad explícita; el formato JS-CLI (con `account_id`) sigue funcionando.
* Se rechazan con códigos fijos (sin material secreto en mensajes, trazas ni serialización): dos fuentes a la vez (archivo + clave en variable), identidad ausente o distinta entre archivo y variable,
  `public_key` que no corresponde a la clave privada, campos desconocidos o duplicados (`secret_key`, `network_id`…), tipos erróneos, archivos > 8 KB, directorios, claves no ed25519, cuentas que no sean `.testnet` y rutas con un segmento `mainnet`.
  Los campos de la frase semilla nunca se leen ni se conservan.
* **Política on-chain de la llave** (`assertSignerKeyPolicy`, en la comprobación previa y de nuevo justo antes de firmar): se rechaza FullAccess (salvo `NEAR_ALLOW_FULL_ACCESS_KEY=true`, no usado), cualquier receptor distinto del contrato,
  cualquier lista de métodos distinta de exactamente `store_audit_hash` (una lista vacía en NEAR significa *todos* los métodos), allowance ilimitado o superior a 0.25 NEAR. El allowance baja al gastar gas, por eso se exige ≤ 0.25 y no igualdad.
* Pruebas (solo credenciales sintéticas generadas en cada ejecución): `signer-loader.test.ts` (6) y `submission.test.ts`. Mutaciones detectadas: quitar la comprobación de `public_key`, aceptar campos desconocidos, aceptar FullAccess, filtrar contenido en un error.

## A.2 Verificación con las credenciales reales (solo lectura, sin imprimir secretos)

Se cargaron ambos archivos con el cargador nuevo (`NEAR_SIGNER_ACCOUNT_ID=hades-omega.testnet`) y se consultó la llave por RPC: la clave pública cargada es `ed25519:Gm4bBKzH…tw7n`, **idéntica a la autorizada**; on-chain es FunctionCall,
receptor `audit.hades-omega.testnet`, método `store_audit_hash`, allowance `250000000000000000000000` yocto; la política de HADES la acepta. No se firmó nada.

## A.3 Archivos de credenciales, ACL y riesgo de la copia adicional

near-cli-rs con `save-to-legacy-keychain` escribió **dos copias** de la misma llave (y su frase semilla) en `%USERPROFILE%\.near-credentials\testnet\`:

| Archivo | ACL verificada |
|---|---|
| `hades-omega.testnet\ed25519_Gm4bBKzH….json` (en carpeta protegida) | solo `DESKTOP-8H9RI4S\DYANN` (control total), sin herencia |
| `hades-omega.testnet.json` (copia adicional, junto a la carpeta) | solo `DESKTOP-8H9RI4S\DYANN` (control total), sin herencia; restringida tras crearse (ventana mínima con permisos heredados) |

Riesgo: cada copia adicional es una superficie más de robo (malware con tu sesión, copias de seguridad, sincronización de carpetas). El daño máximo está acotado: la llave solo puede llamar a `store_audit_hash` en el contrato, con ≤ 0.25 NEAR de gas, sin transferir fondos;
la frase semilla solo reconstruye esa misma llave. Recomendación (requiere tu autorización, **no se ha borrado nada**): usar el archivo de la carpeta protegida como `NEAR_SIGNER_KEY_FILE` y, tras el primer registro, eliminar la copia `hades-omega.testnet.json`,
excluir `.near-credentials` de copias en la nube y revocar la llave (`delete-keys`) cuando termine el hackathon. Las ACL se comprobaron leyendo los permisos, no probando con otro usuario; existen otros usuarios locales (`CodexSandbox*`) sin ninguna entrada.

## A. Crear la llave FunctionCall limitada (transacción AddKey, firmada con la llave FullAccess de `hades-omega.testnet`)

Sintaxis comprobada con `--help` de near-cli-rs 0.30.1 (cadena completa hasta `sign-with-keychain … send`).

```powershell
$near = "$env:USERPROFILE\tools\near-cli-rs-0.30.1\near-cli-rs-x86_64-pc-windows-msvc\near.exe"
& $near account add-key hades-omega.testnet grant-function-call-access --allowance '0.25 NEAR' --contract-account-id audit.hades-omega.testnet --function-names 'store_audit_hash' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-keychain send
```

| Parámetro | Valor exacto |
|---|---|
| Cuenta que recibe la llave | `hades-omega.testnet` |
| Permiso | `FunctionCall`: solo receptor `audit.hades-omega.testnet`, solo método `store_audit_hash` |
| Allowance máximo | 0.25 NEAR (solo gas; cada registro cuesta ≤ 0.003 NEAR, alcanza para ≥ 83) |
| Depósito que puede adjuntar | ninguno: una llave FunctionCall no puede transferir NEAR |
| Firma de esta transacción | la llave FullAccess de `hades-omega.testnet` (llavero de Windows) |
| Costo | gas ≈ 0.0001 NEAR; el allowance no se transfiere ni se bloquea |

**Dónde queda la llave privada (decisión tuya).** El servidor de HADES solo puede firmar si lee la llave desde `NEAR_SIGNER_KEY_FILE`
(JSON con `account_id` y `private_key`) o desde `NEAR_SIGNER_PRIVATE_KEY`; no puede leer el Administrador de credenciales.

* **Opción 1, recomendada: `save-to-legacy-keychain`** (la del comando de arriba). Crea un archivo JSON en
  `%USERPROFILE%\.near-credentials\testnet\hades-omega.testnet\` fuera del repositorio. Es una llave **sin privilegios de fondos**
  (un método, un contrato, 0.25 NEAR de gas), por lo que el riesgo de dejarla en archivo es acotado. Después se restringe el acceso al archivo:
  `icacls "$env:USERPROFILE\.near-credentials\testnet\hades-omega.testnet" /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F"`.
* **Opción 2: `save-to-keychain`**. La llave queda en el llavero de Windows, pero el servidor no podrá usarla sin exportarla (`account export-account` la mostraría en pantalla), es decir, sin firma automática.

Comprobación posterior (sin imprimir valores): nombres de campos del archivo, `list-keys` y RPC `view_access_key` de la clave nueva con `permission.FunctionCall`
= `{receiver_id: audit.hades-omega.testnet, method_names: [store_audit_hash], allowance ≤ 0.25 NEAR}`. (Hecho, ver A.0-A.3: el archivo no trae `account_id`
y el cargador lo resuelve con `NEAR_SIGNER_ACCOUNT_ID`.)

## B. Configuración del servidor (local, nada de producción)

```
NEAR_EXECUTION_MODE=testnet
NEAR_AUDIT_CONTRACT_ID=audit.hades-omega.testnet
NEAR_SIGNER_ACCOUNT_ID=hades-omega.testnet
NEAR_SIGNER_KEY_FILE=C:\Users\DYANN\.near-credentials\testnet\hades-omega.testnet\ed25519_Gm4bBKzHhAsHhQGUfSPpphL1QxTCA8uxbaJmPYvVtw7n.json
# NEAR_SIGNING_ENABLED  → sigue SIN definir hasta el paso D
# NEAR_ALLOW_FULL_ACCESS_KEY → NO definir (FullAccess queda prohibida para el servidor)
```

Con `NEAR_SIGNING_ENABLED` sin definir el servicio es inerte (probado: `SIGNING_DISABLED`, nada se firma ni consume).

## C. La operación `hades-attest-0001` (intención + aprobación; sigue sin firmar)

Registro canónico atestado y su SHA-256 (`contentHash`):

```
{"auditId":"hades-attest-0001","contract":"hades-audit-registry@0.4.0","kind":"CONTRACT_WASM_ATTESTATION","sourceCommit":"e6b7ea6092483e437c03ac9c239626aca8622640","wasmSha256":"ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685"}
SHA-256 = 4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b
```

`POST /api/v1/near/intents` (parámetros canónicos exactos; `timestampMs` se fija al crearla y entra en el hash de la intención):

```json
{ "network": "testnet", "signerId": "hades-omega.testnet", "receiverId": "audit.hades-omega.testnet",
  "type": "AUDIT_HASH", "amountYocto": "0", "auditId": "hades-attest-0001",
  "contentHash": "4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b",
  "operationType": "CONTRACT_ATTESTATION", "agentName": "HADES", "decision": "PERMIT",
  "timestampMs": <ms Unix al crearla>, "gas": "30000000000000" }
```

Transacción que se construirá (una sola acción `FunctionCall`, generada por el constructor real `buildAuditTransaction`; ninguna otra acción es posible):

| Campo | Valor |
|---|---|
| Firmante / receptor | `hades-omega.testnet` → `audit.hades-omega.testnet` |
| Método | `store_audit_hash` |
| Gas | 30 TGas (30000000000000) |
| Depósito | 0 |
| Argumentos | `{"audit_id":"hades-attest-0001","content_hash":"4bb4f2d9…571b","operation_type":"CONTRACT_ATTESTATION","agent_name":"HADES","decision":"PERMIT","timestamp_ms":<ms>}` |

Contra la versión desplegada: `audit_id` y los demás campos cumplen las reglas del código fuente atestado (el binario on-chain tiene el mismo SHA-256 que esa atestación),
`get_audit_entry("hades-attest-0001")` hoy es `null` (no hay duplicado) y el propietario del contrato es el firmante. Antes de firmar, el servicio vuelve a comprobar
por RPC: red testnet, contrato con código, propietario = firmante, llave presente y permitida, saldo ≥ 0.05 NEAR, sin registro previo.
**Limitación**: ninguna prueba ejecuta la transacción real contra testnet sin enviarla; la aceptación por el contrato la demuestran las pruebas de sandbox con el WASM atestado y solo se confirma con la transacción real.

### Controles CERBERUS (probados con las cuentas reales, sin firmar: `first-operation.test.ts`, 5 pruebas; `submission.test.ts`)

| Control | Resultado verificado |
|---|---|
| Destinatario permitido | sin `audit.hades-omega.testnet` en la lista, la solicitud se deniega (`RECIPIENT_NOT_ALLOWED`); un ADMIN debe añadirlo |
| Aprobación humana de un solo uso | exige ESCALATE → aprobación ligada al hash exacto, ≤ 15 min, consumida al firmar; reutilizarla falla; un hash distinto se rechaza (`INTENT_CHANGED`) |
| Parada de emergencia | activada bloquea solicitudes nuevas y la firma de operaciones ya aprobadas (`EMERGENCY_STOP`); desactivada, la aprobación sigue intacta. Estado real se confirma en Vault antes de firmar |
| Llave limitada | `submission.test.ts` (2 pruebas nuevas): una llave FunctionCall limitada a `store_audit_hash` del contrato firma sin necesitar FullAccess; una limitada a otro método u otro contrato se rechaza y la aprobación no se consume |

## D. Firma y envío (la única transacción de auditoría)

Solo con tu autorización específica: definir `NEAR_SIGNING_ENABLED=true`, reiniciar el API local, aprobar la intención (ADMIN) y ejecutar el envío una vez.
Verificación posterior por RPC: estado FINAL sin fallos, `get_count` = 1, `get_audit_entry("hades-attest-0001")` con el `content_hash` anterior. Después, `NEAR_SIGNING_ENABLED` vuelve a quedar sin definir.

## Orden de autorizaciones solicitadas

1. **A**: crear la llave limitada (y elegir opción 1 o 2 de almacenamiento).
2. **B+C**: configuración local, permitir destinatario, crear la intención y aprobarla.
3. **D**: firmar y transmitir `hades-attest-0001`.
