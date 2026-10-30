import { describe, it, expect, vi } from 'vitest'
import { HadesOrchestrator } from './hades.js'
import { CerberusGUARD } from '../cerberus/guard.js'
import { CerberusAUDIT } from '../cerberus/audit.js'
import { NEARBridge } from '../near-bridge/index.js'
import type { PlannerProvider, PlannedTask } from '../planning/PlannerProvider.js'

function task(id: string, dependsOn: string[] = []): PlannedTask {
  return { id, missionId: 'incorrect-planner-id', title: id, description: id, assignedTo: 'CHARON', priority: 'P0', dependsOn, estimatedDuration: 1, origin: 'RULE_BASED', justification: 'test' }
}
function setup(result: { success: boolean; data: unknown }) {
  const planner: PlannerProvider = {
    plan: async () => ({ tasks: [task('a'), task('b', ['a'])], estimatedTotalDuration: 2, warnings: [], simulated: false }),
    validateDependencies: () => ({ valid: true, cycles: [] }), getProviderName: () => 'test',
  }
  const agent = { receiveTask: vi.fn(async (t) => ({ taskId: t.id, summary: 'test', cerberusIds: [], ...result })) }
  const hades = new HadesOrchestrator({ guard: new CerberusGUARD(), audit: new CerberusAUDIT(), near: new NEARBridge() }, planner)
  hades.registerSubAgents({ CHARON: agent, PERSEPHONE: agent, MINOS: agent, ELYSIUM: agent, TARTARUS: agent })
  return { hades, agent }
}
describe('mission dependency safety', () => {
  it('does not run dependent tasks after a failure and uses the real mission ID', async () => {
    const { hades, agent } = setup({ success: false, data: {} })
    const mission = await hades.createMission('Test mission', 'Test description')
    expect(agent.receiveTask).toHaveBeenCalledTimes(1)
    expect(mission.tasks.every(t => t.missionId === mission.id)).toBe(true)
    expect(mission.tasks.map(t => t.status)).toEqual(['FAILED', 'ASSIGNED'])
    expect(mission.status).toBe('FAILED')
    expect(mission.tasks[1]!.result?.success).toBe(false)
  })
  it('does not retry a simulated result or execute its dependents', async () => {
    const { hades, agent } = setup({ success: true, data: { simulated: true } })
    const mission = await hades.createMission('Test mission', 'Test description')
    expect(agent.receiveTask).toHaveBeenCalledTimes(1)
    expect(mission.tasks.map(t => t.status)).toEqual(['SUSPENDED', 'ASSIGNED'])
    expect(mission.tasks[0]!.result?.success).toBe(false)
    expect(mission.status).toBe('PARTIAL_COMPLETE')
  })
})

