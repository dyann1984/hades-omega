/**
 * RuleBasedPlanner — Planificador determinista modular
 *
 * Analiza instrucciones empresariales y genera planes específicos
 * usando reglas deterministas y plantillas dinámicas.
 *
 * Casos soportados:
 * - A. Compras/Proveedores: "Evaluar proveedores", "comprar", "adquirir"
 * - B. Presupuesto/Gastos: "gastos", "presupuesto", "desviaciones", "análisis financiero"
 * - C. Seguridad/Incidencias: "incidencia", "seguridad", "riesgos", "informe de riesgos"
 * - D. Planificación/Estrategia: "plan", "estrategia", "expansión", "roadmap"
 * - E. Auditoría/Revisión: "auditoría", "revisión", "evaluar", "validar"
 *
 * Marcado explícitamente como DEMO hasta tener datos reales.
 */

import { v4 as uuidv4 } from 'uuid'
import type { AgentName, MissionContext } from '../types/index.js'
import type {
  PlannerProvider,
  PlannedTask,
  PlanResult,
  MissionIntent,
} from './PlannerProvider.js'

type CaseType = 'PROCUREMENT' | 'BUDGET' | 'SECURITY' | 'PLANNING' | 'AUDIT' | 'UNKNOWN'

class RuleBasedPlanner implements PlannerProvider {
  getProviderName(): string {
    return 'RuleBasedPlanner v1.0'
  }

  async plan(intent: MissionIntent): Promise<PlanResult> {
    const caseType = this.detectCaseType(intent)
    const tasks = this.generateTasks(intent, caseType)
    const validation = this.validateDependencies(tasks)

    const warnings: string[] = []
    if (!validation.valid) {
      warnings.push(`Ciclos de dependencias detectados: ${validation.cycles.length}`)
    }
    warnings.push('Plan generado por RuleBasedPlanner (DEMO) - Requiere datos reales para producción')

    const estimatedDuration = tasks.reduce((sum, t) => sum + t.estimatedDuration, 0)

    return {
      tasks,
      estimatedTotalDuration: estimatedDuration,
      warnings,
      simulated: true,
    }
  }

  validateDependencies(tasks: PlannedTask[]): { valid: boolean; cycles: string[][] } {
    // Construir grafo de dependencias
    const taskMap = new Map(tasks.map(t => [t.id, t.dependsOn]))
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const cycles: string[][] = []

    function hasCycle(taskId: string, path: string[]): boolean {
      if (recursionStack.has(taskId)) {
        cycles.push([...path, taskId])
        return true
      }
      if (visited.has(taskId)) return false

      visited.add(taskId)
      recursionStack.add(taskId)

      const deps = taskMap.get(taskId) ?? []
      for (const depId of deps) {
        if (hasCycle(depId, [...path, taskId])) {
          return true
        }
      }

      recursionStack.delete(taskId)
      return false
    }

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        hasCycle(task.id, [])
      }
    }

    return { valid: cycles.length === 0, cycles }
  }

  private detectCaseType(intent: MissionIntent): CaseType {
    const text = (intent.title + ' ' + intent.description).toLowerCase()

    if (text.includes('proveedor') || text.includes('compra') || text.includes('adquirir') || text.includes('cotizar')) {
      return 'PROCUREMENT'
    }
    if (text.includes('gasto') || text.includes('presupuesto') || text.includes('desviación') || text.includes('financiero')) {
      return 'BUDGET'
    }
    if (text.includes('incidencia') || text.includes('seguridad') || text.includes('riesgo') || text.includes('informe de riesgo')) {
      return 'SECURITY'
    }
    if (text.includes('plan') || text.includes('estrategia') || text.includes('expansión') || text.includes('roadmap')) {
      return 'PLANNING'
    }
    if (text.includes('auditoría') || text.includes('revisión') || text.includes('evaluar') || text.includes('validar')) {
      return 'AUDIT'
    }
    return 'UNKNOWN'
  }

  private generateTasks(intent: MissionIntent, caseType: CaseType): PlannedTask[] {
    const missionId = uuidv4()

    switch (caseType) {
      case 'PROCUREMENT':
        return this.generateProcurementTasks(intent, missionId)
      case 'BUDGET':
        return this.generateBudgetTasks(intent, missionId)
      case 'SECURITY':
        return this.generateSecurityTasks(intent, missionId)
      case 'PLANNING':
        return this.generatePlanningTasks(intent, missionId)
      case 'AUDIT':
        return this.generateAuditTasks(intent, missionId)
      default:
        return this.generateGenericTasks(intent, missionId)
    }
  }

  private generateProcurementTasks(intent: MissionIntent, missionId: string): PlannedTask[] {
    // Extraer parámetros del contexto (simulado)
    const budget = intent.context.budgetLimit ?? 50000
    const urgency = intent.context.priority ?? 'HIGH'

    const t1: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Definir requisitos técnicos de la compra',
      description: 'Especificar requerimientos técnicos, SLAs, niveles de servicio y criterios de evaluación para proveedores.',
      assignedTo: 'CHARON',
      priority: 'P0',
      dependsOn: [],
      estimatedDuration: 30,
      origin: 'DEMO_GENERATED',
      justification: 'Primera fase de cualquier proceso de compra: definición clara de necesidades.',
      context: { budget, urgency },
    }

    const t2: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Buscar y evaluar proveedores elegibles',
      description: `Identificar proveedores que cumplan requisitos técnicos y presupuesto de $${budget.toLocaleString()} MXN. Evaluar capacidad financiera y reputación.`,
      assignedTo: 'CHARON',
      priority: 'P0',
      dependsOn: [t1.id],
      estimatedDuration: 45,
      origin: 'DEMO_GENERATED',
      justification: 'Búsqueda activa de mercado según definición de requisitos.',
      context: { budget, urgency, providerCount: 3 },
    }

    const t3: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Validar disponibilidad presupuestaria',
      description: `Verificar que el presupuesto de $${budget.toLocaleString()} MXN esté disponible y no comprometa otras operaciones críticas.`,
      assignedTo: 'PERSEPHONE',
      priority: 'P0',
      dependsOn: [t1.id],
      estimatedDuration: 20,
      origin: 'DEMO_GENERATED',
      justification: 'Validación financiera antes de comprometer fondos.',
      context: { budget, category: 'PROCUREMENT' },
    }

    const t4: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Generar comparativa de propuestas',
      description: 'Crear análisis comparativo de proveedores con criterios técnicos, comerciales y de riesgo.',
      assignedTo: 'CHARON',
      priority: 'P1',
      dependsOn: [t2.id, t3.id],
      estimatedDuration: 40,
      origin: 'DEMO_GENERATED',
      justification: 'Análisis para selección informada de proveedor.',
      context: { comparisonCriteria: ['precio', 'calidad', 'entrega', 'soporte'] },
    }

    const t5: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Evaluar propuesta contra políticas CERBERUS',
      description: 'Verificar que la compra propuesta cumpla políticas de gasto, proveedores aprobados y autorización.',
      assignedTo: 'CERBERUS',
      priority: 'P0',
      dependsOn: [t4.id],
      estimatedDuration: 15,
      origin: 'DEMO_GENERATED',
      justification: 'Control preventivo de seguridad antes de autorizar operación.',
      context: { policiesChecked: ['BUDGET_LIMIT', 'VENDOR_ALLOWLIST', 'HUMAN_APPROVAL'] },
    }

    const t6: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Aprobar compra si supera límite de autonomía',
      description: 'Si el monto supera el límite de autonomía de CHARON, solicitar aprobación de MINOS.',
      assignedTo: 'MINOS',
      priority: 'P1',
      dependsOn: [t5.id],
      estimatedDuration: 10,
      origin: 'DEMO_GENERATED',
      justification: 'Control de jerarquía de aprobación según monto.',
      context: { autonomyLimit: 30000, currentAmount: budget },
    }

    return [t1, t2, t3, t4, t5, t6]
  }

  private generateBudgetTasks(intent: MissionIntent, missionId: string): PlannedTask[] {
    const budget = intent.context.budgetLimit ?? 100000

    const t1: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Obtener datos de gastos del período',
      description: 'Recopiar registros contables, reportes de gastos y proyecciones presupuestarias del período actual.',
      assignedTo: 'PERSEPHONE',
      priority: 'P0',
      dependsOn: [],
      estimatedDuration: 30,
      origin: 'DEMO_GENERATED',
      justification: 'Fase de recolección de datos para análisis financiero.',
      context: { period: 'actual', dataSource: 'SIMULADO' },
    }

    const t2: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Calcular desviaciones presupuestarias por categoría',
      description: 'Comparar gastos reales vs presupuesto asignado por categoría (operaciones, marketing, infraestructura, etc.).',
      assignedTo: 'PERSEPHONE',
      priority: 'P0',
      dependsOn: [t1.id],
      estimatedDuration: 45,
      origin: 'DEMO_GENERATED',
      justification: 'Análisis granular de desviaciones para identificar áreas problemáticas.',
      context: { categories: ['operaciones', 'marketing', 'infraestructura', 'RRHH'] },
    }

    const t3: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Identificar desviaciones significativas (>10%)',
      description: 'Marcar categorías con desviación superior al 10% para análisis detallado.',
      assignedTo: 'PERSEPHONE',
      priority: 'P1',
      dependsOn: [t2.id],
      estimatedDuration: 20,
      origin: 'DEMO_GENERATED',
      justification: 'Filtro para enfocar análisis en desviaciones que requieren acción.',
      context: { threshold: 0.10 },
    }

    const t4: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Evaluar impacto de desviaciones en objetivos trimestrales',
      description: 'Analizar si las desviaciones afectan el cumplimiento de objetivos financieros del trimestre.',
      assignedTo: 'ELYSIUM',
      priority: 'P1',
      dependsOn: [t3.id],
      estimatedDuration: 30,
      origin: 'DEMO_GENERATED',
      justification: 'Análisis estratégico de impacto financiero.',
      context: { currentQuarter: 'Q4', objectives: 'SIMULADOS' },
    }

    const t5: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Generar reporte de desviaciones y recomendaciones',
      description: 'Crear informe con causas de desviaciones, impacto y acciones correctivas recomendadas.',
      assignedTo: 'PERSEPHONE',
      priority: 'P0',
      dependsOn: [t4.id],
      estimatedDuration: 40,
      origin: 'DEMO_GENERATED',
      justification: 'Entregable principal del análisis de presupuesto.',
      context: { reportFormat: 'EXECUTIVE_SUMMARY' },
    }

    return [t1, t2, t3, t4, t5]
  }

  private generateSecurityTasks(intent: MissionIntent, missionId: string): PlannedTask[] {
    const t1: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Documentar incidencia de seguridad',
      description: 'Recopilar detalles técnicos: fecha/hora, sistemas afectados, síntomas, usuarios impactados, acciones tomadas inmediatas.',
      assignedTo: 'TARTARUS',
      priority: 'P0',
      dependsOn: [],
      estimatedDuration: 30,
      origin: 'DEMO_GENERATED',
      justification: 'Documentación exhaustiva es fundamental para análisis de seguridad.',
      context: { incidentSource: 'DESCRIPCION_USUARIO' },
    }

    const t2: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Evaluar alcance y severidad del incidente',
      description: 'Determinar sistemas afectados, datos comprometidos, vulnerabilidades explotadas y nivel de impacto.',
      assignedTo: 'TARTARUS',
      priority: 'P0',
      dependsOn: [t1.id],
      estimatedDuration: 45,
      origin: 'DEMO_GENERATED',
      justification: 'Clasificación de severidad para priorizar respuesta.',
      context: { severityLevels: ['BAJA', 'MEDIA', 'ALTA', 'CRÍTICA'] },
    }

    const t3: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Verificar contención y acciones mitigadoras',
      description: 'Confirmar que el incidente está contenido y revisar eficacia de medidas mitigadoras existentes.',
      assignedTo: 'TARTARUS',
      priority: 'P0',
      dependsOn: [t2.id],
      estimatedDuration: 30,
      origin: 'DEMO_GENERATED',
      justification: 'Validación de estado actual antes de planificar siguiente fase.',
      context: { containmentStatus: 'SIMULADO' },
    }

    const t4: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Evaluar políticas CERBERUS violadas o comprometidas',
      description: 'Verificar si el incidente expuso brechas en políticas de seguridad, controles de acceso o procedimientos.',
      assignedTo: 'CERBERUS',
      priority: 'P0',
      dependsOn: [t3.id],
      estimatedDuration: 25,
      origin: 'DEMO_GENERATED',
      justification: 'Análisis de fallas de seguridad para prevención futura.',
      context: { policiesViolated: 'SIMULADO' },
    }

    const t5: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Generar informe de riesgos y recomendaciones',
      description: 'Crear reporte con análisis de riesgos identificados, probabilidad de recurrencia, medidas de mitigación recomendadas.',
      assignedTo: 'TARTARUS',
      priority: 'P0',
      dependsOn: [t4.id],
      estimatedDuration: 60,
      origin: 'DEMO_GENERATED',
      justification: 'Entregable principal del análisis de seguridad.',
      context: { reportFormat: 'SECURITY_ASSESSMENT' },
    }

    const t6: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Validar informe con CERBERUS antes de distribución',
      description: 'Verificar que el informe no contiene información sensible no autorizada para distribución.',
      assignedTo: 'CERBERUS',
      priority: 'P1',
      dependsOn: [t5.id],
      estimatedDuration: 10,
      origin: 'DEMO_GENERATED',
      justification: 'Control de salida de información sensible.',
      context: { sensitivityLevel: 'SIMULADO' },
    }

    return [t1, t2, t3, t4, t5, t6]
  }

  private generatePlanningTasks(intent: MissionIntent, missionId: string): PlannedTask[] {
    const t1: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Analizar objetivos y alcance del plan',
      description: 'Definir objetivos estratégicos, alcance temporal, recursos requeridos y stakeholders involucrados.',
      assignedTo: 'ELYSIUM',
      priority: 'P0',
      dependsOn: [],
      estimatedDuration: 45,
      origin: 'DEMO_GENERATED',
      justification: 'Fundación de cualquier plan estratégico exitoso.',
      context: { planningHorizon: 'SIMULADO' },
    }

    const t2: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Descomponer objetivos en hitos medibles',
      description: 'Convertir objetivos estratégicos en hitos concretos, medibles y con dueño asignado.',
      assignedTo: 'ELYSIUM',
      priority: 'P0',
      dependsOn: [t1.id],
      estimatedDuration: 40,
      origin: 'DEMO_GENERATED',
      justification: 'Descomposición en tareas accionables.',
      context: { milestonesCount: 'SIMULADO' },
    }

    const t3: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Estimar recursos necesarios (tiempo, presupuesto, talento)',
      description: 'Calcular requerimientos de personal, presupuesto y tiempo para cada hito del plan.',
      assignedTo: 'ELYSIUM',
      priority: 'P0',
      dependsOn: [t2.id],
      estimatedDuration: 35,
      origin: 'DEMO_GENERATED',
      justification: 'Estimación de recursos para viabilidad.',
      context: { resourceCategories: ['personal', 'presupuesto', 'infraestructura'] },
    }

    const t4: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Validar viabilidad contra restricciones',
      description: 'Verificar que el plan es viable dadas las restricciones presupuestarias, de tiempo y de capacidad.',
      assignedTo: 'PERSEPHONE',
      priority: 'P0',
      dependsOn: [t3.id],
      estimatedDuration: 25,
      origin: 'DEMO_GENERATED',
      justification: 'Validación financiera y de capacidad.',
      context: { constraints: 'SIMULADOS' },
    }

    const t5: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Generar roadmap cronológico con hitos',
      description: 'Crear cronograma detallado con fechas, hitos y responsables para ejecución del plan.',
      assignedTo: 'ELYSIUM',
      priority: 'P1',
      dependsOn: [t4.id],
      estimatedDuration: 30,
      origin: 'DEMO_GENERATED',
      justification: 'Plan de ejecución táctico.',
      context: { timelineFormat: 'GANTT_SIMULADO' },
    }

    return [t1, t2, t3, t4, t5]
  }

  private generateAuditTasks(intent: MissionIntent, missionId: string): PlannedTask[] {
    const t1: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Definir alcance de la auditoría',
      description: 'Especificar áreas, período, objetivos y criterios de evaluación de la auditoría.',
      assignedTo: 'ELYSIUM',
      priority: 'P0',
      dependsOn: [],
      estimatedDuration: 25,
      origin: 'DEMO_GENERATED',
      justification: 'Definición clara de alcance es crítica para auditorías efectivas.',
      context: { auditScope: 'SIMULADO' },
    }

    const t2: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Recopilar evidencias y documentación',
      description: 'Gather documentos, registros, logs y evidencias requeridas para el área bajo auditoría.',
      assignedTo: 'ELYSIUM',
      priority: 'P0',
      dependsOn: [t1.id],
      estimatedDuration: 60,
      origin: 'DEMO_GENERATED',
      justification: 'Recolección de evidencias es fase base de auditoría.',
      context: { evidenceTypes: 'SIMULADOS' },
    }

    const t3: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Ejecutar pruebas y verificaciones según criterios',
      description: 'Realizar pruebas, inspecciones y verificaciones técnicas según criterios de auditoría definidos.',
      assignedTo: 'CERBERUS',
      priority: 'P0',
      dependsOn: [t2.id],
      estimatedDuration: 90,
      origin: 'DEMO_GENERATED',
      justification: 'Ejecución de pruebas y verificaciones técnicas.',
      context: { testMethods: 'SIMULADOS' },
    }

    const t4: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Analizar hallazgos y generar reporte de no conformidades',
      description: 'Analizar evidencias recopiladas, identificar desviaciones y no conformidades contra estándares.',
      assignedTo: 'CERBERUS',
      priority: 'P0',
      dependsOn: [t3.id],
      estimatedDuration: 60,
      origin: 'DEMO_GENERATED',
      justification: 'Análisis de hallazgos y generación de reporte.',
      context: { standards: 'SIMULADOS' },
    }

    const t5: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Generar informe de auditoría con recomendaciones',
      description: 'Crear informe ejecutivo con hallazgos, no conformidades, recomendaciones y plan de acción correctivo.',
      assignedTo: 'CERBERUS',
      priority: 'P0',
      dependsOn: [t4.id],
      estimatedDuration: 45,
      origin: 'DEMO_GENERATED',
      justification: 'Entregable principal de la auditoría.',
      context: { reportFormat: 'AUDIT_REPORT' },
    }

    return [t1, t2, t3, t4, t5]
  }

  private generateGenericTasks(intent: MissionIntent, missionId: string): PlannedTask[] {
    // Fallback genérico para casos no reconocidos
    const t1: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Analizar instrucción y detectar tipo de caso',
      description: 'Clasificar la instrucción según dominio de negocio para determinar agentes apropiados.',
      assignedTo: 'HADES',
      priority: 'P0',
      dependsOn: [],
      estimatedDuration: 15,
      origin: 'DEMO_GENERATED',
      justification: 'Clasificación inicial para enrutar a especialistas.',
      context: { caseType: 'AUTO_DETECTED' },
    }

    const t2: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Generar plan de tareas específicas (requiere datos del caso)',
      description: 'Generar tareas detalladas específicas al caso empresarial. Actualmente usa plantilla genérica.',
      assignedTo: 'HADES',
      priority: 'P0',
      dependsOn: [t1.id],
      estimatedDuration: 20,
      origin: 'DEMO_GENERATED',
      justification: 'Plan genérico hasta que se tenga caso específico reconocido.',
      context: { note: 'Caso no reconocido por reglas actuales' },
    }

    const t3: PlannedTask = {
      id: uuidv4(),
      missionId,
      title: 'Ejecutar tareas generadas',
      description: 'Ejecutar las tareas del plan asignando a los agentes correspondientes.',
      assignedTo: 'HADES',
      priority: 'P0',
      dependsOn: [t2.id],
      estimatedDuration: 30,
      origin: 'DEMO_GENERATED',
      justification: 'Orquestación y ejecución del plan.',
      context: {},
    }

    return [t1, t2, t3]
  }
}

export function createRuleBasedPlanner(): PlannerProvider {
  return new RuleBasedPlanner()
}
