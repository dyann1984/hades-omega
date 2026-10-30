# HADES V10.4 — Informe de pre-publicación (modo DEMO + CERBERUS R-008)

Estado: **todo local y validado; sin push, sin deploy de Render, Vercel NO actualizado (la demo no es visible).** Render Auto-Deploy verificado en **Off** (dashboard, hoy).

## 1. Incidente del alias `Rd` — sin pérdida de código
Un helper de PowerShell llamado `Rd` (alias de `Remove-Item`) hizo que 4 archivos (`demo.ts`, `websocket.ts`, `security.ts`, `server.ts`) se escribieran **vacíos** durante una edición. Se detectó de inmediato por el error de `tsc`.
Verificación: (a) `websocket.ts`, `security.ts`, `server.ts` se restauraron con `git checkout --` (versiones íntegras) y se re-aplicaron los cambios previstos; `git diff ece7f72..HEAD` de esos 3 archivos muestra **solo** las adiciones intencionales (rol DEMO, hook `onRequest`, `sendToSession`, registro de rutas); (b) `demo.ts` era archivo nuevo y se reescribió completo; (c) no quedan archivos de 0 bytes rastreados ni archivos sueltos en `packages/`; (d) las 129 pruebas originales siguen pasando. No se perdió código funcional.

## 2. CERBERUS R-008 — estado: CORREGIDO (cambio de comportamiento documentado)
Problema: R-001/R-002 (límite 50k DENY y 30–50k ESCALATE) estaban acotadas a `agent: 'CHARON'`; la misma orden de otro agente caía en R-008 (permiso por defecto) y se permitía.
Cambios (`packages/core/src/cerberus/policy.ts`, `guard.ts`):
- **R-001/R-002 sin acotar por agente.**
- **R-009 (prioridad 200, DENY): permiso por tipo de operación.** Matriz `operationPermissions` en la política: `PURCHASE_ORDER → CHARON`, `PAYMENT/TRANSFER → PERSEPHONE`, `NEAR_TRANSACTION → PERSEPHONE, HADES`. Un agente no listado (incluido un nombre desconocido) es denegado. La matriz entra en el hash de la política.
- **R-010 (DENY > 50,000 MXN) y R-011 (ESCALATE 30–50k): aplican a cualquier tipo de operación y agente** que lleve `amount`/`totalAmount`.
- Importes **fail-closed**: no numéricos o negativos se tratan como sobre el límite; `payload` nulo ya no lanza excepción.
- **R-008 se conserva como permiso por defecto solo para operaciones no sensibles** (p. ej. `CRYPTO_HASH`, usado por el flujo documental). Approval Gate, ESCALATE→aprobación humana e idempotencia (decisiones deterministas, un `auditId` nuevo por evaluación) sin cambios.
Cambios de comportamiento: (1) una `PURCHASE_ORDER` de un agente distinto de CHARON ahora es DENY (R-009); (2) cualquier operación con importe > 50k es DENY y 30–50k ESCALATE, sin importar el agente; (3) `PAYMENT/TRANSFER/NEAR_TRANSACTION` de agentes sin permiso son DENY. Las operaciones sin importe y no sensibles siguen en PERMIT (R-008).
Pruebas nuevas (6) en `guard.test.ts`: sustitución de agente (6 agentes), importes por tipo, permisos, importes malformados/negativos/string, payload nulo, determinismo y hash de política.
Riesgo residual: R-008 sigue siendo fail-open para tipos de operación **nuevos no listados como sensibles**; recomendación: añadir cada nuevo tipo sensible a `operationPermissions` al crearlo.

## 3. Aprobación (Approval Gate) — sin `window.prompt`
Nuevo diálogo accesible (`JustificationDialog`): `role="dialog"`, `aria-modal`, foco automático, Esc/clic fuera cancelan, confirmar deshabilitado hasta 3–500 caracteres, `data-testid` para E2E. Reemplaza **todos** los `window.prompt/alert` (Command Center, Judgment, LocalOperations; quedan 0). **E2E real en navegador (demo):** clic en APPROVE → diálogo (foco en el campo, confirmar deshabilitado) → texto → confirmar → servidor: aprobación resuelta, misión `COMPLETED`, 0 aprobaciones pendientes.

## 4. Idioma ES/EN
- Pantallas nuevas (login, demo, cuenta, diálogos, menú, cabecera): `lib/i18n.ts`.
- **Secciones heredadas (13) y estados**: capa de traducción `lib/domTranslate.ts` (~350 cadenas de interfaz: títulos, estados, etiquetas, estados vacíos, descripciones de agentes y de reglas, mensajes). Traduce solo coincidencias exactas de textos de interfaz; contenido de usuario/misiones/informes nunca se altera, y al volver a ES se **restaura el texto original**.
- E2E: barrido de las 13 secciones + recorrido en EN; los restos detectados se corrigieron (queda por verificar tras el último ajuste: «% aprobación» en Oracle).
- Limitaciones: la plantilla del informe determinista (backend) sigue en español; textos nuevos añadidos a futuro requieren su entrada en el diccionario (si falta, se muestra el español).

## 5. DEMO — aislamiento, 30 min y anti-abuso
- Sesión en memoria del servidor, rol DEMO, JWT con `exp` = 30 min (**probado**: la respuesta y el token respetan ≤30 min; sesión expirada → 401; logout revoca).
- Default-deny para DEMO fuera de `/api/v1/demo/*` (25 rutas sensibles probadas → 403); roles siempre desde la sesión del servidor; token forjado no escala privilegios; `onRequest` antes de validar/parsear.
- Cada sesión: motor SQLite **en memoria** + CERBERUS propio; la BD de producción no recibe datos demo (probado).
- **Abuso / Render Free:** 10 sesiones/min por IP; máx. **5 sesiones simultáneas por IP** y **40 en total** (429/503); 5 ejecuciones de escenario por sesión; límites de cuerpo (1–2 KB) en rutas demo; máx. **3 sockets por sesión demo y 120 en total**; sesiones expiradas se purgan cada minuto. Memoria acotada: 40 sesiones × motor en memoria (solo se crea al ejecutar el escenario).
- **Proxy:** se añadió `trustProxy` configurable (`HADES_TRUST_PROXY_HOPS`, por defecto 1 en producción). Sin esto, detrás de Render todos los clientes comparten la IP del proxy y los límites por IP (incl. el de login) serían un único cubo global. Si Render usara más de un salto, el valor debe ajustarse (si no, el límite sería por IP del balanceador).
- Pruebas nuevas: TTL, tope por IP y total, rate-limit y cuerpos grandes, límite de sockets, aislamiento por WebSocket.

## 6. Recuperación de la cuenta administradora
Procedimiento documentado en `docs/RECUPERACION_ADMIN.md` (cambio normal; reset con acceso al archivo; **recuperación tras despliegue en Render Free vía token de primer arranque en los logs, entrada oculta con `Read-Host -AsSecureString`**; prevención y respaldo). No contiene contraseñas ni tokens.

## 7. Pruebas
| Paquete | Antes (V10.3) | Demo (143) | Ahora |
|---|---|---|---|
| core | 49 | 49 | **55** (+6 R-008) |
| api | 75 | 86 | **90** (+4 abuso/TTL/WS) |
| frontend | 5 | 8 | **9** (+1 traducción) |
| **Total** | 129 | 143 | **154 PASS** |
Typecheck 4/4 y build 3/3 OK. API también en modo secuencial (`--no-file-parallelism`): 90/90 con timeout de 30 s (la prueba de credenciales ejecuta varios hashes scrypt y excede 5 s; no es una condición de carrera).
E2E navegador (local, aislado): demo ES/EN, recorrido, Approval Gate, diálogo de aprobación, 13 secciones, cambio de idioma en vivo y restauración, login admin con passphrase, cambio de contraseña desde Cuenta.
No verificado: táctil, fallback WebGL, rendimiento/carga real concurrente, carga contra Render real (no desplegado), cobertura 100 % de traducción de texto generado dinámicamente.

## 8. Plan de publicación coordinada (NO ejecutado)
1. **Autorización explícita** para desplegar Render y aceptar la pérdida de datos (abajo).
2. Confirmar Auto-Deploy Off (hecho hoy) y mantenerlo Off.
3. `git push` (no dispara Render con Auto-Deploy Off) — publica el código en GitHub.
4. Render → **Manual Deploy** del commit publicado (tarda ~1–2 min; la instancia Free se reinicia con SQLite vacío).
5. Inmediatamente: leer el token de primer arranque en los logs y crear el admin `admin` con tu passphrase (docs/RECUPERACION_ADMIN.md §C). Comprobar `/api/health` y que `POST /api/v1/demo/session` responde 200.
6. **Solo entonces** `vercel deploy --prod` (VITE_API_URL ya apunta a Render; VITE_WS_URL ya incluye `/ws`) → la demo pasa a ser visible.
7. Verificación en producción: login admin, «Explorar demo» ES/EN, escenario + aprobación, WebSocket, holograma.
8. Rollback: Render permite *Rollback* al deploy `f44b9fa` (también con base vacía); Vercel permite promover el deployment anterior.

## 9. Riesgos de pérdida de datos en Render (qué se perdería)
El disco de Render Free es efímero y **no existe respaldo** de los datos actuales (sin shell, no se puede exportar). Un deploy **destruye**: usuarios (incluida la cuenta `hades-admin`), sesiones activas, misiones y tareas, aprobaciones/escalaciones, auditoría y eventos de ejecución, resultados de documentos, task leases, claves de idempotencia y metadatos. **Se conserva**: variables de entorno (`JWT_SECRET`, `ALLOWED_ORIGIN`, `ANTHROPIC_API_KEY`), el código y los commits. Además Render Free duerme tras inactividad (arranque en frío ≈50 s) y un reinicio por inactividad **no** borra el disco, pero cualquier nuevo deploy sí. Para evitarlo: disco persistente (plan de pago, no contratado).

## 10. Veredicto
Código **listo para publicar** (validado localmente). La publicación depende de tu autorización para el despliegue de Render (pérdida de datos aceptada) y debe seguir el orden del §8. HADES V10.4 **no** se declara terminada hasta verificar la demo en producción.
