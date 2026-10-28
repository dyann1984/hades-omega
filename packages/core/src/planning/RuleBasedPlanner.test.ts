/**
 * Tests for RuleBasedPlanner
 *
 * Pruebas para planificación dinámica de misiones
 */

import { describe, it, expect } from 'vitest'
import { createRuleBasedPlanner } from './RuleBasedPlanner.js'

describe('RuleBasedPlanner', () => {
  const planner = createRuleBasedPlanner()

  it('debe detectar caso de compras/proveedores', async () => {
    const result = await planner.plan({
      title: 'Evaluar tres proveedores para una compra de $50,000 MXN',
      description: 'Necesitamos seleccionar proveedor de infraestructura cloud',
      context: {
        organizationId: 'techcore',
        budgetLimit: 50000,
        currency: 'MXN',
        deadline: null,
        priority: 'HIGH',
        tags: [],
      },
    })

    expect(result.tasks.length).toBeGreaterThan(0)
    expect(result.simulated).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)

    // Verificar que las tareas tienen agentes apropiados
    const taskAgents = result.tasks.map(t => t.assignedTo)
    expect(taskAgents).toContain('CHARON')
    expect(taskAgents).toContain('PERSEPHONE')
    expect(taskAgents).toContain('CERBERUS')
    expect(taskAgents).toContain('MINOS')

    // Verificar trazabilidad
    const firstTask = result.tasks[0]
    expect(firstTask.origin).toBe('DEMO_GENERATED')
    expect(firstTask.justification).toBeTruthy()
    expect(firstTask.estimatedDuration).toBeGreaterThan(0)
  })

  it('debe detectar caso de presupuesto/gastos', async () => {
    const result = await planner.plan({
      title: 'Analizar gastos mensuales y detectar desviaciones presupuestales',
      description: 'Revisar gastos del mes actual vs presupuesto asignado',
      context: {
        organizationId: 'techcore',
        budgetLimit: 100000,
        currency: 'MXN',
        deadline: null,
        priority: 'HIGH',
        tags: [],
      },
    })

    expect(result.tasks.length).toBeGreaterThan(0)
    expect(result.simulated).toBe(true)

    // Verificar agentes apropiados para caso de presupuesto
    const taskAgents = result.tasks.map(t => t.assignedTo)
    expect(taskAgents).toContain('PERSEPHONE')
    expect(taskAgents).toContain('ELYSIUM')
  })

  it('debe detectar caso de seguridad/incidencias', async () => {
    const result = await planner.plan({
      title: 'Evaluar una incidencia de seguridad y preparar un informe de riesgos',
      description: 'Incidente de seguridad detectado en sistema de autenticación',
      context: {
        organizationId: 'techcore',
        budgetLimit: null,
        currency: 'MXN',
        deadline: null,
        priority: 'CRITICAL',
        tags: ['security'],
      },
    })

    expect(result.tasks.length).toBeGreaterThan(0)
    expect(result.simulated).toBe(true)

    // Verificar agentes apropiados para caso de seguridad
    const taskAgents = result.tasks.map(t => t.assignedTo)
    expect(taskAgents).toContain('TARTARUS')
    expect(taskAgents).toContain('CERBERUS')
  })

  it('debe validar dependencias sin ciclos', () => {
    const tasks = [
      { id: 't1', dependsOn: [] },
      { id: 't2', dependsOn: ['t1'] },
      { id: 't3', dependsOn: ['t2'] },
    ] as any

    const validation = planner.validateDependencies(tasks)
    expect(validation.valid).toBe(true)
    expect(validation.cycles).toHaveLength(0)
  })

  it('debe detectar ciclos de dependencias', () => {
    const tasks = [
      { id: 't1', dependsOn: ['t2'] },
      { id: 't2', dependsOn: ['t3'] },
      { id: 't3', dependsOn: ['t1'] },
    ] as any

    const validation = planner.validateDependencies(tasks)
    expect(validation.valid).toBe(false)
    expect(validation.cycles.length).toBeGreaterThan(0)
  })

  it('debe retornar nombre del proveedor', () => {
    const name = planner.getProviderName()
    expect(name).toBe('RuleBasedPlanner v1.0')
  })

  it('debe generar diferentes tareas para diferentes casos', async () => {
    const procurementResult = await planner.plan({
      title: 'Evaluar proveedores',
      description: 'Compra de servidores',
      context: { organizationId: 'techcore', budgetLimit: 50000, currency: 'MXN', deadline: null, priority: 'HIGH', tags: [] },
    })

    const budgetResult = await planner.plan({
      title: 'Analizar gastos',
      description: 'Revisión presupuestal',
      context: { organizationId: 'techcore', budgetLimit: 100000, currency: 'MXN', deadline: null, priority: 'HIGH', tags: [] },
    })

    // Los planes deben ser diferentes
    const procurementTitles = procurementResult.tasks.map(t => t.title)
    const budgetTitles = budgetResult.tasks.map(t => t.title)

    // No deben ser idénticos
    expect(procurementTitles).not.toEqual(budgetTitles)

    // Deben tener diferentes distribuciones de agentes
    const procurementAgents = procurementResult.tasks.map(t => t.assignedTo)
    const budgetAgents = budgetResult.tasks.map(t => t.assignedTo)
    expect(procurementAgents).not.toEqual(budgetAgents)
  })

  it('debe planificar una misión de comparación documental multiagente con capacidades verificables', async () => {
    const result = await planner.plan({
      title: 'Comparar contratos de proveedores',
      description: 'Auditoría comparativa de tres documentos de proveedores cloud',
      context: {
        organizationId: 'techcore',
        budgetLimit: 150000,
        currency: 'MXN',
        deadline: null,
        priority: 'HIGH',
        tags: ['multi-doc'],
        documents: [
          { filename: 'doc-a.txt', content: 'Contrato A' },
          { filename: 'doc-b.txt', content: 'Contrato B' },
          { filename: 'doc-c.txt', content: 'Contrato C' },
        ],
      } as any,
    })

    expect(result.tasks.length).toBe(6)
    expect(result.simulated).toBe(false) // Datos reales provistos
    const agents = result.tasks.map(t => t.assignedTo)
    expect(agents).toEqual(['CHARON', 'MINOS', 'PERSEPHONE', 'HADES', 'ELYSIUM', 'TARTARUS'])

    // Cada tarea debe declarar una capacidad válida
    for (const task of result.tasks) {
      expect(task.capabilityId).toBeTruthy()
      expect(task.capabilityId).toMatch(/^cap:[a-z0-9:-]+@\d+\.\d+\.\d+$/)
    }

    // La tarea de aprobación ejecutiva debe exigir autorización humana
    const approvalTask = result.tasks.find(t => t.assignedTo === 'HADES')
    expect(approvalTask?.requiresApproval).toBe(true)

    // Sin ciclos de dependencia
    const validation = planner.validateDependencies(result.tasks)
    expect(validation.valid).toBe(true)
    expect(validation.cycles).toHaveLength(0)
  })
})
