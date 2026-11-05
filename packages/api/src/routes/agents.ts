import type { FastifyInstance } from 'fastify'
import { requireRole } from '../security.js'
import { hades, charon, persephone, minos, elysium, tartarus, guard, audit } from '../runtime.js'
import { defaultCapabilityRegistry, type AgentName } from '@hades/core'
import { capabilityInventory, isCapabilityImplemented } from '../capability-dispatcher.js'

const agentMap = {
  HADES:      hades,
  CHARON:     charon,
  PERSEPHONE: persephone,
  MINOS:      minos,
  ELYSIUM:    elysium,
  TARTARUS:   tartarus,
} as const

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/agents', async req => {
    requireRole(req, ['ADMIN'])
    const agents = Object.entries(agentMap).map(([name, agent]) => ({
      name,
      id:          agent.id,
      status:      agent.getStatus(),
      currentTask: agent.getCurrentTask(),
      capabilities: defaultCapabilityRegistry.getCapabilitiesByAgent(name as AgentName).map(c => c.id),
    }))
    return ok([...agents, cerberusService()])
  })

  app.get('/agents/:name', async (req, reply) => {
    requireRole(req, ['ADMIN'])
    const { name } = req.params as { name: string }
    if (name.toUpperCase() === 'CERBERUS') return ok(cerberusService())
    const agent = agentMap[name.toUpperCase() as keyof typeof agentMap]
    if (!agent) return reply.code(404).send(err('AGENT_NOT_FOUND', `Agente ${name} no encontrado`))
    return ok({
      name:        agent.name,
      id:          agent.id,
      status:      agent.getStatus(),
      currentTask: agent.getCurrentTask(),
      capabilities: defaultCapabilityRegistry.getCapabilitiesByAgent(agent.name).map(c => c.id),
    })
  })

  app.get('/capabilities', async req => {
    requireRole(req, ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'])
    return ok(capabilityInventory())
  })

  app.get('/capabilities/agents/:name', async (req, reply) => {
    requireRole(req, ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'])
    const { name } = req.params as { name: string }
    const caps = defaultCapabilityRegistry.getCapabilitiesByAgent(name.toUpperCase() as AgentName)
    if (caps.length === 0) {
      return reply.code(404).send(err('NOT_FOUND', `No hay capacidades registradas para el agente ${name}`))
    }
    return ok(caps.map(c => ({ ...c, implemented: isCapabilityImplemented(c.agent, c.id) })))
  })
}

function cerberusService() {
  const stats=audit.getStats(), latest=audit.query({limit:1})[0]
  return { name:'CERBERUS', id:'service:cerberus', status:'IDLE', currentTask:null, service:{available:true, policyVersion:guard.getPolicyVersion(), evaluations:guard.getEvaluationCount(), permitted:stats.byOutcome.PERMIT ?? 0, denied:stats.byOutcome.DENY ?? 0, escalated:stats.byOutcome.ESCALATE ?? 0, latest:latest ? {timestamp:latest.timestamp,decision:latest.guardDecision,operation:latest.operationType} : null, scope:'process'} }
}

function ok<T>(data: T) {
  return { success: true, data, error: null, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function err(code: string, message: string) {
  return { success: false, data: null, error: { code, message }, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function genId(): string { return Math.random().toString(36).slice(2) }

