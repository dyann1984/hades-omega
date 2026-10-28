/**
 * PlannerProvider — Interfaz para planificación dinámica de misiones
 *
 * Diseñado para soportar:
 * - Planificador determinista modular (implementación inicial)
 * - LLM-based planner (futuro, via Anthropic Claude SDK)
 *
 * Todas las implementaciones deben:
 * - Generar tareas diferentes según intención, parámetros y contexto
 * - Manejar dependencias entre tareas
 * - Validar ciclos
 * - Conservar origen y justificación de cada tarea
 * - Marcar datos simulados explícitamente
 */

import type { Task, AgentName, MissionContext } from '../types/index.js'

export interface PlannedTask {
  id: string
  missionId: string
  title: string
  description: string
  assignedTo: AgentName
  priority: 'P0' | 'P1' | 'P2'
  dependsOn: string[] // IDs de tareas que deben completarse primero
  estimatedDuration: number // minutos estimados
  origin: 'DEMO_STATIC' | 'DEMO_GENERATED' | 'LLM_GENERATED' | 'RULE_BASED'
  justification: string // Por qué se generó esta tarea
  capabilityId?: string
  requiresApproval?: boolean
  context?: Record<string, unknown> // Datos específicos del caso
}

export interface PlanResult {
  tasks: PlannedTask[]
  estimatedTotalDuration: number // minutos
  warnings: string[]
  simulated: boolean // true si se usaron datos demo
}

export interface MissionIntent {
  title: string
  description: string
  context: MissionContext
}

export interface PlannerProvider {
  /**
   * Analiza la intención de la misión y genera un plan de tareas
   */
  plan(intent: MissionIntent): Promise<PlanResult>

  /**
   * Valida si el plan tiene ciclos de dependencias
   */
  validateDependencies(tasks: PlannedTask[]): { valid: boolean; cycles: string[][] }

  /**
   * Retorna nombre del proveedor (para trazabilidad)
   */
  getProviderName(): string
}
