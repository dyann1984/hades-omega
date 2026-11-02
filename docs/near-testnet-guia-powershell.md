# Guía paso a paso (Windows PowerShell): cuenta NEAR Testnet exclusiva de HADES

Sintaxis comprobada con `near-cli-rs 0.30.1` (instalador oficial, `--help` de cada subcomando, ejecutado en un contenedor desechable el 2026-11-02;
**no está instalado en tu equipo**). Si tu versión difiere, `--help` manda. Cambia `<usuario>` por un nombre propio libre.

**Reglas**: solo testnet; cuenta nueva y exclusiva; nunca pegues llaves, frases semilla ni el contenido de archivos de credenciales en el chat, el repositorio ni informes.
Los comandos de abajo **no imprimen** la llave (usan el llavero del sistema). **Nada de esto lo ejecuta Claude.**

## Paso 1 — Instalar near-cli-rs (acción tuya, requiere tu permiso)

```powershell
irm https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.ps1 | iex
```
Esperado: se descarga e instala `near.exe`. Abre una **PowerShell nueva**.

## Paso 2 — Confirmar versión y sintaxis

```powershell
near --version
```
Esperado: `near-cli-rs 0.30.x`. Luego comprueba que existen los subcomandos usados aquí:
`near account create-account --help` (debe listar `sponsor-by-faucet-service` y `fund-myself`).

## Paso 3 — Comprobar que el nombre está libre (solo lectura)

```powershell
near account view-account-summary hades-<usuario>.testnet network-config testnet now
```
Esperado: error de cuenta inexistente (`UNKNOWN_ACCOUNT`/«does not exist»). Si muestra datos, el nombre está ocupado: elige otro.

## Paso 4 — Crear la cuenta firmante (faucet, sin costo)

```powershell
near account create-account sponsor-by-faucet-service hades-<usuario>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
```
Esperado: mensaje de cuenta creada. La llave queda en el **Administrador de credenciales de Windows**. Si la herramienta mostrara una frase semilla,
guárdala solo en un gestor de contraseñas; no la copies a ningún otro lado. Verifica: repite el Paso 3 (ahora debe mostrar saldo y 1 llave).

## Paso 5 — Crear la sub-cuenta del contrato, fondeada desde la firmante

```powershell
near account create-account fund-myself audit.hades-<usuario>.testnet '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as hades-<usuario>.testnet network-config testnet sign-with-keychain send
```
Esperado: la transacción se confirma y `audit.hades-<usuario>.testnet` existe con ~3 NEAR (el almacenamiento del contrato reserva ≈2.18 NEAR).
Verifica con `near account view-account-summary audit.hades-<usuario>.testnet network-config testnet now`.
Esto **gasta testnet NEAR** de la firmante: es una operación sobre testnet que haces tú.

## Paso 6 — Verificar el WASM (antes de desplegar)

```powershell
powershell -File scripts\verify-contract-wasm.ps1 -KeepWasmTo "$PWD\artifacts\contract\hades_audit_registry.wasm"
(Get-FileHash artifacts\contract\hades_audit_registry.wasm -Algorithm SHA256).Hash.ToLower()
```
Esperado: `MATCH` y exactamente `ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685` (218,046 bytes). Si difiere, **no despliegues**.

## Paso 7 — Despliegue con inicialización atómica (**NO ejecutar sin autorización explícita a Claude/HADES; lo ejecutas tú**)

```powershell
near contract deploy audit.hades-<usuario>.testnet use-file artifacts\contract\hades_audit_registry.wasm with-init-call new json-args '{"owner_id":"hades-<usuario>.testnet"}' prepaid-gas '100 TGas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

| Elemento | Valor exacto |
|---|---|
| Firma | llave de `audit.hades-<usuario>.testnet` (la exige `#[private]` en `new`) |
| Acciones (1 transacción) | `DeployContract` + `FunctionCall new` |
| Gas | máx. 100 TGas (lo no usado se devuelve) |
| Depósito | 0 NEAR |
| Permisos otorgados | ninguno; no se añaden llaves |
| Dueño | `hades-<usuario>.testnet` |

Esperado: transacción confirmada con su hash. Verifica:
```powershell
near contract call-function as-read-only audit.hades-<usuario>.testnet get_owner json-args '{}' network-config testnet now
```
Debe devolver `hades-<usuario>.testnet`.

## Paso 8 — Llave del servidor con mínimo privilegio

```powershell
near account add-key hades-<usuario>.testnet grant-function-call-access --allowance '0.25 NEAR' --contract-account-id audit.hades-<usuario>.testnet --function-names 'store_audit_hash' autogenerate-new-keypair save-to-keychain network-config testnet sign-with-keychain send
```
Esperado: una llave function-call (solo `store_audit_hash`, solo ese contrato, tope 0.25 NEAR). Comprueba con `near account list-keys hades-<usuario>.testnet network-config testnet now`.
El API necesita esa llave como variable de entorno/archivo **solo del servidor** (`NEAR_SIGNER_KEY_FILE`); cómo exportarla desde el llavero depende de tu versión
(`near account export-account --help`) y debe hacerse sin imprimirla en pantalla compartida. Dime solo que está hecho, nunca su contenido.

## Recuperación (verifica cada comando con `--help` antes de usarlo)

* Despliegue interrumpido antes de `new`: el contrato queda inerte; solo la cuenta del contrato puede inicializarlo. Reintenta el Paso 7 o borra y recrea la sub-cuenta (`near account delete-account --help`).
* Dueño equivocado: no se puede cambiar; borra la sub-cuenta (beneficiario: la firmante) y repite 5 y 7.
* Llave del servidor comprometida: `near account delete-keys --help` (subcomando `public-keys`) desde la firmante y crea otra.
