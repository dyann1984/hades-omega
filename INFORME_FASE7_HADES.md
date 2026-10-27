# HADES OMEGA — Informe de Fase 7

Fecha: 27 de octubre de 2026. Rama: `codex/recovery-omega-20261026`. Estado inicial: `dd712f6`. **La fase permanece incompleta y HADES no está listo para producción.**

## Recuperación
Se conservaron los cambios de Claude en `App.tsx`, `Sidebar.tsx` y el nuevo `CommandCenter.tsx`. Antes de modificarlos se guardaron el diff, una copia del componente y los tres scripts auxiliares sin seguimiento en `recovery-20261027-phase7/`. Se conservaron también los respaldos anteriores. No se leyeron contraseñas de respaldos, no se reutilizaron tokens bootstrap ni se crearon cuentas en la base existente.

El sondeo de puertos 3001, 3002, 5180 y 5182 no devolvió listeners visibles en el entorno disponible; la consulta CIM de procesos fue denegada, por lo que no constituye una auditoría completa del host. El proxy Vite usa `HADES_PROXY_TARGET`, por defecto 3001; WebSocket ahora utiliza el proxy del mismo origen cuando no hay `VITE_WS_URL` explícita. Una URL explícita aún puede apuntar a otra instancia y debe configurarse junto con el proxy. La base local identificada fue `packages/api/data/hades.json.sqlite`; una consulta de solo lectura mostró una cuenta y tres sesiones, ninguna vigente. No se consultaron credenciales ni tokens.

## Cambios y estado por módulo
- **Mission Control — parcial:** la lista usa `GET /api/v1/missions`; el panel crea, muestra, cancela y enseña el SHA-256 de la operación local. No implementa selección general de agentes ni ejecución empresarial arbitraria. La misión demo heredada sigue siendo simulada.
- **Agent Monitor — parcial:** consume el endpoint real ADMIN y eventos WebSocket. La API expone seis agentes registrados; CERBERUS se presenta como desconocido, no como un séptimo agente ficticio. Usuarios sin permiso reciben estado desconocido.
- **Núcleo — parcial:** el componente usa el estado de agentes disponible y oculta la representación activa cuando no hay telemetría. La captura E2E usa movimiento reducido y el fallback SVG; no verifica visualmente la animación WebGL ni comportamiento con GPU.
- **Task Kanban — parcial:** traduce estados reales de tareas, incluye errores, cancelaciones, desconocidos y cuenta dependencias. No implementa arrastrar y reasignar tareas.
- **Approval Gate — parcial:** ADMIN consulta solicitudes locales, ve la entrada completa y puede aprobar o rechazar con justificación. La operación SHA-256 local se ejecuta realmente tras aprobar. El circuito genérico de escalaciones de negocio no está implementado.
- **Document Intelligence Hub — parcial:** muestra resultados reales del pipeline y enlaza al módulo documental existente. Se verificó procesamiento de TXT en la API y visualización del resultado en Command Center. PDF y DOCX tienen pruebas con parsers simulados; multi-upload, comparación y exportación masiva no se completaron.
- **Audit Trail y System Health — parciales:** muestran eventos recibidos durante la sesión y health/API/WebSocket. El panel advierte que no es historial persistente completo; no se implementaron métricas detalladas SQLite ni una vista de auditoría durable completa.

## Seguridad y autenticación
La API existente exige sesiones y roles, restringe misiones y documentos por propietario y limita la decisión de aprobación a ADMIN. Los ensayos incluyen revocación REST/WebSocket y aislamiento. Se corrigió la exposición de mensajes internos de errores PDF/DOCX y se aplica un límite al texto extraído antes de procesarlo. El análisis de documentos sigue requiriendo límites de recursos y aislamiento de parsers frente a archivos hostiles. `npm audit --omit=dev` reportó una vulnerabilidad moderada de `uuid`, sin altas ni críticas reportadas en dependencias de producción; esto no sustituye una auditoría de seguridad integral.

## Pruebas
- **PASS** `npm run type-check` en los tres paquetes y build del frontend. El bundle Three.js supera 500 kB y Vite emitió una advertencia de tamaño.
- **PASS** `npm test` con acceso local autorizado: **97 pruebas** (41 core, 51 API, 5 frontend); Turbo reutilizó dos tareas en caché. Incluye las tres pruebas nuevas de mapeo del Command Center y una de límite de texto extraído. Las pruebas PDF/DOCX señaladas usan mocks.
- **PASS** `node scripts/e2e-phase7.cjs` con Edge, backend real y SQLite temporal: login con contraseñas de prueba, consulta de seis agentes, conexión WebSocket, creación de misión, aprobación ADMIN, resultado SHA-256, reinicio, recuperación, cancelación pendiente, procesamiento TXT, visualización de documento, logout, revocación y rechazo de acceso de otro usuario a misión y documento. No usa tokens bootstrap ni JWT manuales. El TXT se envió por API y se verificó su resultado en la interfaz; no se probó el upload documental desde navegador.
- **PASS** las pruebas específicas de errores y límite de extracción PDF/DOCX (8 pruebas; parser simulado).
- **FAIL de infraestructura resuelto para la suite:** el primer intento en sandbox no pudo renombrar temporales (`EPERM`); usando un temporal del espacio de trabajo se ejecutaron pruebas, pero cuatro conexiones WebSocket fallaron por `EACCES`. Con acceso local autorizado la suite completa pasó.
- **FAIL de infraestructura resuelto para E2E:** el primer intento aislado no alcanzó `127.0.0.1:44191/health`; con acceso local autorizado el recorrido pasó.
- **SKIPPED / NOT TESTED:** animación WebGL en navegador con GPU, UI de carga documental, OCR, PDF/DOCX reales de extremo a extremo, reasignación de tareas, prueba de carga, auditoría de seguridad independiente y transacciones reales NEAR.

## Captura
`evidence-fase7/command-center.png`: resultado de misión y estado de servicios en Edge headless con movimiento reducido; muestra el fallback SVG, no prueba animación 3D. Generada con datos y cuentas temporales.

## Riesgos y próximos pasos
Completar telemetría real de CERBERUS y autorización segura para visualización por rol; verificar WebGL y accesibilidad; implementar flujo durable de misión genérica, dependencias y reasignación autorizada; conectar escalaciones reales, persistencia y trazabilidad por misión; añadir vistas y pruebas para procesamiento documental desde UI; aislar y limitar parsers PDF/DOCX; resolver el aviso moderado de `uuid`; auditar el manejo de sesiones, claves, datos y concurrencia antes de producción. NEAR permanece en simulación y no se ejecutaron transacciones reales ni se habilitaron servicios de pago.

## Commits
- `dd712f6`: punto de partida de Claude.
- `8d15d7f`: Command Center recuperado, conexiones de datos, comprobaciones y E2E inicial.
- El ajuste final del E2E y este informe se registran en un commit posterior. Los scripts auxiliares de Claude se preservan sin seguimiento y no se incluyen en commits.
