import type { AgentName, GUARDOutcome } from '../types/index.js'

export interface PolicyRule {
  id:              string
  name:            string
  description:     string
  operationType:   string | '*'
  agent?:          AgentName | '*'
  condition:       PolicyCondition
  outcome:         GUARDOutcome
  priority:        number
  active:          boolean
}

export interface PolicyCondition {
  type:          'AMOUNT_LIMIT' | 'VENDOR_ALLOWLIST' | 'BUDGET_THRESHOLD' | 'ALWAYS' | 'COMPOUND' | 'AGENT_PERMISSION'
  maxAmount?:    number
  currency?:     string
  allowedVendors?: string[]
  budgetPercent?: number
  operator?:     'AND' | 'OR'
  conditions?:   PolicyCondition[]
}

export interface CerberusPolicy {
  version:       string
  hash:          string
  effectiveFrom: number
  rules:         PolicyRule[]
  vendorAllowlist: string[]
  budgetCategories: Record<string, number>
  /** Sensitive operation types -> the only agents allowed to propose them (checked by rule R-009). */
  operationPermissions: Record<string, AgentName[]>
}

export const DEFAULT_POLICY: Omit<CerberusPolicy, 'hash'> = {
  version: '1.0.0',
  effectiveFrom: Date.now(),
  vendorAllowlist: ['cloudpro-standard', 'techvision', 'inframax', 'securenet'],
  operationPermissions: {
    PURCHASE_ORDER:   ['CHARON'],
    PAYMENT:          ['PERSEPHONE'],
    TRANSFER:         ['PERSEPHONE'],
    NEAR_TRANSACTION: ['PERSEPHONE', 'HADES'],
  },
  budgetCategories: {
    INFRASTRUCTURE: 50000,
    SOFTWARE: 20000,
    SERVICES: 15000,
    HARDWARE: 30000,
  },
  rules: [
    {
      id:            'R-001',
      name:          'Límite presupuestario absoluto',
      description:   'Ninguna orden de compra puede superar el límite de presupuesto aprobado',
      operationType: 'PURCHASE_ORDER',
      condition:     { type: 'AMOUNT_LIMIT', maxAmount: 50000, currency: 'MXN' },
      outcome:       'DENY',
      priority:      100,
      active:        true,
    },
    {
      id:            'R-002',
      name:          'Escalar compras de alto valor',
      description:   'Órdenes entre 30,000 y 50,000 MXN requieren aprobación humana',
      operationType: 'PURCHASE_ORDER',
      condition:     { type: 'AMOUNT_LIMIT', maxAmount: 30000, currency: 'MXN' },
      outcome:       'ESCALATE',
      priority:      90,
      active:        true,
    },
    {
      id:            'R-003',
      name:          'Proveedores no autorizados',
      description:   'Solo se permiten proveedores en la lista aprobada',
      operationType: 'PURCHASE_ORDER',
      condition:     { type: 'VENDOR_ALLOWLIST' },
      outcome:       'DENY',
      priority:      80,
      active:        true,
    },
    {
      id:            'R-004',
      name:          'Presupuesto disponible',
      description:   'El presupuesto disponible debe ser suficiente para la operación',
      operationType: 'BUDGET_APPROVAL',
      condition:     { type: 'BUDGET_THRESHOLD', budgetPercent: 100 },
      outcome:       'DENY',
      priority:      70,
      active:        true,
    },
    {
      id:            'R-005',
      name:          'Aprobación de evaluación de proveedores',
      description:   'La evaluación de proveedores siempre se permite',
      operationType: 'VENDOR_EVALUATION',
      condition:     { type: 'ALWAYS' },
      outcome:       'PERMIT',
      priority:      10,
      active:        true,
    },
    {
      id:            'R-006',
      name:          'Planificación aprobada',
      description:   'Las operaciones de planificación siempre se permiten',
      operationType: 'PLANNING',
      condition:     { type: 'ALWAYS' },
      outcome:       'PERMIT',
      priority:      10,
      active:        true,
    },
    {
      id:            'R-007',
      name:          'Reporte de incidente aprobado',
      description:   'Los reportes de anomalías siempre se permiten',
      operationType: 'ANOMALY_REPORT',
      condition:     { type: 'ALWAYS' },
      outcome:       'PERMIT',
      priority:      10,
      active:        true,
    },
    {
      id:            'R-009',
      name:          'Permiso por tipo de operación',
      description:   'Las operaciones sensibles solo pueden ser propuestas por los agentes autorizados para ese tipo',
      operationType: '*',
      condition:     { type: 'AGENT_PERMISSION' },
      outcome:       'DENY',
      priority:      200,
      active:        true,
    },
    {
      id:            'R-010',
      name:          'Límite de importe (cualquier operación)',
      description:   'Ninguna operación con importe puede superar 50,000 MXN, sin importar el agente',
      operationType: '*',
      condition:     { type: 'AMOUNT_LIMIT', maxAmount: 50000, currency: 'MXN' },
      outcome:       'DENY',
      priority:      95,
      active:        true,
    },
    {
      id:            'R-011',
      name:          'Escalar importes altos (cualquier operación)',
      description:   'Operaciones con importe entre 30,000 y 50,000 MXN requieren aprobación humana, sin importar el agente',
      operationType: '*',
      condition:     { type: 'AMOUNT_LIMIT', maxAmount: 30000, currency: 'MXN' },
      outcome:       'ESCALATE',
      priority:      85,
      active:        true,
    },
    {
      id:            'R-008',
      name:          'Permiso por defecto',
      description:   'Operaciones no cubiertas por otras reglas se permiten por defecto',
      operationType: '*',
      condition:     { type: 'ALWAYS' },
      outcome:       'PERMIT',
      priority:      1,
      active:        true,
    },
  ],
}
