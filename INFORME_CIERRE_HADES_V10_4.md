# INFORME DE CIERRE — HADES V10.4

Base: `e69167c` · Respaldo: tag `backup-pre-v10-4-continue-f44b9fa` · Sin push, sin despliegue.
Entorno de prueba: API local con SQLite aislado (directorio temporal) y usuario ADMIN temporal creado por `/api/v1/setup/init`. `hades-admin.key` no se leyó ni se copió.

## 1. Explicación 129 → 80 tests
**No hubo regresión.** 129 = core 49 + api 75 + frontend 5 (32 archivos, igual que los informes V10.3).
El "80" fue un error mío al filtrar la salida de `turbo` (solo vi api + frontend; core venía en caché). Verificado con `npm test -- --force`: 49 + 75 + 5 = 129.

Fallos intermitentes de la API (6 tests la primera vez): no se reprodujeron ni en la suite completa, ni secuencial (`--no-file-parallelism`) con timeout de 5 s. Ocurrieron cuando `turbo` corría builds y tests a la vez (CPU saturada; el test de auth tarda ~14 s por el hash de contraseñas). No pude demostrar ni descartar una condición de carrera real; los tests aíslan estado con directorios temporales por test. Se mantiene `testTimeout: 30000` (documentado, no es una corrección de causa raíz). Recomendación: vigilar en CI.

## 2. WebSocket — causa raíz demostrada
Bundle de producción (Vercel) inspeccionado: `VITE_WS_URL = "wss://hades-omega.onrender.com"` **sin la ruta `/ws`**, que es la que sirve Fastify. El handshake iba a `/` y nunca conectaba → "WEBSOCKET DESCONECTADO" y "Telemetría no disponible".
Correcciones (`useWebSocket.ts`):
- URL derivada de `VITE_API_URL` si no hay `VITE_WS_URL`.
- Si `VITE_WS_URL` solo trae host, se añade `/ws`.
- Temporizador de ping separado del de reconexión (antes se pisaban).
- `.env.example`: `VITE_WS_URL` con `/ws`.
Verificado local E2E: tras el login el sidebar muestra "WebSocket OK" y el Command Center muestra telemetría (sin eventos simulados).
**Pendiente: requiere redeploy de Vercel (no autorizado) para que producción use el cliente corregido.**

## 3. CERBERUS / Approval Gate
Verificado por tests automáticos (pasan) y por E2E HTTP local:
- PERMIT → misión espera aprobación de ADMIN (ELYSIUM en `CERBERUS_REVIEW`, TARTARUS en cola).
- Aprobación → misión COMPLETED; SHA-256 del informe recalculado fuera de la API **coincide** con el sello.
- Rechazo → misión FAILED. Doble decisión rechazada (tests: 200 + 409). Sin token → 401.
- Tests cubren DENY, ESCALATE, idempotencia, reinicio con aprobación pendiente, aislamiento entre propietarios.
Corrección: tras un rechazo, la tarea posterior seguía `QUEUED` sin resultado; ahora queda `BLOCKED` con resultado explícito.
No auditado individualmente: la regla R-008 y sus riesgos (no revisé su definición). No se debilitó ninguna regla.

## 4. Misiones y reportes — origen de las discrepancias
Provienen de la implementación actual del orquestador legado (`core/agents/hades.ts`, ruta `/missions`), no solo de datos viejos:
- `SUSPENDED` con `success:true`: resultado simulado marcado SUSPENDED pero conservaba `success:true`. Ahora `success:false` + `simulated:true`.
- `ASSIGNED` sin resultado: tareas bloqueadas por dependencia. Ahora reciben resultado explícito ("No ejecutada: una dependencia no se completó"); estado sigue `ASSIGNED`.
- `PARTIAL_COMPLETE` con fallo: ahora un fallo sin aprobación pendiente da `FAILED`; `PARTIAL_COMPLETE` queda para aprobación humana pendiente o resultados simulados/bloqueados. Resumen del informe detalla cada causa.
- "DEMO" en informe/sello locales (`sqlite.ts`): el contenido es cómputo local real (SHA-256 verificado), pero estaba etiquetado `simulated:true / DEMO`. Ahora `simulated:false, executionMode:'LOCAL_RULE_ENGINE', agentDispatch:'NOT_IMPLEMENTED'`.
- No se reescribió ningún dato histórico guardado; el cambio aplica a misiones nuevas.
- Compras/NEAR simulados: NEAR sigue en modo `simulation` (la API lo declara); VaultPanel los etiqueta "Simulado". No hay operaciones reales en NEAR.
- Progreso 0 con `PARTIAL_COMPLETE`: el progreso solo cuenta tareas EXECUTED/FAILED/CERBERUS_REVIEW, por lo que 0 % es coherente con "nada ejecutado realmente". Sin cambio.

## 5. Holograma (E2E real en navegador, sesión local)
| Prueba | Resultado |
|---|---|
| Arrastre/rotación con ratón (animación pausada) | PASS (vista cambió) |
| Zoom con rueda | PASS (vista cambió, la página no hizo scroll) |
| Restablecer vista | PASS (vuelve a la vista original) |
| Pausar/reanudar | PASS (con pausa la escena queda estática hasta interactuar) |
| Sin errores de consola | PASS |
| Límites de zoom 3–9 | configurados; no medidos numéricamente |
| Selección de agente por clic en 3D | NO verificado en E2E |
| Táctil | `touch-action: pan-y` añadido; NO probado en dispositivo |
| Fallback sin WebGL | existe (`FallbackCore` + error boundary); NO probado |
| Rendimiento (FPS) | NO medido |
Capturas: `evidence-v10-4/` (carpeta ignorada por git, local).

## 6. Sidebar y logo
- Logo: `hades-logo.png` era RGB 24-bit (sin alfa; fondo negro). Convertido a RGBA con alfa por luminancia (negro → transparente, color sin premultiplicar): compuesto sobre negro es idéntico al original. Es el mismo logotipo, no uno nuevo. Quitado el hack `mix-blend-mode: screen`. Verificado en el sidebar (sin rectángulo negro). Login y cabecera: login comparte la clase, no revisado visualmente tras el cambio.
- Sidebar: fuente de navegación 13 px, estado/WebSocket 11 px y más contraste, botón de colapso más visible. Colapso/expansión verificados.

## 7. Persistencia (Render Free)
SQLite en `./data/hades.sqlite` sobre disco efímero: sobrevive a reinicios del proceso pero **se pierde en cada deploy** y puede perderse al reciclarse la instancia; no es persistencia durable. Hay arranque en frío (~50 s). Documentado en `render.yaml`. Recuperación de misiones/eventos/leases: cubierta por `recovery.test.ts` (6 tests PASS) en SQLite local; no probada en Render.

## 8. Pruebas ejecutadas
- Typecheck (4 paquetes): PASS · Build (3): PASS
- Tests con turbo paralelo: core 49, api 75, frontend 5 = 129 PASS
- Tests secuenciales, timeout 5 s: 129 PASS
- E2E HTTP local (misión, aprobación, rechazo, SHA-256, auth): PASS
- E2E navegador local (login, WS, holograma, sidebar): PASS en lo listado arriba
- Producción: `GET /api/health` en Render OK. Login/misiones autenticadas en Vercel+Render: **BLOCKED** (sin credenciales; no se usaron las del gestor ni se tocó la cuenta existente). Prueba de WS desde Vercel: **BLOCKED** hasta redeploy.

## 9. Commits
- `e69167c` hologram controls (previo)
- `c672df0` WS + estados de misión + etiquetas + rechazo
- commit final de V10.4 (logo alfa, sidebar, touch-action, informe) — ver `git log`

## 10. Riesgos / pendientes reales
1. Producción sigue con el cliente antiguo hasta redeploy en Vercel (no autorizado). Además conviene fijar `VITE_WS_URL=wss://hades-omega.onrender.com/ws` o eliminarla.
2. Persistencia efímera en Render Free.
3. Sin verificar: selección de agentes por clic, táctil, fallback WebGL, rendimiento, regla R-008, login/cabecera con logo nuevo.
4. El timeout de 30 s en tests de API enmascara posible lentitud bajo carga (hash de contraseñas).
5. Estado "PARTIAL_COMPLETE" cubre varios significados; la UI debería mostrar el motivo (el resumen del informe ya lo hace).

## Anexo — Despliegue controlado de Vercel (2026-10-30)
- Repo `dyann1984/hades-omega`: PRIVATE. Escaneo de secretos del diff: sin hallazgos. 3 commits locales listos.
- **Push a GitHub NO ejecutado**: `render.yaml` no define `buildFilter`/rutas ignoradas y los commits tocan `packages/api` y `packages/core`; un push a `main` podría redeployar Render y borrar SQLite. Pendiente aislar el despliegue de Render (configurar filtro de rutas en el panel de Render o `buildFilter`) antes de publicar.
- Vercel: `VITE_WS_URL` reemplazada por `wss://hades-omega.onrender.com/ws`; `VITE_API_URL` verificada en el bundle como `https://hades-omega.onrender.com`. Desplegado con `vercel deploy --prod` desde el directorio local (no toca Render). Bundle nuevo `index-Cqzav0qj.js` contiene ambas URLs, sin `/ws` duplicado.
- Verificado desde el origen de Vercel: conexión `wss://.../ws` abre; con token inválido el servidor cierra (1006). Logo en producción con alfa 0 en la esquina (transparente).
- BLOCKED (sin credenciales de producción): dashboard autenticado, sidebar, rotación/zoom/reset/pausa en producción, WebSocket autenticado y telemetría real. Selección de agentes, táctil, fallback WebGL y rendimiento: no verificados.
- Tests: 49 + 75 + 5 = 129 PASS antes del despliegue.
- V10.4 NO está completamente terminada.
