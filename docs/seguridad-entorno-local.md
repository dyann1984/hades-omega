# Seguridad del entorno local — hallazgos y recomendaciones

**Alcance:** revisión de **metadatos** (nombres, tamaños, permisos, sincronización). No se leyó, copió ni publicó el contenido de ningún archivo sensible. **No se borró ni se modificó nada.** Los comandos de la sección 3 están preparados, no ejecutados.

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
