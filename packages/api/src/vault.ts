import type { SqliteRepository } from './sqlite.js'
import type { NearSubmissionService } from './near/submission.js'
import { guard } from './runtime.js'

export type ConnectionState = 'OPERATIONAL' | 'DEGRADED' | 'DISABLED' | 'CONFIGURATION_PENDING' | 'ERROR'
export interface VaultConnection { id: string; name: string; state: ConnectionState; detail: string; facts: Record<string, string | number | boolean | null> }

/**
 * Closed list of settings the Vault may describe. `secret` entries only ever report whether they are set; their value
 * is never read into the response. Anything not listed here is invisible to the browser.
 */
const SETTINGS: ReadonlyArray<{ key: string; kind: 'public' | 'secret'; description: string }> = [
  { key: 'NODE_ENV', kind: 'public', description: 'Entorno de ejecución' },
  { key: 'NEAR_EXECUTION_MODE', kind: 'public', description: 'Modo NEAR (simulation | demo | testnet | real)' },
  { key: 'NEAR_SIGNING_ENABLED', kind: 'public', description: 'Interruptor maestro de firma (solo "true" la activa)' },
  { key: 'NEAR_AUDIT_CONTRACT_ID', kind: 'public', description: 'Contrato de auditoría (identificador público de cuenta)' },
  { key: 'NEAR_SIGNER_ACCOUNT_ID', kind: 'public', description: 'Cuenta firmante (identificador público)' },
  { key: 'NEAR_SIGNER_PRIVATE_KEY', kind: 'secret', description: 'Clave privada del firmante' },
  { key: 'NEAR_SIGNER_KEY_FILE', kind: 'secret', description: 'Archivo de credenciales del firmante' },
  { key: 'JWT_SECRET', kind: 'secret', description: 'Secreto de firma de sesiones' },
  { key: 'CHRONOS_TICK_SECRET', kind: 'secret', description: 'Secreto del endpoint externo de CHRONOS' },
  { key: 'ANTHROPIC_API_KEY', kind: 'secret', description: 'Clave del planificador LLM (opcional)' },
  { key: 'ALLOWED_ORIGIN', kind: 'public', description: 'Orígenes CORS permitidos' },
]

export interface VaultDeps {
  repository: SqliteRepository
  near: NearSubmissionService
  wsClients: () => number
  env?: NodeJS.ProcessEnv
  now?: () => number
  startedAt?: number
}

const present = (v: string | undefined): boolean => typeof v === 'string' && v.trim().length > 0

export function buildVaultStatus(deps: VaultDeps) {
  const { repository, near } = deps, env = deps.env ?? process.env, now = (deps.now ?? Date.now)()
  const connections: VaultConnection[] = []

  connections.push({ id: 'api', name: 'HADES API', state: 'OPERATIONAL', detail: 'Este endpoint respondió; la API está en ejecución.', facts: { uptimeSeconds: Math.round(process.uptime()), version: '0.3.0' } })

  const dbOk = repository.ping()
  const integrity = dbOk ? repository.verifyAuditIntegrity() : null
  connections.push({
    id: 'database', name: 'Base de datos SQLite', state: !dbOk ? 'ERROR' : integrity?.verified ? 'OPERATIONAL' : 'DEGRADED',
    detail: !dbOk ? 'La base de datos no responde.' : integrity?.verified ? 'Responde y la cadena de auditoría SHA-256 es íntegra.' : 'Responde, pero la cadena de auditoría NO verifica.',
    facts: { auditChainVerified: integrity?.verified ?? null, auditEvents: (integrity as { checked?: number } | null)?.checked ?? null },
  })

  const clients = deps.wsClients()
  connections.push({ id: 'websocket', name: 'WebSocket', state: 'OPERATIONAL', detail: 'El servidor acepta conexiones en /ws. El estado del cliente del navegador se muestra aparte.', facts: { clientsConnected: clients } })

  const policy = guard.getPolicy()
  const stopped = repository.gate.isStopped()
  const tools = repository.gate.listTools()
  connections.push({
    id: 'cerberus', name: 'CERBERUS', state: stopped ? 'DISABLED' : 'OPERATIONAL',
    detail: stopped ? 'Parada de emergencia ACTIVA: todo efecto sensible está bloqueado.' : 'Motor de reglas y puerta de autorización activos.',
    facts: { policyVersion: policy.version, rulesActive: policy.rules.filter(r => r.active).length, rulesTotal: policy.rules.length, registeredTools: tools.length, emergencyStop: stopped },
  })

  const chronos = repository.chronos
  const summary = chronos.summary()
  const schedulerOn = chronos.isRunning()
  const externalTick = present(env['CHRONOS_TICK_SECRET'])
  connections.push({
    id: 'chronos', name: 'CHRONOS', state: schedulerOn || externalTick ? 'OPERATIONAL' : 'DISABLED',
    detail: schedulerOn ? 'Planificador en proceso activo.' : externalTick ? 'Planificador en proceso apagado; se espera un tick externo autenticado.' : 'Sin planificador en proceso ni tick externo: las tareas programadas no se ejecutarán.',
    facts: { schedulerInProcess: schedulerOn, externalTickConfigured: externalTick, activeTasks: summary.tasks['ACTIVE'] ?? 0, nextRunAt: summary.nextRunAt, lastFinishedAt: summary.lastFinishedAt },
  })

  const ns = near.status()
  const pending = ns.blockers.filter(b => b === 'NO_SIGNER' || b === 'NO_CONTRACT_CONFIGURED')
  connections.push({
    id: 'near', name: 'NEAR testnet',
    state: pending.length ? 'CONFIGURATION_PENDING' : ns.blockers.length ? 'DISABLED' : 'OPERATIONAL',
    detail: pending.length
      ? 'Configuración pendiente: falta ' + pending.map(b => (b === 'NO_SIGNER' ? 'cuenta firmante' : 'contrato de auditoría')).join(' y ') + '. No se ha firmado ni enviado ninguna transacción.'
      : ns.blockers.length ? 'Configurado, con la firma desactivada (interruptor maestro o modo).' : 'Configurado para firmar en testnet. "Configurado" no prueba que el contrato esté desplegado: la sonda y el preflight lo comprueban.',
    facts: { executionMode: ns.executionMode, signerAccountId: ns.signerAccountId, contractId: ns.contractId, signingEnabled: ns.signingEnabled, blockers: ns.blockers.join(',') || null },
  })

  const llm = present(env['ANTHROPIC_API_KEY'])
  const pol = repository.llmPolicy.get()
  const llmUsed = repository.llmPolicy.usageToday()
  connections.push({
    id: 'planner', name: 'Planificador LLM (Anthropic)',
    state: llm && pol.enabled ? 'OPERATIONAL' : 'DISABLED',
    detail: !llm ? 'Sin clave: se usa el planificador determinista por reglas.'
      : !pol.enabled ? 'Clave configurada pero el egreso a IA generativa no está autorizado por un administrador: no sale ningún dato; se usa el planificador por reglas.'
      : 'Egreso autorizado por un administrador. Cada llamada pasa por CERBERUS (herramienta llm.plan, clase EGRESS), solo se envía a api.anthropic.com, se minimiza (título, descripción y prioridad, con datos sensibles tachados), respeta cuota, tokens y costo estimado, y se registra solo con hash. La parada de emergencia la bloquea. Clave configurada, no verificada contra el proveedor.',
    facts: { keyConfigured: llm, enabled: pol.enabled, callsToday: llmUsed.calls, estCostTodayUsd: Number(llmUsed.estCostUsd.toFixed(6)), dailyLimit: pol.dailyLimit, dailyCostCapUsd: pol.dailyCostCapUsd, maxInputTokens: pol.maxInputTokens, maxOutputTokens: pol.maxOutputTokens, provider: 'api.anthropic.com' },
  })

  const pendingApprovals = (repository.gate.listApprovals('PENDING') as unknown[]).length
  return {
    generatedAt: now,
    connections,
    security: { emergencyStop: stopped, pendingApprovals, policyHash: guard.getPolicyHash().slice(0, 16) },
    settings: SETTINGS.map(s => ({ key: s.key, kind: s.kind, description: s.description, configured: present(env[s.key]), ...(s.kind === 'public' && present(env[s.key]) ? { value: String(env[s.key]).slice(0, 120) } : {}) })),
    chronos: { summary, recentRuns: chronos.runs(undefined, 10).map(r => ({ id: r.id, taskId: r.taskId, status: r.status, trigger: r.trigger, attempt: r.attempt, scheduledFor: r.scheduledFor, finishedAt: r.finishedAt, error: r.error })) },
    rules: policy.rules.map(r => ({ id: r.id, name: r.name, description: r.description, outcome: r.outcome, active: r.active, priority: r.priority })),
    tools,
  }
}
