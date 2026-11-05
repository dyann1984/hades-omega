# Almacén de secretos

El backend puede guardar valores cifrados en SQLite con AES-256-GCM, nonce aleatorio de 96 bits y nombre asociado al cifrado. La clave de 32 bytes se suministra externamente en `HADES_VAULT_MASTER_KEY`, en base64 canónico. Generarla y conservarla en un gestor de secretos externo, separado de la base y sus respaldos; no guardarla en Git. Sin esa variable el almacén está deshabilitado. Una clave mal formada impide iniciar las rutas de Vault.

Las rutas `/api/v1/vault/secrets` son exclusivas de ADMIN: GET enumera nombres y fechas, PUT `/:name` recibe `{ "value": "..." }`, DELETE `/:name` elimina. Las respuestas nunca devuelven el valor. Los nombres deben ser identificadores en mayúsculas (no contienen secretos); la auditoría registra un hash del nombre, nunca el valor. Las escrituras se bloquean durante la parada de emergencia. El transporte hacia la API debe estar protegido con TLS fuera de un entorno local.

Un marcador cifrado detecta claves incorrectas antes de leer, borrar o sobrescribir entradas. La pérdida de la clave hace irrecuperables los datos cifrados. No existe aún rotación automática: no cambiar la clave sin un procedimiento de migración y respaldo comprobado. El mecanismo `SecretVault.get` está disponible únicamente para consumidores confiables del backend; las integraciones NEAR y LLM actuales siguen usando sus fuentes existentes y no se han conectado automáticamente al almacén. La clave reside en memoria del proceso y este mecanismo no protege contra un atacante con acceso a ese proceso.

Pruebas: `npm run test -w @hades/api -- --run src/secret-vault.test.ts`. Usan claves y valores efímeros de prueba, SQLite temporal y no contactan servicios externos.
