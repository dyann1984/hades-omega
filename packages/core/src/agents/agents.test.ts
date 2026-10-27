import { describe, it, expect, beforeEach } from 'vitest'
import { CerberusGUARD } from '../cerberus/guard.js'
import { CerberusAUDIT } from '../cerberus/audit.js'
import { NEARBridge }    from '../near-bridge/index.js'
import { CharonAgent }   from './charon.js'
import { PersephoneAgent } from './persephone.js'
import { ElysiumAgent }  from './elysium.js'
import { TartarusAgent } from './tartarus.js'
import type { Task } from '../types/index.js'
import { v4 as uuidv4 } from 'uuid'

function makeDeps() {
  return {
    guard: new CerberusGUARD(),
    audit: new CerberusAUDIT(),
    near:  new NEARBridge(),
  }
}

function makeTask(assignedTo: string, overrides: Partial<Task> = {}): Task {
  return {
    id:          uuidv4(),
    missionId:   uuidv4(),
    title:       'Test task',
    description: 'Test description',
    assignedTo:  assignedTo as any,
    status:      'ASSIGNED',
    priority:    'P0',
    dependsOn:   [],
    createdAt:   Date.now(),
    startedAt:   null,
    completedAt: null,
    result:      null,
    ...overrides,
  }
}

describe('CharonAgent', () => {
  it('returns a TaskResult after receiving a task', async () => {
    const agent  = new CharonAgent(makeDeps())
    const task   = makeTask('CHARON')
    const result = await agent.receiveTask(task)

    expect(result.taskId).toBe(task.id)
    expect(typeof result.success).toBe('boolean')
    expect(typeof result.summary).toBe('string')
    expect(result.cerberusIds.length).toBeGreaterThanOrEqual(1)
  }, 15000)

  it('starts as IDLE', () => {
    const agent = new CharonAgent(makeDeps())
    expect(agent.getStatus()).toBe('IDLE')
  })

  it('returns to IDLE after task', async () => {
    const agent = new CharonAgent(makeDeps())
    await agent.receiveTask(makeTask('CHARON'))
    expect(agent.getStatus()).toBe('IDLE')
  }, 15000)
})

describe('PersephoneAgent', () => {
  it('returns TaskResult', async () => {
    const agent  = new PersephoneAgent(makeDeps())
    const result = await agent.receiveTask(makeTask('PERSEPHONE'))
    expect(result.taskId).toBeDefined()
    expect(typeof result.success).toBe('boolean')
  }, 10000)

  it('tracks available budget', () => {
    const agent = new PersephoneAgent(makeDeps())
    expect(agent.getAvailableBudget()).toBe(50000)
  })
})

describe('ElysiumAgent', () => {
  it('returns plan with phases', async () => {
    const agent  = new ElysiumAgent(makeDeps())
    const result = await agent.receiveTask(makeTask('ELYSIUM'))
    expect(result.success).toBe(true)
    expect((result.data as any).phases).toHaveLength(3)
  }, 10000)
})

describe('TartarusAgent', () => {
  it('reports anomalies from audit history', async () => {
    const deps  = makeDeps()
    const agent = new TartarusAgent(deps)
    const result = await agent.receiveTask(makeTask('TARTARUS'))
    expect(result.success).toBe(true)
  }, 10000)

  it('starts with IDLE status', () => {
    const agent = new TartarusAgent(makeDeps())
    expect(agent.getStatus()).toBe('IDLE')
  })
})

describe('NEARBridge', () => {
  it('simulates a transaction', async () => {
    const bridge = new NEARBridge()
    const tx = await bridge.storeAuditHash({
      auditId:       uuidv4(),
      contentHash:   'a'.repeat(64),
      operationType: 'PURCHASE_ORDER',
      agentName:     'CHARON',
      decision:      'PERMIT',
      timestampMs:   Date.now(),
    })
    expect(tx.txHash).toBeDefined()
    expect(tx.explorerUrl).toBe('')
    expect(tx.txHash).toMatch(/^DEMO-/)
    expect(bridge.getStatus().connected).toBe(false)
    expect(tx.mode).toBe('simulation')
  }, 5000)

  it('returns correct status', () => {
    const bridge  = new NEARBridge()
    const status  = bridge.getStatus()
    expect(status.networkId).toBe('testnet')
    expect(status.contractId).toBe('audit.hades-omega.testnet')
  })
})
