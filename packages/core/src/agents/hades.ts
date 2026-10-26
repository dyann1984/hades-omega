import { v4 as uuidv4 } from 'uuid'
import type {
  Mission,
  Task,
  MissionStatus,
  AgentName,
} from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'
import { bus } from '../mission-bus/index.js'

interface SubAgentRegistry {
  CHARON:      { receiveTask: (t: Task) => Promise<any> }
  PERSEPHONE:  { receiveTask: (t: Task) => Promise<any> }
  MINOS:       { receiveTask: (t: Task) => Promise<any> }
  ELYSIUM:     { receiveTask: (t: Task) => Promise<any> }
  TARTARUS:    { receiveTask: (t: Task) => Promise<any> }
}

const DEMO_MISSION_PLAN = [
  { title: 'Evaluar proveedores de infraestructura',      agent: 'CHARON'     as AgentName, priority: 'P0' as const },
  { title: 'Validar presupuesto disponible ($50,000 MXN)', agent: 'PERSEPHONE' as AgentName, priority: 'P0' as const },
  { title: 'Calcular plan de implementación',              agent: 'ELYSIUM'    as AgentName, priority: 'P1' as const },
  { title: 'Revisar escalaciones pendientes',              agent: 'MINOS'      as AgentName, priority: 'P1' as const },
  { title: 'Analizar anomalías y políticas',               agent: 'TARTARUS'   as AgentName, priority: 'P1' as const },
]

export class HadesOrchestrator extends AgentBase {
  private missions:   Map<string, Mission> = new Map()
  private subAgents!: SubAgentRegistry

  constructor(deps: AgentDependencies) {
    super('HADES', deps)
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

    const tasks: Task[] = DEMO_MISSION_PLAN.map(def => ({
      id:          uuidv4(),
      missionId:   mission.id,
      title:       def.title,
      description: def.title,
      assignedTo:  def.agent,
      status:      'ASSIGNED' as const,
      priority:    def.priority,
      dependsOn:   [],
      createdAt:   Date.now(),
      startedAt:   null,
      completedAt: null,
      result:      null,
    }))

    mission.tasks = tasks
    this.updateMissionStatus(mission.id, 'IN_PROGRESS')

    const p0Tasks = tasks.filter(t => t.priority === 'P0')
    const p1Tasks = tasks.filter(t => t.priority === 'P1')

    // Execute P0 tasks in parallel
    await Promise.all(p0Tasks.map(t => this.executeTask(mission, t)))

    // Execute P1 tasks sequentially
    for (const t of p1Tasks) {
      await this.executeTask(mission, t)
    }

    this.generateReport(mission)
    this.setStatus('IDLE')
  }

  private async executeTask(mission: Mission, task: Task): Promise<void> {
    task.status   = 'IN_PROGRESS'
    task.startedAt = Date.now()
    bus.publish({ type: 'TASK_UPDATED', payload: { task } })

    const agentFn = this.subAgents?.[task.assignedTo as keyof SubAgentRegistry]
    if (!agentFn) {
      task.status = 'FAILED'
      return
    }

    try {
      const result   = await agentFn.receiveTask(task)
      task.result    = result
      task.status    = result.success ? 'EXECUTED' : 'FAILED'
      task.completedAt = Date.now()
    } catch (e) {
      task.status = 'FAILED'
    }

    const progress = this.calculateProgress(mission)
    bus.publish({ type: 'TASK_UPDATED', payload: { task } })
    bus.publish({ type: 'MISSION_PROGRESS', payload: { missionId: mission.id, status: mission.status, progress } })
  }

  private calculateProgress(mission: Mission): number {
    const done = mission.tasks.filter(t => ['EXECUTED', 'FAILED'].includes(t.status)).length
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
    const stats   = this.deps.audit.getStats()

    mission.report = {
      missionId:    mission.id,
      summary:      `Misión completada: ${success}/${mission.tasks.length} tareas exitosas. ${stats.nearTxCount} transacciones NEAR registradas.`,
      tasksTotal:   mission.tasks.length,
      tasksSuccess: success,
      tasksFailed:  failed,
      decisions:    Object.entries(stats.byOutcome).map(([o, c]) => ({ outcome: o as any, count: c })),
      nearTxCount:  stats.nearTxCount,
      generatedAt:  Date.now(),
    }

    mission.status      = 'COMPLETED'
    mission.updatedAt   = Date.now()
    mission.completedAt = Date.now()

    bus.publish({ type: 'MISSION_PROGRESS', payload: { missionId: mission.id, status: 'COMPLETED', progress: 100 } })
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
