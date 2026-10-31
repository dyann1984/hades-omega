# Persistencia durable del administrador y los datos (Render Free)

Estado: **código listo y probado localmente; apagado por defecto; NO desplegado.** Se activa solo al definir `HADES_DURABLE_DATABASE_URL`.

## 1. Auditoría (qué había)
- Almacenamiento: SQLite (`better-sqlite3`, WAL) en `HADES_DB_FILE` (`./data/hades.sqlite`). Tablas: `users` (scrypt `scrypt-32768-8-3`), `sessions`, `missions`, `tasks`, `audits`, `audit_events`, `approvals`, `local_operations`, `document_results`, `events`, `execution_events`, `task_leases`, `idempotency`, `metadata`.
- Render Free: disco efímero. Al suspenderse o reiniciarse el servicio la base vuelve vacía → sin usuarios → modo «primer arranque». Eso explica la pérdida del admin.
- DEMO: sesiones y repositorios **solo en memoria** (`:memory:`), rol `DEMO`, default-deny. Nunca tocan la tabla `users` ni este espejo.

## 2. Diseño elegido: SQLite vivo + espejo cifrado en PostgreSQL
Reescribir ~700 líneas de acceso síncrono a SQL (y todas sus rutas) a PostgreSQL asíncrono es de alto riesgo y no aporta nada a corto plazo. En su lugar:
- SQLite sigue siendo el almacén en ejecución (mismo esquema, mismo scrypt, mismas pruebas).
- `packages/api/src/durable.ts` copia la imagen completa de la base (usuarios, hashes, sesiones, misiones, auditoría, aprobaciones…) a una tabla `hades_snapshot` en PostgreSQL, **cifrada con AES-256-GCM** (clave HKDF de `HADES_SNAPSHOT_KEY`, o de `JWT_SECRET` si no existe). El proveedor solo ve bytes cifrados.
- Cada 10 s, si hubo cambios, y al recibir SIGTERM (suspensión de Render): se guarda. Al arrancar, **antes** de abrir SQLite, si el archivo local no existe, se restaura el último snapshot.
- Escritura con compare-and-swap por versión (dos instancias no se pisan). Si la carga inicial falla (PostgreSQL inaccesible) la API arranca **sin persistencia y sin escribir** (la DEMO sigue funcionando) y registra `DURABLE STORAGE UNAVAILABLE`; nunca una base vacía puede sobrescribir datos buenos. Tampoco se publica una imagen sin usuarios sobre una que los tenía.
- Sin contraseña fija en variables de entorno. Las contraseñas siguen solo como hash scrypt.

## 3. Recuperación de ADMIN (un solo uso, con expiración)
1. En su equipo (no en Render), con `HADES_DURABLE_DATABASE_URL` y `JWT_SECRET`/`HADES_SNAPSHOT_KEY` en el entorno de esa sesión de PowerShell: `node scripts/hades-durable.cjs issue-recovery 30` → imprime un token **una sola vez**; en PostgreSQL solo se guarda su SHA-256.
2. `POST /api/v1/auth/recover` con `{username, token, newPassword}` (política de contraseña vigente, 3 intentos/15 min por IP). Quema el token de forma atómica, cambia el hash y **revoca todas las sesiones**. Solo existe si el almacenamiento durable está activo y sano; si no, 404.
3. Entrada oculta (PowerShell):
```powershell
$t = [Net.NetworkCredential]::new('', (Read-Host 'Token' -AsSecureString)).Password
$p = [Net.NetworkCredential]::new('', (Read-Host 'Nueva passphrase' -AsSecureString)).Password
Invoke-RestMethod -Method Post https://hades-omega.onrender.com/api/v1/auth/recover -ContentType 'application/json' -Body (@{ username='admin'; token=$t; newPassword=$p } | ConvertTo-Json)
Remove-Variable t, p
```
El primer arranque (`/setup/init`) sigue existiendo para una base realmente vacía.

## 4. Proveedor PostgreSQL (requiere su autorización: no se creó ninguna cuenta)
Requisitos: PostgreSQL ≥ 13, TLS, ~50 MB (la imagen es pequeña), conexión directa o pooler en modo sesión, **datos retenidos sin caducidad** aunque el cómputo se suspenda.
Opciones a evaluar (no verifiqué sus condiciones vigentes: confírmelas en cada sitio antes de decidir; un plan gratuito no garantiza disponibilidad indefinida):
- **Neon (plan gratuito):** el cómputo se suspende por inactividad, el almacenamiento persiste; la primera consulta tarda ~1 s en despertar. Es el candidato más adecuado a priori.
- **Supabase (plan gratuito):** históricamente pausa proyectos tras ~7 días de inactividad (restauración manual) → riesgo para un acceso «siempre disponible».
- **PostgreSQL gratuito de Render:** históricamente caduca a los 30 días → **no recomendado**.
Si se usa Vercel Marketplace/Neon, la cuenta y la base se crean desde su cuenta; yo no puedo hacerlo sin su autorización.

## 5. Plan exacto de migración (cuando autorice)
1. Crear la base PostgreSQL y copiar la cadena de conexión (con `sslmode=require`).
2. Render → servicio → Environment: añadir `HADES_DURABLE_DATABASE_URL` y `HADES_SNAPSHOT_KEY` (≥32 caracteres aleatorios; guárdela en su gestor). Auto-Deploy sigue Off.
3. Desplegar el backend manualmente **una vez** (esto vacía el disco efímero: es el último «primer arranque»). Crear el admin con el flujo oficial (`docs/RECUPERACION_ADMIN.md` §C). En ≤10 s queda espejado.
4. Verificar: `node scripts/hades-durable.cjs status` (snapshot v≥1); suspender/reiniciar el servicio desde Render y comprobar que el login sigue funcionando sin pasos manuales.
5. Rollback: quitar `HADES_DURABLE_DATABASE_URL` y reiniciar (vuelve al comportamiento anterior).

## 6. Pruebas realizadas (`durable.test.ts`, PostgreSQL real en WASM con PGlite)
Cifrado y detección de manipulación · admin y datos sobreviven a borrar el disco, con el mismo hash scrypt y verificación de contraseña · no sobrescribe con base vacía/inaccesible, CAS rechaza escritor obsoleto · token de recuperación de un solo uso, caducado rechazado, solo hash almacenado · `/auth/recover` cambia la contraseña una vez, revoca sesiones, 404 sin almacenamiento durable · la imagen espejada no contiene DEMO ni contraseñas en claro. API completa: 97 pruebas pasan.
**No probado:** un PostgreSQL gestionado real, ni la suspensión real de Render.

## 7. Riesgos
- Ventana de pérdida: ≤10 s de cambios si Render mata el proceso sin SIGTERM (los cambios de credenciales se vacían de inmediato).
- Con PostgreSQL inaccesible al arrancar tras una suspensión, el servicio funciona (DEMO incluida) pero sin admin hasta que PostgreSQL vuelva y se reinicie.
- Neon/otros pueden cambiar sus condiciones gratuitas; el snapshot cifrado se puede exportar con `status`/`seed` y migrar a otro proveedor.
- El token de recuperación se imprime en su terminal: no lo pegue en chats ni informes.

## 8. Endurecimiento previo a Neon (commit posterior a 5f79015)
- **Snapshot consistente:** la imagen se toma dentro de una única transacción de lectura (`serialize`, incluye el contenido del WAL) y se verifica (`integrity_check` + tabla `users`) **antes de subirla** y **antes de restaurarla**; además SHA-256 comprobado al cargar. Una imagen corrupta o manipulada nunca se restaura (el servicio arranca degradado, sin escribir).
- **Fail-closed:** con almacenamiento durable configurado, toda escritura (POST/PUT/PATCH/DELETE bajo `/api/v1`, salvo `/demo/*`, login, logout y refresh) devuelve `503 DURABLE_STORAGE_UNAVAILABLE` mientras no haya respaldo disponible, y solo se confirma (`200`) después de guardar el nuevo estado; si el guardado falla, el cliente recibe `503 DURABLE_NOT_CONFIRMED` en vez de un éxito que podría perderse. Las lecturas y la DEMO no se ven afectadas.
- **Secretos solo del servidor:** `HADES_DURABLE_DATABASE_URL` y `HADES_SNAPSHOT_KEY` no están en el frontend ni en Git (`.env.example` solo trae marcadores comentados); los mensajes de error se filtran con `redact()`. TLS obligatorio (`sslmode=require`) para cualquier host remoto: sin él, la API no arranca la capa durable.
- **Autoprueba con cuenta temporal:** `HADES_DURABLE_DATABASE_URL=... JWT_SECRET=... node scripts/hades-durable.cjs selftest` crea una cuenta `tmp-selftest` con contraseña aleatoria (solo en memoria), la espeja, borra el disco, restaura, verifica el hash, prueba el token de recuperación y elimina su snapshot de prueba (id aleatorio `selftest-…`); **nunca toca el snapshot de producción**.
- **Neon:** usar la cadena **directa** (no `-pooler`) con `sslmode=require`. La primera conexión tras una suspensión de Neon puede tardar ~1 s; el arranque reintenta una vez.
- Pruebas: 101 en la API (10 de durabilidad con PostgreSQL real en WASM). **Pendiente:** ejecutar `selftest` contra Neon real (requiere la cadena de conexión, que no tengo).
