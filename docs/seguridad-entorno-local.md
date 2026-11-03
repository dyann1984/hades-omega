# Seguridad del entorno local — hallazgos y recomendaciones

## Estado actual (actualizado tras aplicar R1, 2026-11-02 noche)

**R1 aplicada y verificada** con tu autorización: los 8 objetivos (`.env.local`, `packages/api/.env`, `hades-admin.key`, `hades-admin-temporal.key`, `local-data/`, `data/`, `packages/api/data/`, `logs/`) y sus 14 archivos hijos (22 entradas) quedaron con acceso **solo para tu usuario y SYSTEM** (control total), sin herencia. Antes, las 22 entradas daban acceso a *Authenticated Users* / *Usuarios*.
* **Copia de la ACL anterior** (SDDL exacto, sin contenido ni secretos) y script de restauración: `%USERPROFILE%\hades-local\acl-backup-20261102-191740\` (carpeta ya restringida). Restaurar: `powershell -File restore-acl.ps1` en esa carpeta.
* **Contenido sin cambios:** las fechas de modificación de los 7 archivos de datos/credenciales son idénticas a las de antes; no se imprimió ni leyó ningún valor.
* **Funcionamiento:** las 3 bases SQLite reales abren en solo lectura con `quick_check: ok`; Node abre `.env.local` y `packages/api/.env` en lectura/escritura; crear archivos nuevos en las 4 carpetas funciona y heredan la ACL restrictiva.
* **Pendiente (no hecho):** R2 (rotar secretos) — ver «Impacto de rotar» al final; R3–R9.

La sección 2 de abajo describe el estado **previo** a R1 y se conserva como registro del hallazgo.

**Alcance original:** revisión de **metadatos** (nombres, tamaños, permisos, sincronización). No se leyó, copió ni publicó el contenido de ningún archivo sensible. **No se borró ni se modificó nada.** Los comandos de la sección 3 están preparados, no ejecutados.

## 1. Qué encontró Gitleaks y qué significa

Gitleaks en modo directorio dio 9 hallazgos. **Ninguno está en el historial de Git** (136–138 commits escaneados: 0 fugas).

| Hallazgo | Dónde | ¿En Git? | Riesgo |
|---|---|---|---|
| JWT y clave genérica | `.env.local` (raíz) | No (ignorado, 0 commits) | **Medio, local**: ver 2.1 |
| 5 claves genéricas | Perfil de navegador de Playwright en `.test-tmp/` | No (ignorado) | Bajo: estado interno del navegador de pruebas |
| 1 | `packages/api/dist/` (salida de compilación) | No (ignorado) | Bajo: replica el fixture de pruebas |
| 1 | `packages/api/src/demo-auth.test.ts:266` | Sí | **Falso positivo revisado**: UUID usado como `Idempotency-Key` de prueba; registrado en `.gitleaksignore` |

## 2. Hallazgos de permisos (reales)

1. **Permisos demasiado amplios.** Estos archivos ignorados dan **Modificar a «Authenticated Users»** y **Lectura a «Usuarios»** (es decir, cualquier cuenta local del equipo puede leerlos y modificarlos):
   * `.env.local` (contiene `JWT_SECRET` y un token de desarrollo `VITE_DEV_TOKEN`)
   * `hades-admin.key` y `hades-admin-temporal.key` (archivos de contraseña de administrador local)
   * `packages/api/.env`
   * `local-data/hades-live.sqlite` (+`-wal`, `-shm`) y `data/hades.json.sqlite`, `packages/api/data/*.sqlite` (misiones, auditoría, hashes de contraseñas)
   * carpeta `logs/`
   Causa: el disco `L:` hereda permisos de la raíz de la unidad. Contraste: `%USERPROFILE%\.near-credentials` y `%USERPROFILE%\hades-local` **sí** están restringidos a tu usuario, Administradores y SYSTEM.
2. **Token de desarrollo.** `VITE_DEV_TOKEN` en `.env.local` es un JWT largo. Las variables `VITE_*` se incrustan en cualquier bundle que se construya con ese archivo en el directorio del frontend; hoy **no** ocurre (el código no la usa y Vite lee `.env*` solo de `packages/frontend`; el escaneo del bundle lo confirma), pero es una trampa si alguien mueve el archivo. Si ese token todavía es válido contra alguna API, debe considerarse expuesto a los usuarios locales.
3. **Perfil del navegador de Playwright** (`.test-tmp/playwright_chromiumdev_profile-*`): datos de navegador de pruebas anteriores (28-oct). Sin valor, pero contiene los avisos de Gitleaks.
4. **Copia extra de la llave NEAR restringida** (`%USERPROFILE%\.near-credentials\testnet\hades-omega.testnet.json`), ya documentada en `docs/near-primera-operacion-propuesta.md` (A.3). Con ACL restringida; sigue siendo una copia redundante de una frase semilla.
5. **Token de la CLI de Vercel** en `%APPDATA%\com.vercel.cli\Data\auth.json`: da acceso a **todos** tus proyectos Vercel mientras la sesión esté abierta.

## 3. Lo que sí está bien

* `.near-credentials` y `hades-local` fuera de OneDrive y de las carpetas sincronizadas (OneDrive corre, pero su raíz `C:\Users\DYANN\OneDrive` no contiene esas rutas; Escritorio y Documentos están en sus rutas locales normales, no redirigidas a OneDrive).
* `L:\HADES` es un disco fijo NTFS, sin punto de reanálisis ni sincronización en la nube.
* Ningún archivo sensible está rastreado por Git ni en su historial; el bundle público no contiene ningún valor de tus `.env`.
* La FullAccess de la cuenta NEAR está solo en el llavero de Windows.

## 4. Recomendaciones (no ejecutadas; cada una necesita tu autorización)

| # | Acción | Comando propuesto | Efecto / reversibilidad |
|---|---|---|---|
| R1 | Restringir permisos de los archivos sensibles del repo a tu usuario | `icacls <archivo> /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:(F)" "SYSTEM:(F)" "Administradores:(F)"` (en carpetas, añadir `(OI)(CI)`) para `.env.local`, `packages\api\.env`, `hades-admin*.key`, `local-data`, `data`, `packages\api\data`, `logs` | No borra nada. Reversible con `icacls /reset` |
| R2 | Rotar secretos de `.env.local` | Generar un `JWT_SECRET` nuevo (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), invalidar el token `VITE_DEV_TOKEN` (cambiar el secreto lo invalida) | Cierra sesiones locales abiertas |
| R3 | Sacar los `.env`, `.key`, `.sqlite` del árbol del proyecto hacia `%USERPROFILE%\hades-local\` (ya protegida) y apuntar las variables ahí | Mover + actualizar rutas | Reduce que un `git add -f`, una copia o un comprimido del repo los arrastre |
| R4 | Mover fuera de la raíz o borrar `.test-tmp/` (perfil Playwright) | `Remove-Item .test-tmp -Recurse` | **Borrado**: solo con tu autorización; es regenerable |
| R5 | Eliminar la copia redundante `hades-omega.testnet.json` de la llave restringida | Borrar ese archivo (queda la copia dentro de `testnet\hades-omega.testnet\`) | **Borrado de credencial**: solo con tu autorización. Reversible solo si conservas la frase semilla |
| R6 | Revocar la llave FunctionCall restringida al terminar el hackathon | `near account delete-keys` (con la FullAccess, desde el llavero) | Transacción real en testnet: requiere su propia autorización |
| R7 | Cerrar sesión de la CLI de Vercel al terminar el despliegue | `vercel logout` | Reversible con `vercel login` |
| R8 | Excluir de cualquier copia/sincronización en la nube `.near-credentials`, `hades-local` y `L:\HADES\local-data` | Ajustes de OneDrive/respaldos | Hoy no están incluidos; esto lo mantiene así |
| R9 | Prevenir recaídas | Activar el hook pre-commit con Gitleaks (el repo ya tiene `.github/workflows/secret-scan.yml`) y mantener `.env*` en `.gitignore` | Solo configuración |

**Orden sugerido:** R1 y R2 (inmediatas, no destructivas) → R7 tras desplegar → R4, R5, R6 al cerrar el hackathon.

## Impacto de rotar secretos (R2) — análisis, NO ejecutado

Estado observado hoy: **ningún servicio HADES en ejecución** (puertos 3001, 3921, 3927, 3931, 4173 y 5174 libres). Sesiones en las bases reales (solo conteos, interpretando el vencimiento en milisegundos como en el código): `local-data/hades-live.sqlite` 9 sesiones, 8 revocadas y ninguna vigente; `data/hades.json.sqlite` 22 sesiones, todas revocadas y ninguna vigente. Hay 2 y 1 cuentas de usuario respectivamente.

| Secreto | Dónde se usa (código) | Efecto de rotarlo | Riesgo |
|---|---|---|---|
| `JWT_SECRET` (`.env.local`) | `security.ts` firma y valida las sesiones; `durable.ts` lo usa como clave del respaldo cifrado **solo si** no hay `HADES_SNAPSHOT_KEY` | Invalida todo token firmado antes (incluido `VITE_DEV_TOKEN`). Hoy no hay sesiones vigentes, así que nadie pierde nada. Quien use la API debe iniciar sesión de nuevo | **Bajo hoy.** Ojo: si algún día se activa el respaldo durable sin `HADES_SNAPSHOT_KEY`, rotar `JWT_SECRET` dejaría ilegibles los respaldos cifrados con el anterior. En `.env.local` no hay URL durable ni clave de snapshot |
| `VITE_DEV_TOKEN` | Solo `scripts/e2e-phase3.cjs` (script antiguo); no lo usa el código de la aplicación | Al rotar `JWT_SECRET` deja de ser válido; no hace falta regenerarlo salvo que uses ese script | Ninguno |
| Contraseñas de `hades-admin.key` / `-temporal.key` | Cuentas locales en las bases (`users`) | Cambiar la contraseña con `scripts/reset-local-password.cjs` solo afecta al inicio de sesión local; las sesiones previas ya están revocadas o vencidas | Bajo. Hay que guardar la nueva en un archivo protegido y actualizar la ruta en tu gestor |
| `JWT_SECRET` de producción (Render, `hades-api`) | Variable en su panel, **independiente** del archivo local | **No se afecta** al rotar el local. No pude comprobar si el valor local se reutilizó allí; si lo fue, rotar también el de Render, lo que cerraría las sesiones de ese servicio | A verificar por ti en el panel |
| Llaves NEAR | No están en estos archivos | No aplica | — |

Orden recomendado: (1) confirmar que no hay servicio activo (hoy cumplido); (2) rotar `JWT_SECRET` local; (3) restablecer las contraseñas locales; (4) comprobar el arranque con `npm run dev:all`; (5) solo si el valor se había reutilizado, rotar el de Render.
