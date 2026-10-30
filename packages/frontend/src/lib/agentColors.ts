/** Single source of truth for per-agent identity (hologram node, beam, particles, monitor dots). No three.js import: safe for eager chunks. */
export type AgentId = 'HADES' | 'CHARON' | 'PERSEPHONE' | 'MINOS' | 'CERBERUS' | 'ELYSIUM' | 'TARTARUS'

export const AGENT_COLOR: Record<AgentId, string> = {
  HADES:      '#FFD700',   // dorado metálico (núcleo, ya aprobado)
  CHARON:     '#2F7BFF',   // azul eléctrico
  PERSEPHONE: '#B26BFF',   // violeta
  MINOS:      '#E6EBF2',   // blanco plata
  CERBERUS:   '#FF3B3B',   // rojo intenso
  ELYSIUM:    '#19D68A',   // verde esmeralda
  TARTARUS:   '#FF8C1A',   // naranja ámbar
}

export const AGENT_ROLE: Record<AgentId, { es: string; en: string }> = {
  HADES:      { es: 'Orquestador central',          en: 'Central orchestrator' },
  CHARON:     { es: 'Compras y proveedores',        en: 'Procurement & vendors' },
  PERSEPHONE: { es: 'Finanzas y presupuestos',      en: 'Finance & budgets' },
  MINOS:      { es: 'Validación y políticas',       en: 'Validation & policies' },
  CERBERUS:   { es: 'Seguridad y control',          en: 'Security & control' },
  ELYSIUM:    { es: 'Planificación estratégica',    en: 'Strategic planning' },
  TARTARUS:   { es: 'Anomalías e integridad',       en: 'Anomalies & integrity' },
}

export const AGENT_STATUS_LABEL: Record<string, { es: string; en: string }> = {
  IDLE: { es: 'Inactivo', en: 'Idle' }, THINKING: { es: 'Analizando', en: 'Analyzing' }, EXECUTING: { es: 'Ejecutando', en: 'Executing' },
  WAITING: { es: 'Esperando', en: 'Waiting' }, ERROR: { es: 'Error', en: 'Error' }, SUSPENDED: { es: 'Suspendido', en: 'Suspended' },
  UNKNOWN: { es: 'Desconocido', en: 'Unknown' }, AVAILABLE: { es: 'Disponible', en: 'Available' },
}
