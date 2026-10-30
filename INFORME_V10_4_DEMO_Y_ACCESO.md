# HADES V10.4 — Acceso admin, Modo DEMO para jueces y plan de despliegue

Estado: **local, sin push, sin deploy en Render/Vercel, sin cambio de credenciales de producción.**

## 1. Acceso administrativo simplificado
- Hash existente: **scrypt N=32768, r=8, p=3** (no se degradó; no se agregó Argon2 para no introducir una dependencia nativa en Render Free).
- `POST /api/v1/auth/password` (autenticado, solo no-DEMO): exige la **contraseña actual**, aplica política (passphrase de ≥3 palabras, o ≥20 caracteres, o 12+ con 3 clases; rechaza comunes, poca variedad y que contenga el usuario), y **cierra todas las demás sesiones**. Opcional `newUsername` (solo ADMIN, único, minúsculas) → permite pasar de `hades-admin` a `admin` **actualizando el mismo usuario** (sin duplicar administradores).
- `POST /api/v1/auth/refresh`: renueva el token y revoca la sesión anterior.
- Fuerza bruta: límite por IP (5/min) + **bloqueo por cuenta** (5 fallos → 15 min, HTTP 429, también bloquea la contraseña correcta).
- UI: sección **Cuenta** (`/account`) con cambio de contraseña/usuario. La contraseña nunca se muestra, guarda en el navegador ni se registra en logs.
- **Producción NO se tocó.** Procedimiento para migrar tu cuenta (cuando autorices): iniciar sesión con la credencial actual → Cuenta → ingresar contraseña actual + nueva passphrase + usuario `admin`. La nueva contraseña se escribe tú en el formulario (no en el chat).
- Recuperación si se pierde acceso: `scripts/reset-local-password.cjs` (acceso al archivo SQLite + contraseña por stdin). **En Render Free no hay shell y el disco es efímero**: tras un redeploy la base queda vacía y vuelve el flujo de primer arranque (`/api/v1/setup/init`, token impreso en los logs de Render, válido 1 h), con el que se crea de nuevo el admin.

## 2. Modo DEMO (botón «Explorar demo» / «Explore Demo»)
- Botón y subtítulos en login, ES/EN, exactamente con los textos pedidos. Sin correo ni contraseña.
- `POST /api/v1/demo/session` (público, 10/min por IP, tope de 40 sesiones simultáneas) emite JWT firmado con rol **DEMO**, **30 min** de vida, sesión **solo en memoria** del servidor (nunca en la SQLite de producción).
- Banner permanente **MODO DEMOSTRACIÓN** + botón *Salir de la demo* (cierra sesión en servidor y vuelve al login).
- Recorrido `/demo`: bienvenida, explicación, agentes, arquitectura, matriz de capacidades **Real / Determinista / Simulada / No disponible**, misión de ejemplo con ejecución reproducible, decisión CERBERUS, **Approval Gate** (aprobar/rechazar), auditoría encadenada, informe, **SHA-256 verificable**, exportación `.md`, explicación de NEAR simulado, holograma interactivo.
- Cada sesión usa **su propio motor SQLite en memoria y su propia instancia de CERBERUS**: es el motor real determinista (no resultados inventados), sobre documentos ficticios. Datos de ejemplo de las secciones (`/demo/seed`): decisiones **reales** de CERBERUS sobre operaciones ficticias y misiones etiquetadas «[DEMO]». Sin transacciones NEAR de ningún tipo.
- Secciones navegables en demo (verificado en navegador): Dashboard, Throne, Pantheon, Dominion, Chronos, Oracle, Vault, Judgment, Archives, Cerberus, Observatory, Documentos, Command Center + Recorrido.

## 3. Seguridad (servidor, no solo frontend)
- Hook `onRequest` (antes de parsear/validar el cuerpo): el rol sale **siempre de la sesión del servidor**, nunca del token. Una sesión DEMO es **default-deny**: solo `/api/v1/demo/*` y `auth/logout`; todo lo demás → 403.
- Rutas bajo `/demo` exigen sesión DEMO vigente; tokens no-DEMO → 403. Cualquier ruta `/demo/*` no implementada → 403 `NOT_AVAILABLE_IN_DEMO`.
- WebSocket: acepta DEMO; los eventos reales (mission/agent/cerberus) no le llegan; recibe solo los de su propio motor (`demo:true`). Los sockets demo no reciben eventos de otras sesiones y los admin no reciben eventos demo.
- Límites: 5 ejecuciones de escenario por sesión, rate-limit por ruta, tope de sesiones.
- Pruebas negativas automatizadas (25 rutas sensibles → 403, token forjado, sid inexistente, expiración, logout, aislamiento entre sesiones, la BD de producción no recibe datos demo).

## 4. Idioma ES/EN
Selector en login y cabecera (persistente). Traducido: login, demo (banner, recorrido, capacidades, agentes, reportes de la demo en inglés con documentos en inglés), menú lateral, cabecera, cuenta. **Limitación real:** el contenido interno de las páginas heredadas (Dashboard, Throne, etc.), estados como «Completada/En progreso» y la plantilla del informe determinista siguen en español. No se alteraron descripciones históricas.

## 5. Persistencia y despliegue de Render — riesgos
- Auto-Deploy de Render: **Off** (ya aplicado antes). Un deploy manual reinicia el disco efímero → **se pierden** usuarios, sesiones, misiones, auditoría y aprobaciones de la instancia actual (el esquema actual es versión 8; sin migraciones pendientes entre este código y el desplegado, pero el código desplegado en Render es `f44b9fa`, sin los cambios V10.4).
- No tengo acceso al disco de Render (sin shell en plan Free): **no pude auditar su SQLite actual ni hacer respaldo de ella**. Qué se perdería: todo lo anterior; lo único que sobrevive es lo que esté en variables de entorno.
- Respaldo verificado en entorno aislado: `scripts/backup-sqlite.cjs` (`VACUUM INTO` + `integrity_check`) y restauración con escritura posterior (OK). Para producción real se necesita disco persistente (plan de pago, ~7.25 USD/mes) — **no contratado**.
- Antes del deploy: (1) autorizar explícitamente; (2) si hay datos que importan en Render, no hay forma de exportarlos sin shell → aceptar su pérdida; (3) tras el deploy, leer el token de setup en los logs y crear el admin `admin` con la passphrase elegida (o restaurar el flujo de cambio de credenciales).
- `JWT_SECRET`/`ALLOWED_ORIGIN` ya existen en Render; el modo DEMO no requiere variables nuevas.
- Vercel necesita nuevo build para mostrar el botón «Explorar demo» (no se desplegó).

## 6. Regla R-008 (revisión pedida)
R-008 es `operationType: '*'`, `ALWAYS → PERMIT`, prioridad 1: **permiso por defecto (fail-open)**. Hallazgo concreto: R-001/R-002/R-003 (límites y lista de proveedores en `PURCHASE_ORDER`) están **acotadas al agente CHARON**; una orden de 42,000 MXN emitida por PERSEPHONE cae en R-008 y recibe PERMIT, mientras que la misma orden de CHARON se ESCALA (R-002). No lo modifiqué (cambiaría el comportamiento de producción); **recomendación**: quitar el acotamiento por agente de R-001–R-003 y/o cambiar R-008 a ESCALATE para operaciones sin regla, con pruebas.

## 7. Pruebas
- Locales: core 49 + API 86 (75 previas + 11 nuevas de DEMO/credenciales) + frontend 8 (5 previas + 3) = **143, todas PASS**. Typecheck de los 4 paquetes OK.
- E2E en navegador real (local): botón Explorar demo (ES/EN) → recorrido → ejecutar escenario → Approval Gate → aprobar → informe + SHA-256 verificado; navegación por las 13 secciones con datos; Command Center demo con telemetría (API conectada, WS activo, 1 aprobación pendiente, holograma); login admin con passphrase + cambio de contraseña desde Cuenta.
- No ejecutado / no verificado: aprobar desde Command Center (usa `window.prompt`, bloqueado por la automatización; la ruta está cubierta por tests de API y por el Approval Gate del recorrido), pruebas en producción (no desplegado), táctil, fallback WebGL, rendimiento/carga bajo concurrencia real, traducción completa de páginas heredadas, lint.
