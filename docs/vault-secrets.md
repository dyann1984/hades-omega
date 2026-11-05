# Almacén de secretos

El backend puede guardar valores cifrados en SQLite con AES-256-GCM, nonce aleatorio de 96 bits y nombre asociado al cifrado. La clave de 32 bytes se suministra externamente en `HADES_VAULT_MASTER_KEY`, en base64 canónico. Generarla y conservarla en un gestor de secretos externo, separado de la base y sus respaldos; no guardarla en Git. Sin esa variable el almacén está deshabilitado. Una clave mal formada impide iniciar las rutas de Vault.

Las rutas `/api/v1/vault/secrets` son exclusivas de ADMIN: GET enumera nombres y fechas, PUT `/:name` recibe `{ "value": "..." }`, DELETE `/:name` elimina. Las respuestas nunca devuelven el valor. Los nombres deben ser identificadores en mayúsculas (no contienen secretos); la auditoría registra un hash del nombre, nunca el valor. Las escrituras se bloquean durante la parada de emergencia. El transporte hacia la API debe estar protegido con TLS fuera de un entorno local.

Un marcador cifrado detecta claves incorrectas antes de leer, borrar o sobrescribir entradas. La pérdida de la clave hace irrecuperables los datos cifrados. `SecretVault.rotate` recifra todas las entradas en una transacción SQLite, y falla sin cambios si una entrada no autentica; requiere una ventana de mantenimiento y que la nueva clave se prepare en el gestor externo antes de invocarla. El procedimiento operativo está descrito en la sección «Rotación de la clave maestra». El mecanismo `SecretVault.get` está disponible únicamente para consumidores confiables del backend. La clave reside en memoria del proceso y este mecanismo no protege contra un atacante con acceso a ese proceso.

Para seleccionar Vault como fuente del firmante NEAR, guardar `NEAR_SIGNER_PRIVATE_KEY` en Vault y configurar `HADES_NEAR_KEY_SOURCE=vault`, `HADES_VAULT_MASTER_KEY` y `NEAR_SIGNER_ACCOUNT_ID` en el servidor. No configurar simultáneamente `NEAR_SIGNER_PRIVATE_KEY` ni `NEAR_SIGNER_KEY_FILE` en el entorno: esa combinación se rechaza. El firmante se carga al arrancar; actualizar el secreto requiere reiniciar el proceso. Para el planificador, guardar `ANTHROPIC_API_KEY` en Vault y seleccionar `HADES_LLM_KEY_SOURCE=vault`; una clave simultánea en el entorno se rechaza. La política de egreso sigue apagada por defecto, con autorización de administrador y CERBERUS. Estas selecciones no habilitan firma, egreso ni envíos.

## Rotación de la clave maestra

Herramienta: `scripts/rotate-vault-key.cjs` (requiere `npm run build -w @hades/api`). Las claves se leen solo del entorno, nunca de argumentos, y la salida no contiene secretos.

1. Programar una ventana de mantenimiento y **detener todos los procesos HADES** que usen la misma base (API, planificador CHRONOS externo, scripts). La rotación no coordina procesos en ejecución: una instancia que conserve la clave anterior fallará con `VAULT_AUTHENTICATION_FAILED` y no escribirá, pero no debe quedar activa durante el cambio.
2. Generar la clave nueva: `node scripts/rotate-vault-key.cjs generate` y guardarla en el gestor externo, **sin** reemplazar todavía la anterior.
3. Ejecutar: `HADES_DB_FILE=<db> HADES_VAULT_MASTER_KEY=<actual> HADES_VAULT_NEW_KEY=<nueva> node scripts/rotate-vault-key.cjs rotate <respaldo>`. La herramienta rechaza claves iguales o un respaldo existente, toma un respaldo consistente (`VACUUM INTO`, verificado con `integrity_check`), rota en una sola transacción y verifica con una conexión nueva que la clave nueva abre el mismo número de entradas y que la anterior ya no. Si la clave actual es incorrecta aborta sin cambios.
4. Actualizar `HADES_VAULT_MASTER_KEY` en el gestor externo con la clave nueva y reiniciar los procesos. Comprobar el arranque (`GET /api/v1/vault/secrets` como ADMIN).
5. Conservar la clave anterior y el respaldo hasta validar; luego destruir ambos de forma controlada. El respaldo solo abre con la clave **anterior**: es el punto de retorno (restaurar el archivo sobre la base con el API detenido y volver a la clave anterior).

Recuperación de clave: sin la clave vigente (ni la anterior mientras exista el respaldo) los datos cifrados son irrecuperables; no hay clave de custodia en el sistema. La custodia y duplicación de la clave en el gestor externo es responsabilidad del operador.

Pruebas: `npm run test -w @hades/api -- --run src/vault-rotation.test.ts` (claves y SQLite temporales). Pruebas: `npm run test -w @hades/api -- --run src/secret-vault.test.ts`. Usan claves y valores efímeros de prueba, SQLite temporal y no contactan servicios externos.
