import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskResult } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'

export class ElysiumAgent extends AgentBase {
  constructor(deps: AgentDependencies) {
    super('ELYSIUM', deps)
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
    this.setStatus('THINKING', task.title)
    await delay(600)

    this.setStatus('EXECUTING', 'Calculando plan de ejecución')
    await delay(400)

    const { decision, auditId } = await this.proposeOperation(
      'PLANNING',
      { objectives: [task.description], estimatedDays: 5 },
      task.missionId,
      task.id,
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId:   task.id,
      success:  true,
      summary:  'Plan de implementación calculado: 5 días, 3 fases [DEMO]',
      data: {
        phases: [
          { id: uuidv4(), name: 'Preparación', days: 1, tasks: ['Configurar entorno', 'Asignar recursos'] },
          { id: uuidv4(), name: 'Migración',   days: 3, tasks: ['Migrar datos', 'Validar integridad', 'Pruebas'] },
          { id: uuidv4(), name: 'Producción',  days: 1, tasks: ['Cutover', 'Monitoreo inicial'] },
        ],
        estimatedDays: 5,
        confidence:    0.87,
        decision,
      },
      cerberusIds: [auditId],
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
