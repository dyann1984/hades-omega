# HADES OMEGA — Fase 2, informe de avance

Fecha: 27 de octubre de 2026. Rama: `codex/recovery-omega-20261026`. Punto inicial: `2d4c947`. Se preservó `recovery-20261027-initial/`, no se alteraron credenciales existentes y no se publicó ni desplegó.

## Resultado
**FASE INCOMPLETA; no apto para producción.** Se redujeron riesgos y se verificó conectividad local, pero no se logró una operación real con aprobación y reanudación, ni migración SQLite ni aislamiento empresarial completo.

## Seguridad WebSocket
- Autenticación mediante primer mensaje `AUTH` con JWT, sujeto, rol conocido y expiración; sin tokens en URL. Se cierra sin autenticación en cinco segundos. No se entregan eventos antes de autenticar. Los mensajes inválidos se rechazan y el motivo se registra sin credenciales. La sesión se comprueba al recibir mensajes y emitir eventos.
- Solo ADMIN recibe eventos sensibles. Los otros roles únicamente reciben latidos: denegación conservadora, no autorización por propietario. Aún falta modelo de propiedad de misión, suscripciones autorizadas, revocación de sesiones y aislamiento multiusuario. La conexión HTTP se eleva antes de la autenticación y se cierra después si esta falla; no es rechazo en handshake.
- El frontend envía el token por mensaje y exige WSS fuera de loopback. No se ha verificado el ciclo de autenticación de usuarios reales en navegador.

## Aprobaciones y agentes
- Solo ADMIN registra decisiones; la escalación debe corresponder a una tarea persistida en `CERBERUS_REVIEW`; se rechazan duplicados. La interfaz pide justificación y utiliza la API, y advierte que no reanuda la operación.
- Pendiente: persistir la escalación antes de ejecutar, estados PENDING/APPROVED/RESUMED/COMPLETED y REJECTED/CANCELLED, reanudación idempotente, recuperación transaccional tras caída y pruebas de extremo a extremo. La persistencia JSON no ofrece garantías entre procesos. El modelo actual de MINOS representa una compra de demostración y no define una operación real reanudable. La ruta puede registrar una revisión, no autorizar una operación.
- CHARON, PERSEPHONE, ELYSIUM y TARTARUS ahora marcan sus resultados como simulados para impedir que se presenten como ejecución real. No se verificó una herramienta local inocua ejecutada por un agente.

## Persistencia
`better-sqlite3` no figura en las dependencias instaladas ni declaradas (`npm ls better-sqlite3 --all`: vacío). No se ha migrado el almacenamiento JSON a SQLite ni se han agregado migraciones, respaldo de datos de producción o transacciones SQLite. No se modificaron ni eliminaron datos originales. La prueba local usa un directorio temporal aislado; se comprobó la recuperación de una misión JSON tras reiniciar. No se verificó integridad ante caída ni concurrencia entre procesos.

## NEAR
En demo el identificador lleva prefijo DEMO, no se crea enlace falso de explorador, no se registra como transacción confirmada y `connected` es false. Los modos no demo siguen bloqueados por ausencia de implementación real; no se probó testnet con credenciales y no se ejecutó mainnet. Falta una integración explícita DEMO/TESTNET/MAINNET con autorización, evidencia verificable y controles de operación real. La interfaz y documentación heredadas aún requieren revisión completa de etiquetas demo.

## Evidencia
- **PASS** `npm run type-check`, comprobación posterior del frontend y build final del frontend.
- **PASS** suite final `npm test`: 50 pruebas (41 core, 7 API, 2 frontend); Turbo reutilizó caché para algunas tareas.
- **PASS** `npm run test --workspace=@hades/api -- src/websocket.test.ts` usando loopback: autenticación inválida, mensajes inválidos y restricción de eventos por rol. La primera ejecución en sandbox devolvió EACCES al conectar a loopback; se repitió con acceso local autorizado.
- **PASS** `node scripts/smoke-phase2.cjs`: health del backend, HTTP del frontend, rechazo API sin credenciales, WebSocket autenticado, creación/asignación de misión demo y lectura tras reiniciar backend. Usa credenciales temporales y almacenamiento aislado.
- **SKIPPED** lint: `npm run lint` informa que no hay tareas configuradas.
- **NOT TESTED** interacción E2E en navegador, visualización de resultados, acceso a misiones por propietario, operación real local, solicitud y reanudación real, rechazo con cancelación, recuperación de ejecución interrumpida, seguridad integral y persistencia SQLite.
- **BLOCKED** transacciones reales TESTNET: falta implementación completa y no se verificaron credenciales/configuración autorizadas. MAINNET no se ejecutó.

## Commits funcionales
- `eafe46e` autenticación y restricción conservadora WebSocket.
- `4a34854` diferenciación de resultados demo y evidencia NEAR.
- `e2a95d7` revisión solo de escalaciones pendientes e interfaz conectada.
- `836ede6` comprobación local reproducible y transporte WebSocket.

## Trabajo necesario
Diseñar propiedad y autorización coherentes para REST y WebSocket; añadir sesiones y revocación; modelar operaciones reales explícitas con suspensión y reanudación idempotente; persistir eventos y transiciones en SQLite con migraciones versionadas, copia de seguridad y transacciones; realizar recuperación ante fallos y pruebas de concurrencia; integrar herramientas autorizadas y testnet real con pruebas verificables; completar automatización E2E y auditoría de seguridad. El REST actual permite lectura de misiones a usuarios autenticados sin aislamiento por propietario, por lo que no debe exponerse como servicio multiusuario.
