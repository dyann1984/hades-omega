/**
 * HADES guide knowledge base. Every entry is written from the project's own sources (README.md, docs/, the panels'
 * own subtitles, packages/core/src/cerberus/policy.ts, packages/api/src/demo.ts) and lists them in `sources`.
 * This is a curated, documented knowledge base - NOT a generative model. `implemented: false` marks things the
 * platform does not do (yet), so the guide admits it instead of inventing an answer.
 */
export type Lang = 'es' | 'en'
export interface Bi { es: string; en: string }
export interface KnowledgeEntry {
  id: string
  /** Search terms (any language, accents optional). A hit on `title` words counts double. */
  keywords: string[]
  title: Bi
  answer: Bi
  sources: string[]
  implemented: boolean
  /** Follow-up questions to offer after this answer (entry ids). */
  next?: string[]
}

export const AGENTS_LIST = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS', 'CERBERUS'] as const

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'what', keywords: ['hades omega', 'que es', 'what is', 'plataforma', 'platform', 'para que sirve', 'purpose', 'resumen', 'overview', 'acerca', 'about', 'proposito'],
    title: { es: '¿Qué es HADES OMEGA?', en: 'What is HADES OMEGA?' },
    answer: {
      es: 'HADES OMEGA es un sistema operativo empresarial donde agentes de IA colaboran para ejecutar misiones de negocio: evaluar proveedores, controlar presupuestos, validar operaciones y dejar un registro de decisiones verificable. Cada agente tiene un dominio, y el cumplimiento de políticas lo decide CERBERUS con reglas deterministas, no con inferencia de un modelo.',
      en: 'HADES OMEGA is an enterprise operating system where AI agents collaborate on business missions: evaluating vendors, controlling budgets, validating operations and leaving a verifiable decision record. Each agent owns a domain, and policy compliance is decided by CERBERUS with deterministic rules, not model inference.',
    },
    sources: ['README.md'], implemented: true, next: ['agents', 'cerberus', 'sections'],
  },
  {
    id: 'agents', keywords: ['agentes', 'agente', 'cada agente', 'each agent', 'agents', 'siete', 'seven', 'siete agentes', 'quienes', 'who', 'equipo', 'team', 'todos los agentes'],
    title: { es: 'Los siete agentes', en: 'The seven agents' },
    answer: {
      es: 'Son siete: HADES (orquestador central), CHARON (compras y proveedores), PERSEPHONE (finanzas y presupuestos), MINOS (validación y políticas), ELYSIUM (planificación estratégica), TARTARUS (anomalías e integridad) y CERBERUS (seguridad y control: guardián de políticas y auditoría). Pregúntame por cualquiera por su nombre.',
      en: 'There are seven: HADES (central orchestrator), CHARON (procurement and vendors), PERSEPHONE (finance and budgets), MINOS (validation and policies), ELYSIUM (strategic planning), TARTARUS (anomalies and integrity) and CERBERUS (security and control: policy and audit guardian). Ask me about any of them by name.',
    },
    sources: ['README.md', 'packages/api/src/demo.ts'], implemented: true, next: ['hades', 'charon', 'cerberus'],
  },
  {
    id: 'hades', keywords: ['hades agente', 'orquestador', 'orchestrator', 'central', 'descompone', 'hades'],
    title: { es: 'HADES (orquestador)', en: 'HADES (orchestrator)' },
    answer: { es: 'HADES es el orquestador central: recibe una misión, la descompone en tareas y las asigna al agente adecuado. Coordina a los demás; las decisiones de política las toma CERBERUS.', en: 'HADES is the central orchestrator: it receives a mission, breaks it into tasks and assigns each to the right agent. It coordinates the others; policy decisions are made by CERBERUS.' },
    sources: ['README.md'], implemented: true,
  },
  {
    id: 'charon', keywords: ['charon', 'compras', 'proveedores', 'procurement', 'vendors', 'negociacion', 'cotizaciones'],
    title: { es: 'CHARON (compras)', en: 'CHARON (procurement)' },
    answer: { es: 'CHARON se ocupa de compras y proveedores: evalúa solicitudes de compra, compara proveedores y valida cotizaciones. En la demo trabaja sobre datos ficticios.', en: 'CHARON handles procurement and vendors: it evaluates purchase requests, compares vendors and checks quotes. In the demo it works on fictional data.' },
    sources: ['README.md', 'packages/core/src/agents/charon.ts'], implemented: true,
  },
  {
    id: 'persephone', keywords: ['persephone', 'finanzas', 'presupuesto', 'presupuestos', 'finance', 'budget', 'budgets'],
    title: { es: 'PERSEPHONE (finanzas)', en: 'PERSEPHONE (finance)' },
    answer: { es: 'PERSEPHONE controla finanzas y presupuestos: verifica que haya presupuesto disponible y alerta de desvíos antes de que una operación avance.', en: 'PERSEPHONE controls finance and budgets: it checks that budget is available and flags deviations before an operation moves on.' },
    sources: ['README.md', 'packages/core/src/agents/persephone.ts'], implemented: true,
  },
  {
    id: 'minos', keywords: ['minos', 'validacion', 'validation', 'politicas', 'policies', 'autorizacion humana', 'validar'],
    title: { es: 'MINOS (validación)', en: 'MINOS (validation)' },
    answer: { es: 'MINOS valida operaciones y gestiona las escalaciones: cuando CERBERUS decide ESCALATE, el caso llega a MINOS y a una persona para su aprobación.', en: 'MINOS validates operations and handles escalations: when CERBERUS decides ESCALATE, the case goes to MINOS and to a human for approval.' },
    sources: ['README.md', 'packages/core/src/agents/minos.ts'], implemented: true,
  },
  {
    id: 'elysium', keywords: ['elysium', 'planificacion', 'planning', 'plan', 'estrategica', 'optimizacion', 'recursos'],
    title: { es: 'ELYSIUM (planificación)', en: 'ELYSIUM (planning)' },
    answer: { es: 'ELYSIUM diseña planes de ejecución, prioriza tareas y optimiza los recursos disponibles.', en: 'ELYSIUM designs execution plans, prioritizes tasks and optimizes available resources.' },
    sources: ['README.md', 'packages/core/src/agents/elysium.ts'], implemented: true,
  },
  {
    id: 'tartarus', keywords: ['tartarus', 'anomalias', 'anomalies', 'integridad', 'integrity', 'incidentes', 'incidents', 'seguridad interna'],
    title: { es: 'TARTARUS (anomalías)', en: 'TARTARUS (anomalies)' },
    answer: { es: 'TARTARUS detecta anomalías y atiende incidentes; también recibe los casos que CERBERUS deniega por la regla R-007 (reportes de incidente).', en: 'TARTARUS detects anomalies and handles incidents; it also receives the cases CERBERUS denies under rule R-007 (incident reports).' },
    sources: ['README.md', 'packages/core/src/agents/tartarus.ts', 'packages/core/src/cerberus/guard.ts'], implemented: true,
  },
  {
    id: 'cerberus', keywords: ['cerberus', 'guardian', 'guard', 'politicas de seguridad', 'permit', 'deny', 'escalate', 'reglas', 'rules', 'seguridad', 'security', 'auditoria cerberus'],
    title: { es: 'CERBERUS', en: 'CERBERUS' },
    answer: {
      es: 'CERBERUS es el motor de seguridad. GUARD evalúa cada operación contra reglas codificadas y responde PERMIT, DENY o ESCALATE; AUDIT registra cada decisión con un hash encadenado; RESPONSE define acciones como WARN o BLOCK. Ejemplos de reglas: ninguna operación puede superar 50,000 MXN y las de 30,000 a 50,000 MXN exigen aprobación humana. Es código determinista: el mismo caso da siempre el mismo resultado.',
      en: 'CERBERUS is the security engine. GUARD evaluates each operation against coded rules and answers PERMIT, DENY or ESCALATE; AUDIT records every decision with a chained hash; RESPONSE defines actions such as WARN or BLOCK. Example rules: no operation may exceed 50,000 MXN, and 30,000 to 50,000 MXN require human approval. It is deterministic code: the same case always gives the same result.',
    },
    sources: ['README.md', 'packages/core/src/cerberus/policy.ts'], implemented: true, next: ['approval', 'audit'],
  },
  {
    id: 'approval', keywords: ['approval gate', 'aprobacion', 'aprobar', 'como apruebo', 'how do i approve', 'how to approve', 'approve', 'apruebo', 'humano', 'human', 'escalacion', 'escalation', 'gate', 'rechazar', 'reject', 'justificacion'],
    title: { es: 'Approval Gate', en: 'Approval Gate' },
    answer: {
      es: 'El Approval Gate detiene la misión hasta que una persona la aprueba o la rechaza. Cuando CERBERUS escala una operación, queda pendiente; quien decide debe dar una justificación y la decisión se audita. La operación no se reanuda sola. Yo no puedo aprobar ni rechazar nada: eso solo lo hace una persona autorizada en la interfaz.',
      en: 'The Approval Gate halts the mission until a person approves or rejects it. When CERBERUS escalates an operation it stays pending; the decider must give a justification and the decision is audited. The operation does not resume by itself. I cannot approve or reject anything: only an authorized person does that in the interface.',
    },
    sources: ['packages/api/src/demo.ts', 'packages/frontend/src/pages/JudgmentPanel.tsx'], implemented: true, next: ['missions', 'cerberus'],
  },
  {
    id: 'audit', keywords: ['auditoria', 'audit', 'hash', 'sha-256', 'sha256', 'trazabilidad', 'registro', 'verificable', 'verifiable', 'sello', 'seal'],
    title: { es: 'Auditoría y sello SHA-256', en: 'Audit and SHA-256 seal' },
    answer: {
      es: 'Cada decisión de CERBERUS queda en una auditoría encadenada por hash. En la demo, esa auditoría está aislada en tu sesión, y el informe de una misión lleva un sello SHA-256 que se calcula de verdad y puede verificarse.',
      en: 'Every CERBERUS decision is stored in a hash-chained audit trail. In the demo that trail is isolated in your session, and a mission report carries a SHA-256 seal that is genuinely computed and verifiable.',
    },
    sources: ['packages/api/src/demo.ts', 'README.md'], implemented: true,
  },
  {
    id: 'missions', keywords: ['mision', 'misiones', 'mission', 'missions', 'crear mision', 'create mission', 'nueva mision', 'new mission', 'como empiezo', 'how do i start', 'guiar', 'guide me', 'instruccion', 'documentos', 'throne'],
    title: { es: 'Crear una misión', en: 'Create a mission' },
    answer: {
      es: 'Para crear una misión: 1) abre Command y pulsa «+ Nueva misión» (o usa Throne para dar una instrucción a HADES); 2) escribe un título y los datos de entrada, o elige el modo multi-documental; 3) envía: CERBERUS evalúa las políticas y, si corresponde, la misión queda esperando aprobación humana; 4) tras aprobarla, revisa resultados y el informe con su sello SHA-256. En modo DEMO, el recorrido guiado de la sección Demo ejecuta un caso completo sobre datos ficticios por ti.',
      en: 'To create a mission: 1) open Command and press "+ New mission" (or use Throne to give HADES an instruction); 2) write a title and the input data, or pick the multi-document mode; 3) submit: CERBERUS evaluates the policies and, if needed, the mission waits for human approval; 4) after approval, review the results and the report with its SHA-256 seal. In DEMO mode, the guided tour in the Demo section runs a full case on fictional data for you.',
    },
    sources: ['packages/frontend/src/pages/CommandCenter.tsx', 'packages/frontend/src/pages/ThronePanel.tsx', 'packages/frontend/src/pages/DemoTour.tsx'], implemented: true, next: ['approval', 'demo'],
  },
  {
    id: 'hologram', keywords: ['holograma', 'hologram', 'nucleo', 'core', 'esfera', 'nodo', 'nodos', 'node', 'nodes', 'orbita', 'rayo', 'beam', 'visual', 'hades core'],
    title: { es: 'El holograma', en: 'The hologram' },
    answer: {
      es: 'El holograma (HADES Core) es una vista 3D del sistema: el núcleo dorado es HADES y los nodos que orbitan son los demás agentes, cada uno con su color. Al tocar un nodo se ilumina, un rayo de energía lo conecta con el núcleo y se muestra su función y su estado real. Es una representación visual: seleccionar un agente no ejecuta ninguna tarea. Puedes rotar, hacer zoom, pausar y restablecer la vista.',
      en: 'The hologram (HADES Core) is a 3D view of the system: the golden core is HADES and the orbiting nodes are the other agents, each with its own color. Touching a node lights it up, an energy beam links it to the core and its function and real status are shown. It is a visual representation: selecting an agent does not run any task. You can rotate, zoom, pause and reset the view.',
    },
    sources: ['packages/frontend/src/components/HolographicCore3D.tsx', 'packages/frontend/src/pages/CommandCenter.tsx'], implemented: true,
  },
  {
    id: 'near', keywords: ['near', 'blockchain', 'testnet', 'transaccion', 'transaction', 'simulacion', 'simulation', 'on-chain', 'cadena', 'wallet'],
    title: { es: 'NEAR (simulación)', en: 'NEAR (simulation)' },
    answer: {
      es: 'Importante: NEAR funciona actualmente en modo simulación. No se firma ni se envía ninguna transacción real y no se gastan fondos. La arquitectura prevé registrar hashes de auditoría en NEAR Testnet, pero esa escritura real todavía no está activa en esta demo.',
      en: 'Important: NEAR currently runs in simulation mode. No real transaction is signed or sent and no funds are spent. The architecture plans to record audit hashes on NEAR Testnet, but that real writing is not active in this demo yet.',
    },
    sources: ['packages/api/src/demo.ts', 'README.md'], implemented: false,
  },
  {
    id: 'llm', keywords: ['ia generativa', 'generative', 'llm', 'claude', 'modelo', 'model', 'chatgpt', 'inteligencia artificial', 'artificial intelligence', 'eres una ia', 'are you an ai', 'quien eres', 'who are you', 'como funcionas', 'how do you work'],
    title: { es: 'Qué soy yo', en: 'What I am' },
    answer: {
      es: 'Soy la guía de HADES: respondo con una base de conocimiento documentada del proyecto, no con IA generativa. Por eso solo contesto lo que está escrito en la documentación y te aviso cuando algo no está implementado. La planificación con LLM (Claude) tampoco está activa en la demo; la arquitectura permite conectar un modelo más adelante.',
      en: 'I am the HADES guide: I answer from a documented knowledge base of the project, not with generative AI. That is why I only answer what the documentation says and tell you when something is not implemented. LLM planning (Claude) is also not enabled in the demo; the architecture allows plugging in a model later.',
    },
    sources: ['packages/api/src/demo.ts'], implemented: true,
  },
  {
    id: 'demo', keywords: ['demo', 'demostracion', 'jueces', 'judges', 'sesion temporal', 'datos ficticios', 'fictional', 'aislada', 'isolated', 'privacidad', 'privacy', 'datos reales', 'real data', 'recorrido', 'tour'],
    title: { es: 'Modo DEMO', en: 'DEMO mode' },
    answer: {
      es: 'El modo DEMO es una sesión temporal y aislada con datos ficticios: cada visitante tiene su propia base en memoria, con su propia instancia de CERBERUS; nada se mezcla con datos reales ni con otros visitantes. La sesión caduca a los 30 minutos y hay un límite de ejecuciones. Cada capacidad está etiquetada: REAL, DETERMINISTA, SIMULADA o NO DISPONIBLE.',
      en: 'DEMO mode is a temporary, isolated session with fictional data: each visitor gets their own in-memory database with its own CERBERUS instance; nothing mixes with real data or other visitors. The session expires after 30 minutes and runs are limited. Every capability is labeled: REAL, DETERMINISTIC, SIMULATED or NOT AVAILABLE.',
    },
    sources: ['packages/api/src/demo.ts', 'packages/api/src/security.ts'], implemented: true,
  },
  {
    id: 'sections', keywords: ['secciones', 'sections', 'menu', 'navegacion', 'navigation', 'paginas', 'pages', 'trece', 'thirteen', '13', 'catorce', 'fourteen', '14', 'quince', 'fifteen', '15', 'barra lateral', 'sidebar', 'que puedo ver', 'what can i see'],
    title: { es: 'Las 15 secciones', en: 'The 15 sections' },
    answer: {
      es: 'Las 15 secciones del menú: Dashboard (resumen y holograma), Throne (consola de instrucciones a HADES), Pantheon (agentes y su estado), Dominion (misiones y proyectos), Chronos (automatizaciones programadas), Oracle (análisis operativo), Vault (conexiones, políticas e integraciones), Judgment (escalaciones y aprobaciones), Archives (historial de misiones, auditoría y NEAR), Cerberus (motor de seguridad y auditoría), Observatory (métricas), Documentos (análisis multiagente de documentos), Command (centro de comando), Auditoría (flujo de auditoría empresarial) y NEAR (registro de auditoría en testnet). Pregúntame por cualquiera.',
      en: 'The 15 menu sections: Dashboard (overview and hologram), Throne (instruction console for HADES), Pantheon (agents and their status), Dominion (missions and projects), Chronos (scheduled automations), Oracle (operational analysis), Vault (connections, policies and integrations), Judgment (escalations and approvals), Archives (mission, audit and NEAR history), Cerberus (security and audit engine), Observatory (metrics), Documents (multi-agent document analysis), Command (command center), Audit (enterprise audit flow) and NEAR (audit registry on testnet). Ask me about any of them.',
    },
    sources: ['packages/frontend/src/components/Sidebar.tsx'], implemented: true, next: ['command', 'judgment', 'chronos'],
  },
  ...([
    ['dashboard', ['dashboard', 'hq', 'inicio', 'home', 'resumen general'], 'Dashboard', 'Resumen del sistema: estado de la API y del WebSocket, métricas, el holograma y la actividad reciente.', 'System overview: API and WebSocket status, metrics, the hologram and recent activity.', 'packages/frontend/src/pages/Dashboard.tsx'],
    ['throne', ['throne', 'trono', 'consola', 'console', 'instruccion a hades', 'instruct hades'], 'Throne', 'Consola central de instrucciones: aquí le das una orden a HADES para iniciar una operación; pasa por CERBERUS antes de ejecutarse.', 'Central instruction console: here you give HADES an order to start an operation; it goes through CERBERUS before running.', 'packages/frontend/src/pages/ThronePanel.tsx'],
    ['pantheon', ['pantheon', 'panteon', 'gestion de agentes', 'agent management'], 'Pantheon', 'Gestión y estado operativo de todos los agentes: qué hace cada uno y en qué estado está.', 'Management and operational status of every agent: what each one does and its current state.', 'packages/frontend/src/pages/PantheonPanel.tsx'],
    ['dominion', ['dominion', 'dominio', 'proyectos', 'projects', 'control de misiones', 'mission control'], 'Dominion', 'Gestión de misiones y proyectos operativos: lista, filtra y revisa misiones.', 'Management of missions and operational projects: list, filter and review missions.', 'packages/frontend/src/pages/DominionPanel.tsx'],
    ['chronos', ['chronos', 'cronos', 'automatizaciones', 'automations', 'programadas', 'scheduled', 'cron', 'tareas recurrentes'], 'Chronos', 'Automatizaciones programadas y tareas recurrentes, guardadas en la base de datos del servidor y ejecutadas por un planificador con reintentos y recuperación tras reinicios. Solo existen trabajos registrados de solo lectura (verificar cadena de auditoría, informe de decisiones CERBERUS, resumen de aprobaciones); cualquier otra operación se deniega. Los horarios cron son UTC.', 'Scheduled automations and recurring tasks, stored in the server database and run by a scheduler with retries and restart recovery. Only registered read-only jobs exist (verify the audit chain, CERBERUS decision report, approvals digest); any other operation is denied. Cron schedules are UTC.', 'packages/frontend/src/pages/ChronosPanel.tsx'],
    ['oracle', ['oracle', 'oraculo', 'analisis', 'analytics', 'metricas del sistema'], 'Oracle', 'Análisis operativo y métricas del sistema multiagente.', 'Operational analysis and multi-agent system metrics.', 'packages/frontend/src/pages/OraclePanel.tsx'],
    ['vault', ['vault', 'boveda', 'conexiones', 'connections', 'integraciones', 'integrations', 'configuracion'], 'Vault', 'Conexiones, configuración de políticas y estado de integraciones (API, WebSocket, NEAR). Los valores sensibles nunca se muestran en el frontend.', 'Connections, policy configuration and integration status (API, WebSocket, NEAR). Sensitive values are never shown in the frontend.', 'packages/frontend/src/pages/VaultPanel.tsx'],
    ['judgment', ['judgment', 'juicio', 'escalaciones', 'escalations', 'pendientes de aprobacion'], 'Judgment', 'Centro de escalaciones y auditoría CERBERUS: aquí una persona aprueba o rechaza lo que CERBERUS escaló, siempre con justificación.', 'Escalation and CERBERUS audit center: here a person approves or rejects what CERBERUS escalated, always with a justification.', 'packages/frontend/src/pages/JudgmentPanel.tsx'],
    ['archives', ['archives', 'archivos', 'historial', 'history', 'registro historico'], 'Archives', 'Historial completo de misiones, auditoría y transacciones NEAR (estas últimas simuladas).', 'Full history of missions, audit and NEAR transactions (the latter simulated).', 'packages/frontend/src/pages/ArchivesPanel.tsx'],
    ['cerberus-page', ['seccion cerberus', 'cerberus panel', 'panel cerberus', 'motor de seguridad'], 'Cerberus (sección)', 'Motor de seguridad y auditoría: las reglas de política, las decisiones recientes y la integridad de la auditoría.', 'Security and audit engine: the policy rules, recent decisions and audit integrity.', 'packages/frontend/src/pages/CerberusPanel.tsx'],
    ['observatory', ['observatory', 'observatorio', 'metricas', 'metrics', 'actividad por agente'], 'Observatory', 'Métricas de misiones, métricas de CERBERUS, NEAR Testnet (simulada) y actividad por agente.', 'Mission metrics, CERBERUS metrics, NEAR Testnet (simulated) and activity per agent.', 'packages/frontend/src/pages/ObservatoryPanel.tsx'],
    ['documents', ['documentos', 'documents', 'archivo', 'subir documento', 'upload', 'pdf', 'docx', 'analisis de documentos'], 'Documentos', 'Procesamiento multiagente de documentos: sube o pega un documento y se analiza con reglas (importes, porcentajes, cláusulas). Es análisis determinista, no de IA generativa; en PDF solo extrae texto (sin OCR).', 'Multi-agent document processing: upload or paste a document and it is analyzed with rules (amounts, percentages, clauses). It is deterministic analysis, not generative AI; for PDFs it only extracts text (no OCR).', 'packages/frontend/src/pages/DocumentsPanel.tsx'],
    ['command', ['command', 'comando', 'centro de comando', 'command center', 'kanban', 'salud del sistema'], 'Command', 'Centro de comando: estado de API/WS, monitor de agentes, el holograma HADES Core, control de misiones, flujo de aprobaciones tipo kanban y documentos/auditoría.', 'Command center: API/WS status, agent monitor, the HADES Core hologram, mission control, a kanban-style approval flow and documents/audit.', 'packages/frontend/src/pages/CommandCenter.tsx'],
    ['auditoria-page', ['auditoria', 'audit page', 'seccion auditoria', 'auditoria empresarial', 'enterprise audit', 'audit flow', 'flujo de auditoria'], 'Auditoría', 'Flujo de auditoría empresarial sobre una misión persistente: CHARON extrae los documentos, MINOS verifica, PERSEPHONE compara, CERBERUS valida y un ADMIN aprueba; después se guarda el informe con su hash, se programa un seguimiento de solo lectura en CHRONOS y se prepara (sin enviar) el registro NEAR. Cada etapa indica si se ejecutó o solo está planificada.', 'Enterprise audit flow over a persisted mission: CHARON extracts the documents, MINOS verifies, PERSEPHONE compares, CERBERUS validates and an ADMIN approves; then the report is stored with its hash, a read-only follow-up is scheduled in CHRONOS and the NEAR record is prepared (not sent). Each stage says whether it was executed or only planned.', 'packages/frontend/src/pages/AuditFlowPanel.tsx'],
    ['near-page', ['seccion near', 'near page', 'pagina near', 'registro de auditoria near', 'near audit registry', 'firmar y enviar', 'sign and send', 'transaccion near'], 'NEAR', 'Prepara, revisa y aprueba operaciones que registran el hash SHA-256 de un evento en un contrato de auditoría de NEAR testnet. Cada operación necesita una aprobación humana de un solo uso ligada a sus parámetros exactos; el envío permanece bloqueado hasta que el servidor tenga firmante y contrato configurados, y no se ha enviado ninguna transacción real todavía.', 'Prepare, review and approve operations that record the SHA-256 hash of an event on a NEAR testnet audit contract. Each operation needs a one-time human approval bound to its exact parameters; sending stays blocked until the server has a signer and contract configured, and no real transaction has been sent yet.', 'packages/frontend/src/pages/NearPanel.tsx'],
  ] as Array<[string, string[], string, string, string, string]>).map(([id, kw, name, es, en, src]): KnowledgeEntry => ({
    id, keywords: kw, title: { es: `Sección ${name}`, en: `${name} section` }, answer: { es: `${name}: ${es}`, en: `${name}: ${en}` }, sources: [src], implemented: true, next: ['sections'],
  })),
  {
    id: 'not-impl', keywords: ['mainnet', 'pagos reales', 'real payments', 'transferencia', 'transfer', 'comprar', 'buy', 'dinero real', 'real money', 'ocr', 'email', 'correo', 'integracion erp', 'sap', 'mobile app', 'aplicacion movil'],
    title: { es: 'Lo que aún no existe', en: 'What does not exist yet' },
    answer: {
      es: 'Eso no está implementado. Hoy las compras son escenarios ilustrativos sin operaciones financieras, NEAR corre en simulación (y bloquea Mainnet), no hay OCR para PDF escaneados y la planificación con LLM no está activa en la demo.',
      en: 'That is not implemented. Today purchases are illustrative scenarios with no financial operations, NEAR runs in simulation (and blocks Mainnet), there is no OCR for scanned PDFs and LLM planning is not enabled in the demo.',
    },
    sources: ['packages/api/src/demo.ts'], implemented: false,
  },
]

export const SUGGESTIONS: Record<Lang, Array<{ q: string; id: string }>> = {
  es: [
    { q: '¿Qué es HADES OMEGA?', id: 'what' },
    { q: '¿Qué hace cada agente?', id: 'agents' },
    { q: '¿Cómo creo una misión?', id: 'missions' },
    { q: '¿Qué es CERBERUS y el Approval Gate?', id: 'cerberus' },
    { q: '¿Para qué sirve el holograma?', id: 'hologram' },
    { q: '¿NEAR es real o simulado?', id: 'near' },
  ],
  en: [
    { q: 'What is HADES OMEGA?', id: 'what' },
    { q: 'What does each agent do?', id: 'agents' },
    { q: 'How do I create a mission?', id: 'missions' },
    { q: 'What are CERBERUS and the Approval Gate?', id: 'cerberus' },
    { q: 'What is the hologram for?', id: 'hologram' },
    { q: 'Is NEAR real or simulated?', id: 'near' },
  ],
}

export const GREETING: Bi = {
  es: 'Bienvenido a HADES OMEGA. Soy HADES, tu guía por el centro de comando multiagente. ¿Qué te gustaría conocer?',
  en: 'Welcome to HADES OMEGA. I am HADES, your guide through the multi-agent command center. What would you like to explore?',
}
