# Demostración reproducible — misión empresarial HADES → NEAR

Separa con rigor lo **verificado localmente** de lo **pendiente de confirmar en blockchain**. No contiene transacciones ni resultados inventados.

## A. Qué demuestra y con qué componentes

Misión: *«Auditar un conjunto de documentos y dejar un sello verificable del resultado»*.

| Etapa | Componente | Evidencia |
|---|---|---|
| Planificación y análisis | HADES → CHARON, MINOS, PERSEPHONE | las tres etapas se completan |
| Control humano | CERBERUS | la misión espera aprobación ADMIN; informe, sello y evidencia **no se ejecutan** antes |
| Informe y sello | ELYSIUM, TARTARUS | tras aprobar, se genera informe y sello |
| Evidencia | Vault/SQLite | evidencia con SHA-256; no se puede registrar antes de completar (409) |
| Seguimiento | CHRONOS | tarea de solo lectura; programada ≠ ejecutada; al correr verifica evidencia y cadena de auditoría |
| Registro NEAR | `near.audit_hash_submit` vía CERBERUS | local: queda `CONFIGURATION_PENDING`, sin intención, nada firmado |
| Parada de emergencia | CERBERUS | bloquea toda operación no READ; visible en el Vault |

## B. Verificado localmente (reproducible, sin red ni fondos)

```powershell
npm ci
npm run build -w @hades/api
node scripts\e2e-audit-flow.cjs        # proceso API real + base desechable: 22 comprobaciones
npm test                                # 386 pruebas unitarias
npx playwright test                     # 22 pruebas E2E (navegador real)
powershell -File scripts\verify-contract-wasm.ps1       # reconstruye el WASM: MATCH
powershell -File scripts\test-contract-sandbox.ps1      # 12 unitarias + 6 de integración (sandbox local)
```

Resultado de hoy: las 22 comprobaciones del flujo pasan (incluye "NEAR sigue `CONFIGURATION_PENDING`: nada firmado ni enviado").
El ensayo de la primera operación (`first-operation.test.ts`) valida parámetros, aprobación ligada al hash y bloqueo por parada de emergencia, sin red.

## C. NO verificado todavía (requiere blockchain y tu autorización)

* Que la cuenta y el contrato existan en testnet; que el despliegue con `new` atómico funcione allí.
* Que `store_audit_hash` se confirme en cadena y `get_audit_entry` devuelva el hash.
* Una demostración pública (URL) reproducible por terceros.
Hasta cerrar estos puntos, NEAR **no está validado**.

## D. Procedimiento mínimo para cerrar con evidencia real

Cada paso marcado 🔐 necesita tu autorización explícita para esa operación concreta.

1. Instalar near-cli-rs y crear las cuentas (`docs/near-testnet-guia-powershell.md`, pasos 1-5). Sin claves en el chat.
2. Comprobar el hash del WASM: `Get-FileHash artifacts\contract\hades_audit_registry.wasm` = `ae9a75ff…f685`.
3. 🔐 **Desplegar** con inicialización atómica (`docs/near-testnet-guia-powershell.md`, paso 7). Evidencia: hash de la transacción de despliegue + `get_owner` = tu cuenta firmante.
4. Crear la llave function-call del servidor y fijar el entorno del API (`NEAR_EXECUTION_MODE=testnet`, cuenta, contrato, ruta de la llave). `NEAR_SIGNING_ENABLED` sigue sin definir.
5. Con la app: iniciar sesión como ADMIN → Vault → permitir el contrato como destinatario → «Sondear red» (debe mostrar contrato y propietario).
6. Ejecutar la misión del apartado A en la interfaz; aprobarla; preparar la auditoría NEAR (se crea la intención, **sin firmar**).
7. 🔐 **Primera transacción**: autorizar `store_audit_hash` (parámetros en `docs/near-testnet-preparacion.md` §5). Solo entonces `NEAR_SIGNING_ENABLED=true`, aprobar (≤15 min) y firmar.
8. Verificar: hash de transacción en el explorador de testnet, y
   `near contract call-function as-read-only audit.<cuenta>.testnet get_audit_entry json-args '{"audit_id":"<id>"}' network-config testnet now`
   (confirma el nombre exacto del argumento con `near contract inspect` / el ABI antes de usarlo).
9. Guardar la evidencia (hash de tx, URL del explorador, salida de `get_audit_entry`, captura) en `docs/evidence-ui/` o en el informe, **sin** claves.
10. Publicar (push/PR/visibilidad) solo tras la autorización correspondiente y el escaneo de secretos.

Criterio de «NEAR validado»: transacción confirmada en testnet **y** lectura del hash desde el contrato **y** misión de HADES enlazada a ese registro.
