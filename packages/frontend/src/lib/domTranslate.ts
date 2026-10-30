import { getLang, type Lang } from './i18n.js'

/**
 * UI string translation layer (ES -> EN) for the legacy panels.
 *  - Exact, case-insensitive matches of UI chrome only (labels, headings, states, hints, empty states).
 *  - User/mission content, reports and historical data never match a key, so they are never altered.
 *  - Original text is remembered per node, so switching back to ES restores it exactly.
 * Source of truth for the new screens (login, demo, account, dialogs) remains lib/i18n.ts.
 */
const PAIRS: Array<[string, string]> = [
  // Navigation / headings
  ['Dashboard', 'Dashboard'], ['Gestión de misiones y proyectos operativos', 'Mission and operational project management'],
  ['Centro de escalaciones y auditoría CERBERUS', 'CERBERUS escalation and audit center'],
  ['Historial completo de misiones, auditoría y NEAR txs', 'Full history of missions, audit and NEAR txs'],
  ['Motor de Seguridad & Auditoría', 'Security & Audit Engine'], ['Análisis operativo y métricas del sistema multiagente', 'Operational analysis and multi-agent system metrics'],
  ['Conexiones, configuración de políticas y estado de integraciones', 'Connections, policy configuration and integration status'],
  ['Auditoría de seguridad de sistemas', 'Systems security audit'], ['Gestión y estado operativo de todos los agentes IA', 'Management and operational status of every AI agent'],
  ['Automatizaciones programadas y tareas recurrentes', 'Scheduled automations and recurring tasks'],
  ['Consola central de instrucciones · HADES', 'Central instruction console · HADES'], ['Una visión unificada de tu sistema de agentes', 'A unified view of your agent system'],
  ['Inteligencia operativa', 'Operational intelligence'], ['Procesamiento multiagente — 6 agentes en pipeline', 'Multi-agent processing — 6 agents in a pipeline'],
  ['Dominion — control de misiones', 'Dominion — mission control'], ['Control de misiones', 'Mission control'], ['Documentos', 'Documents'], ['Documentos · auditoría', 'Documents · audit'], ['Documentos y auditoría', 'Documents and audit'],
  ['Monitor de agentes', 'Agent monitor'], ['Aprobaciones y Kanban ↓', 'Approvals and Kanban ↓'], ['Aprobaciones y tareas', 'Approvals and tasks'], ['Flujo de aprobaciones', 'Approval flow'],
  ['Salud del sistema', 'System health'], ['Registro reciente', 'Recent activity'], ['Registro de ejecución', 'Execution log'], ['Registro chronos', 'CHRONOS log'],
  ['Instrucciones rápidas', 'Quick instructions'], ['Nueva instrucción', 'New instruction'], ['Nueva misión', 'New mission'], ['+ Nueva misión', '+ New mission'], ['+ Nueva Misión', '+ New Mission'], ['Nueva misión →', 'New mission →'],
  ['Nueva misión local', 'New local mission'], ['Nuevo documento', 'New document'], ['Nueva tarea programada', 'New scheduled task'], ['Misión activa', 'Active mission'], ['Misiones activas', 'Active missions'],
  ['Decisiones requeridas', 'Decisions required'], ['Decisiones cerberus', 'CERBERUS decisions'], ['Auditoría cerberus', 'CERBERUS audit'], ['Políticas cerberus', 'CERBERUS policies'], ['Métricas cerberus', 'CERBERUS metrics'],
  ['Métricas de misiones', 'Mission metrics'], ['Progreso de misiones', 'Mission progress'], ['Actividad por agente', 'Activity by agent'], ['Agentes activos', 'Active agents'], ['Estadísticas', 'Statistics'],
  ['Tipos de operación más frecuentes', 'Most frequent operation types'], ['Últimas decisiones', 'Latest decisions'], ['Últimas operaciones', 'Latest operations'], ['Pendientes de aprobación', 'Pending approval'],
  ['Escalaciones', 'Escalations'], ['Auditoría', 'Audit'], ['Auditoría persistente', 'Persistent audit'], ['Historial', 'History'], ['Resueltas', 'Resolved'], ['Seguridad', 'Security'], ['Seguridad & Control', 'Security & Control'],
  ['Seguridad & Anomalías', 'Security & Anomalies'], ['Compras & Proveedores', 'Procurement & Vendors'], ['Finanzas & Presupuesto', 'Finance & Budget'], ['Políticas & Auditoría', 'Policies & Audit'],
  ['Validación & Políticas', 'Validation & Policies'], ['Validación & Escalaciones', 'Validation & Escalations'], ['Planificación Táctica', 'Tactical Planning'], ['Orquestador Central', 'Central Orchestrator'],
  ['IA distribuida', 'Distributed AI'], ['Mission Control', 'Mission Control'],
  // Agent descriptions
  ['Evalúa solicitudes de compra, negocia con proveedores y valida presupuestos.', 'Evaluates purchase requests, negotiates with vendors and validates budgets.'],
  ['Controla el flujo financiero, aprueba transacciones y genera reportes.', 'Controls financial flow, approves transactions and generates reports.'],
  ['Coordina todos los agentes, planifica misiones y toma decisiones de alto nivel.', 'Coordinates all agents, plans missions and makes high-level decisions.'],
  ['Diseña planes de ejecución, prioriza tareas y optimiza recursos disponibles.', 'Designs execution plans, prioritizes tasks and optimizes available resources.'],
  ['Verifica cumplimiento regulatorio y valida decisiones contra políticas internas.', 'Verifies regulatory compliance and validates decisions against internal policies.'],
  ['Análisis de anomalías y riesgos', 'Anomaly and risk analysis'], ['Auditoría de seguridad interna', 'Internal security audit'],
  // States
  ['Inactivo', 'Idle'], ['Analizando', 'Analyzing'], ['Ejecutando', 'Executing'], ['Esperando', 'Waiting'], ['Suspendido', 'Suspended'], ['Desconocido', 'Unknown'], ['Disponible', 'Available'], ['Activo', 'Active'],
  ['Completada', 'Completed'], ['Completadas', 'Completed'], ['Fallida', 'Failed'], ['Fallidas', 'Failed'], ['En progreso', 'In progress'], ['Cancelada', 'Cancelled'], ['Pendiente', 'Pending'], ['Pendientes', 'Pending'],
  ['En espera', 'Waiting'], ['Activos', 'Active'], ['Operativo', 'Operational'], ['Misión activa', 'Active mission'], ['Bajo revisión', 'Under review'], ['Sin telemetría', 'No telemetry'],
  ['API conectada', 'API connected'], ['API inactiva', 'API inactive'], ['API verificando…', 'API checking…'], ['WS activo', 'WS active'], ['WS inactivo', 'WS inactive'], ['WS clientes', 'WS clients'],
  ['Operativa', 'Operational'], ['Conectado', 'Connected'], ['Desconectado', 'Disconnected'], ['WebSocket conectado', 'WebSocket connected'], ['WebSocket desconectado', 'WebSocket disconnected'], ['Versión', 'Version'], ['Activas', 'Active'], ['Errores', 'Errors'], ['Total', 'Total'], ['Bloqueadas', 'Blocked'], ['Aprobadas', 'Approved'], ['Rechazadas', 'Rejected'],
  ['Crea una misión para ver el flujo completo: CERBERUS evaluará políticas, los 6 agentes procesarán en paralelo y NEAR registrará las decisiones en testnet.', 'Create a mission to see the full flow: CERBERUS evaluates policies, the 6 agents process in parallel and NEAR records the decisions on testnet.'],
  ['+ Nueva tarea', '+ New task'], ['Próxima:', 'Next:'], ['Esperando aprobación', 'Awaiting approval'], ['▶ Ejecutar instrucción', '▶ RUN INSTRUCTION'], ['Anomalías & Incidentes', 'Anomalies & Incidents'],
  ['CHRONOS gestiona automatizaciones locales en simulación. Las tareas activas ejecutan instrucciones reales en la API cuando el servidor está disponible. Las tareas programadas se guardan en sesión local y se reconectan al reiniciar.', 'CHRONOS manages local automations in simulation. Active tasks run real instructions on the API when the server is available. Scheduled tasks are stored in the local session and reconnect on restart.'],
  ['Motor de políticas determinista. GUARD evalúa 8 reglas. AUDIT registra hash SHA-256.', 'Deterministic policy engine. GUARD evaluates 8 rules. AUDIT records the SHA-256 hash.'],
  ['Funciones serverless en /api/health, /api/v1/agents, /api/v1/missions para preview.', 'Serverless functions at /api/health, /api/v1/agents, /api/v1/missions for preview.'],
  ['Ninguna orden de compra puede superar el límite de presupuesto aprobado', 'No purchase order may exceed the approved budget limit'],
  ['Órdenes entre 30,000 y 50,000 MXN requieren aprobación humana', 'Orders between 30,000 and 50,000 MXN require human approval'],
  ['Solo se permiten proveedores en la lista aprobada', 'Only vendors on the approved list are allowed'], ['El presupuesto disponible debe ser suficiente para la operación', 'The available budget must be sufficient for the operation'],
  ['La evaluación de proveedores siempre se permite', 'Vendor evaluation is always permitted'], ['Las operaciones de planificación siempre se permiten', 'Planning operations are always permitted'],
  ['Los reportes de anomalías siempre se permiten', 'Anomaly reports are always permitted'], ['Operaciones no cubiertas por otras reglas se permiten por defecto', 'Operations not covered by other rules are permitted by default'],
  ['Las operaciones sensibles solo pueden ser propuestas por los agentes autorizados para ese tipo', 'Sensitive operations can only be proposed by the agents authorized for that type'],
  ['Ninguna operación con importe puede superar 50,000 MXN, sin importar el agente', 'No operation with an amount may exceed 50,000 MXN, regardless of the agent'],
  ['Operaciones con importe entre 30,000 y 50,000 MXN requieren aprobación humana, sin importar el agente', 'Operations with an amount between 30,000 and 50,000 MXN require human approval, regardless of the agent'],
  ['Sin regla coincidente — PERMIT por defecto', 'No matching rule — default PERMIT'],
  ['+ Nueva misión →', '+ New mission →'], ['aprobación', 'approval'], ['% aprobación', '% approval'],
  ['Estándar', 'Standard'], ['Según cron', 'Per cron'], ['Sin respuesta', 'No response'], ['Master', 'Master'],
  // Actions
  ['Aprobar', 'Approve'], ['✓ Aprobar', '✓ APPROVE'], ['Rechazar', 'Reject'], ['✗ Rechazar', '✗ REJECT'], ['Cancelar misión', 'Cancel mission'], ['✕ Cancelar misión', '✕ Cancel mission'],
  ['Actualizar', 'Refresh'], ['↺ Actualizar', '↺ Refresh'], ['Actualizar aprobaciones', 'Refresh approvals'], ['Actualizar misiones', 'Refresh missions'], ['Copiar', 'Copy'], ['Copiar hash SHA-256', 'Copy SHA-256 hash'],
  ['Descargar informe', 'Download report'], ['Descargar reporte JSON', 'Download JSON report'], ['↓ Descargar Reporte', '↓ Download Report'], ['⬇ Informe', '⬇ Report'], ['↓ JSON', '↓ JSON'], ['Limpiar', 'Clear'],
  ['Filtrar', 'Filter'], ['Filtrar:', 'Filter:'], ['Anterior', 'Previous'], ['Siguiente', 'Next'], ['Ejecutar ahora', 'Run now'], ['Solicitar operación', 'Request operation'], ['⇄ Reasignar', '⇄ Reassign'],
  ['↺ Reiniciar', '↺ Restart'], ['✓ Crear tarea', '✓ Create task'], ['Restablecer vista', 'Reset view'], ['Pausar animación', 'Pause animation'], ['Reanudar animación', 'Resume animation'],
  ['Pausar animación orbital', 'Pause orbital animation'], ['Ahorro de energía', 'Power saver'], ['Ahorro activo', 'Power saver on'], ['Ver historial', 'View history'], ['↓ Ver historial', '↓ View history'],
  ['→ Ir al módulo de Documentos', '→ Go to the Documents module'], ['Crear primera misión en THRONE →', 'Create the first mission in THRONE →'], ['Explorer →', 'Explorer →'],
  ['Ver en NEAR Explorer (Testnet)', 'View on NEAR Explorer (Testnet)'], ['Seleccionar documento', 'Select document'], ['↓ Exportar misiones', '↓ Export missions'], ['↓ Recientes', '↓ Newest'], ['↑ Antiguas', '↑ Oldest'],
  // Empty states / hints
  ['Sin escalaciones', 'No escalations'], ['Sin misiones registradas', 'No missions recorded'], ['Sin misiones registradas — crea una desde THRONE', 'No missions recorded — create one from THRONE'],
  ['Sin misiones activas', 'No active missions'], ['Sin misiones con el filtro seleccionado', 'No missions match the selected filter'], ['Sin registros aún', 'No records yet'], ['Sin registros.', 'No records.'],
  ['Sin registros de auditoría', 'No audit records'], ['Sin datos de auditoría', 'No audit data'], ['Sin decisiones registradas aún', 'No decisions recorded yet'], ['Sin documentos procesados', 'No documents processed'],
  ['Sin transacciones aún', 'No transactions yet'], ['Sin transacciones aún — ejecuta una misión', 'No transactions yet — run a mission'], ['Sin transacciones NEAR', 'No NEAR transactions'],
  ['Sin eventos en esta página.', 'No events on this page.'], ['Sin resultados para la búsqueda', 'No results for the search'], ['Sin resultados previos.', 'No previous results.'],
  ['Sin datos — ejecuta misiones desde THRONE', 'No data — run missions from THRONE'], ['Sin actividad — ejecuta una instrucción para ver el registro', 'No activity — run an instruction to see the log'],
  ['Aparecerán aquí cuando CERBERUS requiera aprobación humana', 'They will appear here when CERBERUS requires human approval'], ['Inicia una misión para ver las decisiones de CERBERUS.', 'Start a mission to see CERBERUS decisions.'],
  ['Se crearán al ejecutar misiones con validación CERBERUS', 'Created when missions run with CERBERUS validation'], ['Las etapas se mostrarán cuando exista evidencia del servidor.', 'Stages will appear once the server provides evidence.'],
  ['Haz clic en un agente para ver su estado', 'Click an agent to see its status'], ['Plataforma lista · Sin misiones activas', 'Platform ready · No active missions'], ['Telemetría de agentes no disponible', 'Agent telemetry unavailable'],
  ['Auditoría disponible solo para ADMIN.', 'Audit available to ADMIN only.'], ['Auditoría se retiene 30 días mínimo', 'Audit is retained for at least 30 days'], ['Esperando respuesta del servidor', 'Waiting for the server response'],
  ['Procesando documento; progreso por agente no disponible…', 'Processing document; per-agent progress unavailable…'], ['Arrastra un archivo aquí o haz clic para seleccionar', 'Drag a file here or click to select'],
  ['Suelta para cargar', 'Drop to upload'], ['Zona para soltar documento', 'Document drop zone'], ['Pegar o escribir el contenido del documento aquí…', 'Paste or type the document content here…'],
  ['Buscar misión por título o ID…', 'Search mission by title or ID…'], ['Buscar por tipo de operación o agente…', 'Search by operation type or agent…'], ['Instrucción para HADES…', 'Instruction for HADES…'],
  ['Contexto adicional, requisitos y restricciones…', 'Additional context, requirements and constraints…'], ['Descripción de la tarea…', 'Task description…'], ['Nombre de la tarea…', 'Task name…'],
  ['Descripción, contexto y requerimientos', 'Description, context and requirements'], ['Título de la misión', 'Mission title'], ['Título de la operación', 'Operation title'], ['Título de la comparación multi-documental', 'Multi-document comparison title'],
  ['Datos de entrada para la operación', 'Input data for the operation'], ['Presupuesto MXN', 'Budget MXN'], ['Haz clic', 'Click'],
  // Errors / feedback
  ['Error al cancelar', 'Error cancelling'], ['Error al crear misión', 'Error creating mission'], ['Error al crear misión multi-documental', 'Error creating multi-document mission'], ['Error de conexión', 'Connection error'],
  ['Error desconocido del servidor', 'Unknown server error'], ['El contenido no puede estar vacío.', 'Content cannot be empty.'], ['No se pudieron consultar las aprobaciones.', 'Could not fetch approvals.'],
  ['No se pudieron consultar las misiones', 'Could not fetch missions'], ['No se pudieron consultar las misiones.', 'Could not fetch missions.'], ['No se pudieron consultar los documentos.', 'Could not fetch documents.'],
  ['No se pudo reasignar la tarea.', 'Could not reassign the task.'], ['No se pudo registrar la decisión.', 'Could not record the decision.'], ['Operación cancelada.', 'Operation cancelled.'],
  ['Misión cancelada antes de ejecutar', 'Mission cancelled before running'], ['Misión cancelada antes de ejecutar.', 'Mission cancelled before running.'], ['Misión creada — esperando aprobación ADMIN', 'Mission created — awaiting ADMIN approval'],
  ['Misión creada. La operación espera aprobación ADMIN.', 'Mission created. The operation awaits ADMIN approval.'], ['Misión multi-documental creada — esperando aprobación ADMIN', 'Multi-document mission created — awaiting ADMIN approval'],
  ['La decisión se registra; la operación no se reanuda automáticamente.', 'The decision is recorded; the operation does not resume automatically.'], ['La operación requerirá aprobación ADMIN antes de ejecutarse', 'The operation will require ADMIN approval before running'],
  // NEAR / policy copy
  ['NEAR simulación', 'NEAR simulation'], ['NEAR testnet · simulación', 'NEAR testnet · simulation'], ['NEAR Testnet', 'NEAR Testnet'], ['Testnet simulado', 'Simulated testnet'], ['Simulación', 'Simulation'], ['Simulación activa', 'Simulation active'],
  ['Demo — NEAR testnet simulación', 'Demo — NEAR testnet simulation'], ['Modo demo', 'Demo mode'], ['NEAR: consultar estado', 'NEAR: check status'], ['⬡ NEAR TX:', '⬡ NEAR TX:'],
  ['Simulación — No es una transacción real en NEAR Protocol', 'Simulation — Not a real transaction on NEAR Protocol'], ['Red blockchain NEAR. Modo simulación activo — no se gastan fondos reales.', 'NEAR blockchain network. Simulation mode active — no real funds are spent.'],
  ['Bloquea cualquier transacción en NEAR Mainnet', 'Blocks any transaction on NEAR Mainnet'], ['Clave privada NEAR (NO expuesta)', 'NEAR private key (NOT exposed)'], ['ID de cuenta NEAR testnet', 'NEAR testnet account ID'],
  ['Registra SHA-256 de todas las operaciones ejecutadas', 'Records SHA-256 of every executed operation'], ['Escala operaciones de contratación o pagos externos', 'Escalates hiring or external payment operations'],
  ['Rechaza operaciones que excedan $1,000,000 MXN', 'Rejects operations exceeding $1,000,000 MXN'], ['Máximo 100 operaciones por agente por hora', 'Maximum 100 operations per agent per hour'],
  ['Escalaciones sin respuesta en 24h se rechazan automáticamente', 'Escalations unanswered after 24h are automatically rejected'], ['Los agentes no pueden modificar su propio estado directamente', 'Agents cannot modify their own state directly'],
  ['Los controles de activación/suspensión afectan únicamente la simulación local · No modifican producción', 'Activation/suspension controls only affect the local simulation · They do not modify production'],
  ['Variables de entorno activas. Los valores sensibles no se exponen en el frontend.', 'Active environment variables. Sensitive values are not exposed in the frontend.'],
  ['Canal en tiempo real para eventos de agentes y misiones.', 'Real-time channel for agent and mission events.'], ['URL base de la API backend', 'Backend API base URL'], ['Entorno de ejecución', 'Runtime environment'],
  ['Todos los datos son del estado local · Actualizado en tiempo real con la actividad del sistema', 'All data is local state · Updated in real time with system activity'],
  ['Para modificar políticas: editar packages/core/src/cerberus/guard.ts · Requiere PR con revisión', 'To modify policies: edit packages/core/src/cerberus/guard.ts · Requires a reviewed PR'],
  ['Para conectar el backend real: inicia el servidor con `npm run dev` en packages/api', 'To connect the real backend: start the server with `npm run dev` in packages/api'],
  ['Variables sensibles están en .env (gitignored) · Ver packages/frontend/.env.example', 'Sensitive variables live in .env (gitignored) · See packages/frontend/.env.example'],
  ['HADES calcula el hash de la entrada solo después de aprobación ADMIN. La entrada se guarda en la base local para la revisión.', 'HADES computes the input hash only after ADMIN approval. The input is stored in the local database for review.'],
  ['Operación local verificable', 'Verifiable local operation'], ['Operación local verificable · SHA-256', 'Verifiable local operation · SHA-256'], ['Reasignar ejecutor compatible (cap:crypto:hash@1.0.0)', 'Reassign compatible executor (cap:crypto:hash@1.0.0)'],
  ['Pegar contenido', 'Paste content'],
  ['⏸ Pausar', '⏸ Pause'], ['▶ Reanudar', '▶ Resume'], ['○ En espera', '○ Waiting'], ['En cola', 'Queued'], ['Otro estado', 'Other status'], ['Todas', 'All'], ['Todos', 'All'],
  ['Solo selección visual — la demo no ejecuta tareas.', 'Visual selection only — no task is executed in the demo.'],
  // Table / metric labels
  ['Hora', 'Time'], ['Agente', 'Agent'], ['Agentes', 'Agents'], ['Operación', 'Operation'], ['Decisión', 'Decision'], ['Decisiones', 'Decisions'], ['Regla', 'Rule'], ['Modo', 'Mode'], ['Motor', 'Engine'], ['Estado', 'Status'],
  ['Título', 'Title'], ['Misión', 'Mission'], ['Misiones', 'Missions'], ['Misiones totales', 'Total missions'], ['Total Misiones', 'Total Missions'], ['Total Decisiones', 'Total Decisions'], ['Entrada', 'Input'], ['Acción', 'Action'], ['Actividad', 'Activity'],
  ['Razón:', 'Reason:'], ['Red', 'Network'], ['Sistema', 'System'], ['Resultado de tarea', 'Task result'], ['Resultados y detalles', 'Results and details'], ['Evaluaciones de política', 'Policy evaluations'],
  ['Registros inmutables', 'Immutable records'], ['Registros Audit', 'Audit records'], ['Contenciones activas', 'Active containments'], ['Políticas activadas:', 'Policies triggered:'],
  ['Mañana 02:00', 'Tomorrow 02:00'], ['Mañana 09:00', 'Tomorrow 09:00'], ['Próximo lunes', 'Next Monday'], ['En 4 horas', 'In 4 hours'], ['Cada hora', 'Every hour'], ['Cada 15 min', 'Every 15 min'], ['Diario 09:00', 'Daily 09:00'], ['Semanal lunes', 'Weekly Monday'],
  ['Limpieza de escalaciones antiguas', 'Old escalation cleanup'], ['Cierra escalaciones con más de 24h sin respuesta.', 'Closes escalations unanswered for more than 24h.'], ['Reporte diario de auditoría', 'Daily audit report'],
  ['Genera reporte de decisiones CERBERUS de las últimas 24h.', 'Generates a report of CERBERUS decisions from the last 24h.'], ['Respaldo de registros NEAR', 'NEAR records backup'], ['Exporta historial de transacciones NEAR del período.', 'Exports the NEAR transaction history for the period.'],
  ['Verificación de proveedores', 'Vendor verification'], ['Ejecuta verificación de estado de proveedores activos.', 'Runs a status check of active vendors.'], ['Revisar políticas CERBERUS y detectar anomalías en los sistemas de seguridad.', 'Review CERBERUS policies and detect anomalies in security systems.'],
  ['Evaluar proveedores cloud $50k MXN', 'Evaluate cloud vendors $50k MXN'], ['Evaluar proveedores de infraestructura cloud', 'Evaluate cloud infrastructure vendors'], ['Planificar expansión de operaciones', 'Plan operations expansion'],
  ['Plan de expansión operacional Q1', 'Q1 operational expansion plan'], ['Evaluación de proveedores de infraestructura', 'Infrastructure vendor evaluation'], ['Revisando políticas CERBERUS', 'Reviewing CERBERUS policies'], ['Evaluando proveedores y cotizaciones', 'Evaluating vendors and quotes'],
  ['Validando presupuesto disponible', 'Validating available budget'], ['Generando plan táctico de adquisición', 'Generating tactical acquisition plan'], ['Analizando misión y distribuyendo tareas', 'Analyzing mission and distributing tasks'],
  ['Ejecutando misión', 'Running mission'], ['Multi-documental', 'Multi-document'], ['CERBERUS evaluará todas las políticas · NEAR registrará en testnet (SIMULACIÓN)', 'CERBERUS will evaluate all policies · NEAR will record on testnet (SIMULATION)'],
  ['CERBERUS evaluará todas las políticas · NEAR registrará en testnet · Tecla Enter para ejecutar', 'CERBERUS will evaluate all policies · NEAR will record on testnet · Press Enter to run'],
  ['CERBERUS activo · 8 políticas', 'CERBERUS active · 8 policies'], ['CERBERUS Guard — 8 políticas', 'CERBERUS Guard — 8 policies'],
  ['Contrato Base A: Precio $10,000 USD, Garantía 12 meses.', 'Base Contract A: Price $10,000 USD, 12-month warranty.'], ['Contrato Revisado B: Precio $12,500 USD, sin garantía expresa.', 'Revised Contract B: Price $12,500 USD, no express warranty.'],
  ['Contrato Final C: Precio $9,800 USD, Garantía 24 meses, Penalización 0%.', 'Final Contract C: Price $9,800 USD, 24-month warranty, 0% penalty.'], ['3 Documentos Contrastantes:', '3 Contrasting Documents:'],
  ['Doc A (Base): Precio $10,000 USD, Garantía 12 meses...', 'Doc A (Base): Price $10,000 USD, 12-month warranty...'], ['Doc B (Riesgo): Precio $12,500 USD, sin garantía expresa...', 'Doc B (Risk): Price $12,500 USD, no express warranty...'],
  ['Doc C (Dispar): Precio $9,800 USD, Penalización 0%...', 'Doc C (Mismatch): Price $9,800 USD, 0% penalty...'], ['▶ Demo: TechCore Industries $50k', '▶ Demo: TechCore Industries $50k'],
  ['· Análisis de negocio incluido · PDF: extracción textual (no OCR)', '· Business analysis included · PDF: text extraction (no OCR)'], ['· Máx:', '· Max:'], ['Texto (.txt)', 'Text (.txt)'],
]

const MAP = new Map<string, string>(PAIRS.map(([es, en]) => [es.toLowerCase(), en]))
const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(misiones|auditoría|near txs|escalaciones|registros|documentos) \((\d+)\)$/i, m => `${({ misiones: 'Missions', 'auditoría': 'Audit', 'near txs': 'NEAR TXs', escalaciones: 'Escalations', registros: 'Records', documentos: 'Documents' } as Record<string, string>)[m[1]!.toLowerCase()]} (${m[2]})`],
  [/^(\d+)% aprobación$/i, m => `${m[1]}% approval`],
  [/^(todas|todos) \((\d+)\)$/i, m => `All (${m[2]})`],
  [/^(ampliar|reducir) (.+)$/i, m => { const d = MAP.get(m[2]!.trim().toLowerCase()); return `${m[1]!.toLowerCase() === 'ampliar' ? 'Expand' : 'Collapse'} ${d ?? m[2]}` }],
  [/^capacidad (\S+) ejecutada por adaptador determinista$/i, m => `Capability ${m[1]} executed by deterministic adapter`],
  [/^regla (R-\d+): (.*)$/i, m => { const d = MAP.get(m[2]!.trim().toLowerCase()); return `Rule ${m[1]}: ${d ?? m[2]}` }],
  [/^Pipeline real \(sin simulación\):(.*)Formatos:(.*)$/i, m => `Real pipeline (no simulation):${m[1]}Formats:${m[2]}`],
  [/^(\d+) misi(?:ón|ones) activas?$/i, m => `${m[1]} ACTIVE MISSION${m[1] === '1' ? '' : 'S'}`],
  [/^(\d+) aprobaciones? pendientes?$/i, m => `${m[1]} PENDING APPROVAL${m[1] === '1' ? '' : 'S'}`],
  [/^(\d+) pendientes?$/i, m => `${m[1]} PENDING`],
  [/^(\d+) agentes?$/i, m => `${m[1]} AGENTS`],
  [/^(\d+) escalaci(?:ón|ones)$/i, m => `${m[1]} escalation${m[1] === '1' ? '' : 's'}`],
  [/^(\d+) documentos?$/i, m => `${m[1]} document${m[1] === '1' ? '' : 's'}`],
]
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG'])
const ATTRS = ['placeholder', 'title', 'aria-label']

function translateText(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length < 3) return null
  let hit = MAP.get(trimmed.toLowerCase())
  if (hit === undefined) { for (const [re, fn] of PATTERNS) { const m = trimmed.match(re); if (m) { hit = fn(m); break } } }
  if (hit === undefined) return null
  const allCaps = trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(trimmed)
  const out = allCaps && hit !== hit.toUpperCase() && hit.length < 60 ? hit.toUpperCase() : hit
  return raw.replace(trimmed, out)
}

const originals = new WeakMap<Node, string>()      // text node -> original ES
const written = new WeakMap<Node, string>()        // text node -> last EN text we wrote
const attrOriginals = new WeakMap<Element, Record<string, string>>()
let observer: MutationObserver | null = null

function applyText(node: Text, lang: Lang): void {
  const parent = node.parentElement
  if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest('[data-no-translate], pre, textarea')) return
  const current = node.data
  if (lang === 'es') {
    const orig = originals.get(node)
    if (orig !== undefined && written.get(node) === current) { node.data = orig; originals.delete(node); written.delete(node) }
    return
  }
  if (written.get(node) === current) return          // already our translation
  const translated = translateText(current)
  if (translated !== null && translated !== current) { originals.set(node, current); written.set(node, translated); node.data = translated }
  else { originals.delete(node); written.delete(node) }
}
function applyAttrs(el: Element, lang: Lang): void {
  let store = attrOriginals.get(el)
  for (const name of ATTRS) {
    const val = el.getAttribute(name)
    if (val === null) continue
    if (lang === 'es') { if (store && name in store && el.getAttribute(name) !== store[name]) { el.setAttribute(name, store[name]!); delete store[name] } continue }
    const translated = translateText(val)
    if (translated !== null && translated !== val) { store = store ?? {}; store[name] = val; attrOriginals.set(el, store); el.setAttribute(name, translated) }
  }
}
function walk(root: Node, lang: Lang): void {
  if (root.nodeType === Node.TEXT_NODE) { applyText(root as Text, lang); return }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const el = root as Element
  if (SKIP_TAGS.has(el.tagName) || el.closest('[data-no-translate]')) return
  applyAttrs(el, lang)
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n: Node | null = tw.nextNode()
  while (n) { if (n.nodeType === Node.TEXT_NODE) applyText(n as Text, lang); else applyAttrs(n as Element, lang); n = tw.nextNode() }
}

/** Starts the translation layer; returns a stop function. Re-run with setLang() to switch languages live. */
export function startDomTranslation(): () => void {
  const run = () => { observer?.disconnect(); walk(document.body, getLang()); observe() }
  const observe = () => observer?.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  observer = new MutationObserver(records => {
    observer?.disconnect()
    const lang = getLang()
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(n => walk(n, lang))
      else if (r.type === 'characterData') applyText(r.target as Text, lang)
      else if (r.type === 'attributes') applyAttrs(r.target as Element, lang)
    }
    observe()
  })
  observer = observer ?? null
  run()
  const onLang = () => run()
  window.addEventListener('hades:lang', onLang)
  return () => { observer?.disconnect(); observer = null; window.removeEventListener('hades:lang', onLang) }
}
export function translateForTest(text: string): string | null { return translateText(text) }
