import { v4 as uuidv4 } from 'uuid'
import type {
  Mission,
  Task,
  MissionStatus,
  AgentName,
} from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'
import { bus } from '../mission-bus/index.js'
import type { PlannerProvider } from '../planning/PlannerProvider.js'
import { createRuleBasedPlanner } from '../planning/RuleBasedPlanner.js'

interface SubAgentRegistry {
  CHARON:      { receiveTask: (t: Task) => Promise<any> }
  PERSEPHONE:  { receiveTask: (t: Task) => Promise<any> }
  MINOS:       { receiveTask: (t: Task) => Promise<any> }
  ELYSIUM:     { receiveTask: (t: Task) => Promise<any> }
  TARTARUS:    { receiveTask: (t: Task) => Promise<any> }
}

export class HadesOrchestrator extends AgentBase {
  private missions:   Map<string, Mission> = new Map()
  private subAgents!: SubAgentRegistry
  private planner:    PlannerProvider

  constructor(deps: AgentDependencies, planner?: PlannerProvider) {
    super('HADES', deps)
    this.planner = planner ?? createRuleBasedPlanner()
  }

  registerSubAgents(agents: SubAgentRegistry): void {
    this.subAgents = agents
  }

  async createMission(title: string, description: string, budgetLimit = 50000): Promise<Mission> {
    this.setStatus('THINKING', `Procesando misión: ${title}`)

    const mission: Mission = {
      id:          uuidv4(),
      title,
      description,
      context: {
        organizationId: 'techcore-industries',
        budgetLimit,
        currency:       'MXN',
        deadline:       null,
        priority:       'HIGH',
        tags:           ['hackathon-demo', 'infraestructura'],
      },
      status:      'RECEIVED',
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
      completedAt: null,
      tasks:       [],
      report:      null,
    }
    this.missions.set(mission.id, mission)

    await delay(600)

    this.setStatus('EXECUTING', `Planificando misión: ${title}`)
    await this.executeMission(mission)
    return this.missions.get(mission.id)!
  }

  private async executeMission(mission: Mission): Promise<void> {
    this.updateMissionStatus(mission.id, 'ANALYZING')
    await delay(400)

    // Usar planificador dinámico en lugar de DEMO_MISSION_PLAN estático
    const planResult = await this.planner.plan({
      title: mission.title,
      description: mission.description,
      context: mission.context,
    })

    // Convertir PlannedTask a Task (formato de dominio)
    const tasks: Task[] = planResult.tasks.map(pt => ({
      id: pt.id,
      missionId: mission.id,
      title: pt.title,
      description: pt.description,
      assignedTo: pt.assignedTo,
      status: 'ASSIGNED' as const,
      priority: pt.priority,
      dependsOn: pt.dependsOn,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      // Campos de trazabilidad
      origin: pt.origin,
      justification: pt.justification,
      estimatedDuration: pt.estimatedDuration,
      context: pt.context,
    }))

    mission.tasks = tasks
    this.updateMissionStatus(mission.id, 'IN_PROGRESS')

    // Ejecutar tareas respetando dependencias (FASE 2)
    await this.executeTasksWithDependencies(mission, tasks)

    this.generateReport(mission)
    this.setStatus('IDLE')
  }

  private async executeTasksWithDependencies(mission: Mission, tasks: Task[]): Promise<void> {
    const completedTaskIds = new Set<string>()
    const pendingTasks = new Map(tasks.map(t => [t.id, t]))

    // Función para verificar si todas las dependencias de una tarea están completadas
    const areDependenciesMet = (task: Task): boolean => {
      return task.dependsOn.every(depId => completedTaskIds.has(depId))
    }

    // Función para encontrar tareas listas para ejecutar
    const findReadyTasks = (): Task[] => {
      return Array.from(pendingTasks.values()).filter(t =>
        t.status === 'ASSIGNED' && areDependenciesMet(t)
      )
    }

    // Ejecutar tareas en orden topológico
    while (pendingTasks.size > 0) {
      const readyTasks = findReadyTasks()

      if (readyTasks.length === 0) {
        // Ciclo de dependencias o error - break para evitar deadlock
        console.error('[HADES] No hay tareas listas para ejecutar - posible ciclo de dependencias')
        break
      }

      // Ejecutar tareas P0 en paralelo, P1 y P2 secuencialmente
      const p0Ready = readyTasks.filter(t => t.priority === 'P0')
      const p1p2Ready = readyTasks.filter(t => t.priority !== 'P0')

      // Ejecutar P0 en paralelo
      await Promise.all(p0Ready.map(t => this.executeTask(mission, t)))

      // Ejecutar P1/P2 secuencialmente (ordenadas por prioridad)
      const sortedP1P2 = p1p2Ready.sort((a, b) => {
        const priorityOrder = { 'P1': 0, 'P2': 1 }
        return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]
      })

      for (const t of sortedP1P2) {
        await this.executeTask(mission, t)
      }

      // Marcar tareas completadas como procesadas
      for (const t of readyTasks) {
        if (t.status === 'EXECUTED') completedTaskIds.add(t.id)
        pendingTasks.delete(t.id)
      }
    }
  }

  private async executeTask(mission: Mission, task: Task): Promise<void> {
    // Idempotencia: si la tarea ya está en estado final, no re-ejecutar
    if (['EXECUTED', 'FAILED', 'CERBERUS_REVIEW'].includes(task.status)) {
      return
    }

    task.status = 'IN_PROGRESS'
    task.startedAt = Date.now()
    bus.publish({ type: 'TASK_UPDATED', payload: { task } })

    const agentFn = this.subAgents?.[task.assignedTo as keyof SubAgentRegistry]
    if (!agentFn) {
      task.status = 'FAILED'
      task.completedAt = Date.now()
      bus.publish({ type: 'TASK_UPDATED', payload: { task } })
      return
    }

    try {
      const result = await agentFn.receiveTask(task)
      task.result = result

      // No marcar como completada si solo produjo resultado simulado
      const isSimulated = (result.data as { simulated?: boolean })?.simulated === true

      if (isSimulated) {
        task.status = 'SUSPENDED' // El resultado simulado no satisface dependencias
        // Agregar nota de simulación al resultado
        if (typeof task.result === 'object' && task.result !== null) {
          Object.assign(task.result, { simulated: true, note: 'Resultado simulado - requiere ejecución real' })
        }
      } else {
        task.status = (result.data as { pendingApproval?: boolean })?.pendingApproval
          ? 'CERBERUS_REVIEW'
          : result.success ? 'EXECUTED' : 'FAILED'
        task.completedAt = Date.now()
      }
    } catch (e) {
      task.status = 'FAILED'
      task.completedAt = Date.now()
    }

    const progress = this.calculateProgress(mission)
    bus.publish({ type: 'TASK_UPDATED', payload: { task } })
    bus.publish({ type: 'MISSION_PROGRESS', payload: { missionId: mission.id, status: mission.status, progress } })
  }

  private calculateProgress(mission: Mission): number {
    const done = mission.tasks.filter(t => ['EXECUTED', 'FAILED', 'CERBERUS_REVIEW'].includes(t.status)).length
    return mission.tasks.length ? Math.round((done / mission.tasks.length) * 100) : 0
  }

  private updateMissionStatus(id: string, status: MissionStatus): void {
    const m = this.missions.get(id)
    if (!m) return
    m.status    = status
    m.updatedAt = Date.now()
    bus.publish({ type: 'MISSION_PROGRESS', payload: { missionId: id, status, progress: this.calculateProgress(m) } })
  }

  private generateReport(mission: Mission): void {
    const success = mission.tasks.filter(t => t.status === 'EXECUTED').length
    const failed  = mission.tasks.filter(t => t.status === 'FAILED').length
    const pending = mission.tasks.filter(t => !['EXECUTED', 'FAILED'].includes(t.status)).length
    const stats   = this.deps.audit.getStats()

    mission.report = {
      missionId:    mission.id,
      summary:      pending
        ? `Misión incompleta: ${pending} tarea(s) pendientes o suspendidas; no se autorizaron dependencias.`
        : `Misión ${failed ? 'fallida' : 'completada'}: ${success}/${mission.tasks.length} tareas exitosas. ${stats.nearTxCount} transacciones NEAR registradas.`,
      tasksTotal:   mission.tasks.length,
      tasksSuccess: success,
      tasksFailed:  failed,
      decisions:    Object.entries(stats.byOutcome).map(([o, c]) => ({ outcome: o as any, count: c })),
      nearTxCount:  stats.nearTxCount,
      generatedAt:  Date.now(),
    }

    mission.status      = pending ? 'PARTIAL_COMPLETE' : failed ? 'FAILED' : 'COMPLETED'
    mission.updatedAt   = Date.now()
    mission.completedAt = pending ? null : Date.now()

    bus.publish({ type: 'MISSION_PROGRESS', payload: { missionId: mission.id, status: mission.status, progress: this.calculateProgress(mission) } })
  }

  getMission(id: string): Mission | null  { return this.missions.get(id) ?? null }
  getAllMissions(): Mission[]              { return Array.from(this.missions.values()) }

  async receiveTask(task: Task) {
    return { taskId: task.id, success: true, summary: 'Orquestación completada', data: {}, cerberusIds: [] }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
