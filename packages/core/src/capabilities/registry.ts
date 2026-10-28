import type { AgentName } from '../types/index.js'

export type CapabilityStatus = 'AVAILABLE' | 'BUSY' | 'MAINTENANCE' | 'DISABLED'

export interface CapabilityLimits {
  timeoutMs: number
  maxPayloadBytes: number
}

export interface AgentCapability {
  id: string
  name: string
  version: string
  agent: AgentName
  description: string
  inputTypes: string[]
  outputTypes: string[]
  requiredPermissions: ('ADMIN' | 'OPERATOR' | 'AUDITOR' | 'VIEWER')[]
  requiredResources: string[]
  preconditions: string[]
  sideEffects: string[]
  requiresApproval: boolean
  availability: CapabilityStatus
  limits: CapabilityLimits
}

export interface ReassignmentCheck {
  allowed: boolean
  reason?: string
  sourceCapability?: AgentCapability
  targetCapability?: AgentCapability
}

// Canonical capabilities implemented by each agent
export const CANONICAL_CAPABILITIES: readonly AgentCapability[] = [
  // CHARON — Ingesta & Adquisición
  {
    id: 'cap:doc:intake@1.0.0',
    name: 'Ingesta y Extracción Documental',
    version: '1.0.0',
    agent: 'CHARON',
    description: 'Recepción, deserialización y extracción estructurada de texto de documentos TXT, PDF, DOCX y JSON.',
    inputTypes: ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/json'],
    outputTypes: ['hades/document-intake'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU', 'MEMORY'],
    preconditions: ['PAYLOAD_PRESENT', 'SIZE_WITHIN_LIMITS'],
    sideEffects: ['RECORD_INTAKE_METRICS'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 30000, maxPayloadBytes: 5 * 1024 * 1024 },
  },
  {
    id: 'cap:procurement:eval@1.0.0',
    name: 'Evaluación de Proveedores y Cotizaciones',
    version: '1.0.0',
    agent: 'CHARON',
    description: 'Análisis comercial de ofertas de proveedores, scoring de precios y evaluación de términos de entrega.',
    inputTypes: ['hades/vendor-quotations'],
    outputTypes: ['hades/vendor-evaluation'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['VENDORS_SPECIFIED'],
    sideEffects: ['WRITE_AUDIT_LOG'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 20000, maxPayloadBytes: 1024 * 1024 },
  },

  // MINOS — Validación y Cumplimiento
  {
    id: 'cap:doc:validate@1.0.0',
    name: 'Validación Contractual y Detección de Inconsistencias',
    version: '1.0.0',
    agent: 'MINOS',
    description: 'Inspección de cláusulas, términos de mora, detección de riesgos contractuales y cumplimiento de políticas normativas.',
    inputTypes: ['hades/document-intake', 'text/plain'],
    outputTypes: ['hades/validation-report'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['EXTRACTED_TEXT_PRESENT'],
    sideEffects: ['WRITE_AUDIT_LOG'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 20000, maxPayloadBytes: 2 * 1024 * 1024 },
  },
  {
    id: 'cap:policy:verify@1.0.0',
    name: 'Comprobación de Políticas Corporativas',
    version: '1.0.0',
    agent: 'MINOS',
    description: 'Verificación estricta de esquemas de datos y correspondencia de reglas de negocio organizacionales.',
    inputTypes: ['application/json'],
    outputTypes: ['hades/compliance-check'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['POLICY_SET_LOADED'],
    sideEffects: ['RECORD_POLICY_COMPLIANCE'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 15000, maxPayloadBytes: 1024 * 1024 },
  },

  // PERSEPHONE — Análisis Financiero y Comparación Multi-Documental
  {
    id: 'cap:doc:compare@1.0.0',
    name: 'Comparación y Síntesis Multi-Documental',
    version: '1.0.0',
    agent: 'PERSEPHONE',
    description: 'Análisis comparativo cruzado entre múltiples documentos para contrastar montos, plazos, penalizaciones y detectar discrepancias.',
    inputTypes: ['hades/multi-document-set'],
    outputTypes: ['hades/comparison-matrix'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU', 'MEMORY'],
    preconditions: ['MINIMUM_TWO_DOCUMENTS'],
    sideEffects: ['WRITE_AUDIT_LOG'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 45000, maxPayloadBytes: 10 * 1024 * 1024 },
  },
  {
    id: 'cap:financial:analyze@1.0.0',
    name: 'Análisis Presupuestario y Financiero',
    version: '1.0.0',
    agent: 'PERSEPHONE',
    description: 'Extracción de métricas de costo, cálculo de desviaciones presupuestarias y modelado de impacto económico.',
    inputTypes: ['hades/financial-data'],
    outputTypes: ['hades/financial-report'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['BUDGET_METRICS_PRESENT'],
    sideEffects: ['WRITE_AUDIT_LOG'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 25000, maxPayloadBytes: 2 * 1024 * 1024 },
  },

  // ELYSIUM — Planificación Táctica y Generación de Entregables
  {
    id: 'cap:report:generate@1.0.0',
    name: 'Generación de Entregables e Informes Consolidados',
    version: '1.0.0',
    agent: 'ELYSIUM',
    description: 'Consolidación de resultados de validación, comparación y análisis en un informe ejecutivo descargable.',
    inputTypes: ['hades/analysis-results', 'hades/comparison-matrix'],
    outputTypes: ['text/markdown', 'application/json', 'hades/deliverable'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['UPSTREAM_ANALYSIS_COMPLETE'],
    sideEffects: ['WRITE_AUDIT_LOG', 'SAVE_DELIVERABLE'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 30000, maxPayloadBytes: 5 * 1024 * 1024 },
  },

  // TARTARUS — Seguridad, Resiliencia y Hash Criptográfico
  {
    id: 'cap:crypto:hash@1.0.0',
    name: 'Cálculo Criptográfico y Sellado de Evidencia SHA-256',
    version: '1.0.0',
    agent: 'TARTARUS',
    description: 'Generación determinista de huellas SHA-256, sellado de entregables y verificación de integridad de datos.',
    inputTypes: ['text/plain', 'application/octet-stream', 'application/json'],
    outputTypes: ['hades/crypto-digest'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['CONTENT_PAYLOAD_PRESENT'],
    sideEffects: ['RECORD_INTEGRITY_HASH'],
    requiresApproval: true,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 15000, maxPayloadBytes: 16 * 1024 * 1024 },
  },
  {
    id: 'cap:resilience:recover@1.0.0',
    name: 'Gestión de Resiliencia, Errores y Anomalías',
    version: '1.0.0',
    agent: 'TARTARUS',
    description: 'Detección de patrones anómalos, contención de fallos y registro seguro de incidentes de ejecución.',
    inputTypes: ['hades/execution-errors', 'hades/anomaly-context'],
    outputTypes: ['hades/anomaly-report'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['ANOMALY_TRIGGERED'],
    sideEffects: ['EMIT_ANOMALY_EVENT', 'WRITE_AUDIT_LOG'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 20000, maxPayloadBytes: 2 * 1024 * 1024 },
  },

  // HADES — Orquestación Central y Ejecutor Local Homologado SHA-256
  {
    id: 'cap:crypto:hash@1.0.0',
    name: 'Cálculo Criptográfico Determinista SHA-256',
    version: '1.0.0',
    agent: 'HADES',
    description: 'Ejecución orquestada y determinista de sellado criptográfico SHA-256 bajo aprobación administrativa.',
    inputTypes: ['text/plain', 'application/octet-stream'],
    outputTypes: ['hades/crypto-digest'],
    requiredPermissions: ['ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['APPROVAL_GRANTED'],
    sideEffects: ['WRITE_AUDIT_LOG', 'UPDATE_MISSION_STATE'],
    requiresApproval: true,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 15000, maxPayloadBytes: 16 * 1024 * 1024 },
  },
  {
    id: 'cap:orchestration:plan@1.0.0',
    name: 'Orquestación, Validación de Grafos y Despacho',
    version: '1.0.0',
    agent: 'HADES',
    description: 'Interpretación de intenciones, construcción de grafos acíclicos de tareas y despacho multiagente.',
    inputTypes: ['hades/mission-intent'],
    outputTypes: ['hades/mission-plan'],
    requiredPermissions: ['OPERATOR', 'ADMIN'],
    requiredResources: ['CPU', 'MEMORY'],
    preconditions: ['VALID_INTENT'],
    sideEffects: ['EMIT_MISSION_EVENTS'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 30000, maxPayloadBytes: 1024 * 1024 },
  },

  // CERBERUS — Guardia Transversal de Políticas y Auditoría Inmutable
  {
    id: 'cap:security:guard@1.0.0',
    name: 'Supervisión de Políticas y Guardrail Transversal',
    version: '1.0.0',
    agent: 'CERBERUS',
    description: 'Evaluación continua de propuestas de operación contra políticas de seguridad (PERMIT, DENY, ESCALATE).',
    inputTypes: ['hades/operation-proposal'],
    outputTypes: ['hades/guard-decision'],
    requiredPermissions: ['ADMIN'],
    requiredResources: ['CPU'],
    preconditions: ['POLICY_ENGINE_READY'],
    sideEffects: ['CREATE_AUDIT_RECORD'],
    requiresApproval: false,
    availability: 'AVAILABLE',
    limits: { timeoutMs: 5000, maxPayloadBytes: 512 * 1024 },
  },
] as const

export class CapabilityRegistry {
  private capabilities: Map<string, AgentCapability[]> = new Map()

  constructor(initialCapabilities: readonly AgentCapability[] = CANONICAL_CAPABILITIES) {
    for (const cap of initialCapabilities) {
      this.registerCapability(cap)
    }
  }

  registerCapability(capability: AgentCapability): void {
    // Validar que el agente existe y no declare capacidades inexistentes
    const knownAgents: AgentName[] = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'CERBERUS', 'ELYSIUM', 'TARTARUS']
    if (!knownAgents.includes(capability.agent)) {
      throw new Error(`UNKNOWN_AGENT: Agente '${capability.agent}' no es un componente reconocido de HADES.`)
    }

    if (!capability.id || !capability.id.includes('@')) {
      throw new Error(`INVALID_CAPABILITY_ID: Identificador '${capability.id}' debe incluir formato nombre@version.`)
    }

    const list = this.capabilities.get(capability.id) ?? []
    // Evitar registrar duplicado exacto para el mismo agente
    const existingIndex = list.findIndex(c => c.agent === capability.agent)
    if (existingIndex >= 0) {
      list[existingIndex] = capability
    } else {
      list.push(capability)
    }
    this.capabilities.set(capability.id, list)
  }

  getAllCapabilities(): AgentCapability[] {
    const all: AgentCapability[] = []
    for (const list of this.capabilities.values()) {
      all.push(...list)
    }
    return all
  }

  getCapabilitiesByAgent(agent: AgentName): AgentCapability[] {
    const result: AgentCapability[] = []
    for (const list of this.capabilities.values()) {
      for (const cap of list) {
        if (cap.agent === agent) result.push(cap)
      }
    }
    return result
  }

  getCapability(id: string, agent?: AgentName): AgentCapability | undefined {
    const list = this.capabilities.get(id)
    if (!list || list.length === 0) return undefined
    if (agent) return list.find(c => c.agent === agent)
    return list[0]
  }

  findCompatibleAgents(capabilityId: string): AgentName[] {
    const list = this.capabilities.get(capabilityId)
    if (!list) return []
    return list
      .filter(cap => cap.availability === 'AVAILABLE')
      .map(cap => cap.agent)
  }

  canExecute(agent: AgentName, capabilityId: string): boolean {
    const list = this.capabilities.get(capabilityId)
    if (!list) return false
    return list.some(cap => cap.agent === agent && cap.availability === 'AVAILABLE')
  }

  canReassign(fromAgent: AgentName, toAgent: AgentName, capabilityId: string): ReassignmentCheck {
    if (fromAgent === toAgent) {
      return { allowed: false, reason: 'REASSIGN_SAME_AGENT: El agente destino es el mismo que el actual.' }
    }

    const sourceCap = this.getCapability(capabilityId, fromAgent)
    const targetCap = this.getCapability(capabilityId, toAgent)

    if (!targetCap) {
      return {
        allowed: false,
        reason: `BLOCKED_BY_DESIGN: El agente destino '${toAgent}' no implementa la capacidad requerida '${capabilityId}'. Ninguna regla de reasignación simulada está permitida.`,
        sourceCapability: sourceCap,
      }
    }

    if (targetCap.availability !== 'AVAILABLE') {
      return {
        allowed: false,
        reason: `TARGET_UNAVAILABLE: El agente destino '${toAgent}' no está disponible actualmente (estado: ${targetCap.availability}).`,
        sourceCapability: sourceCap,
        targetCapability: targetCap,
      }
    }

    return {
      allowed: true,
      sourceCapability: sourceCap,
      targetCapability: targetCap,
    }
  }
}

export const defaultCapabilityRegistry = new CapabilityRegistry()
