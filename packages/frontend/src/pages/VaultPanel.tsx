import { useState } from 'react'
import { useHadesStore } from '../store/index.js'
import { apiHeaders, apiPath } from '../lib/api.js'

interface Connection {
  id:     string
  name:   string
  type:   'api' | 'near' | 'ws' | 'db' | 'ai'
  desc:   string
  status: 'connected' | 'simulated' | 'offline' | 'pending'
  note?:  string
}

const CONNECTIONS: Connection[] = [
  {
    id: 'api', name: 'HADES API', type: 'api', status: 'pending',
    desc: 'Fastify backend en puerto 3001. Rutas: /api/v1/missions, /api/v1/agents, /api/v1/cerberus',
  },
  {
    id: 'ws', name: 'WebSocket', type: 'ws', status: 'pending',
    desc: 'Canal en tiempo real para eventos de agentes y misiones.',
  },
  {
    id: 'near', name: 'NEAR Testnet', type: 'near', status: 'simulated',
    desc: 'Red blockchain NEAR. Modo simulación activo — no se gastan fondos reales.',
    note: 'NEAR_EXECUTION_MODE=simulation',
  },
  {
    id: 'cerberus', name: 'CERBERUS Guard', type: 'ai', status: 'simulated',
    desc: 'Motor de políticas determinista. GUARD evalúa 8 reglas. AUDIT registra hash SHA-256.',
  },
  {
    id: 'vercel', name: 'Vercel Serverless', type: 'api', status: 'simulated',
    desc: 'Funciones serverless en /api/health, /api/v1/agents, /api/v1/missions para preview.',
  },
]

interface PolicyEntry {
  id:   string
  name: string
  desc: string
  active: boolean
}

const CERBERUS_POLICIES: PolicyEntry[] = [
  { id: 'p1', name: 'BUDGET_LIMIT',     desc: 'Rechaza operaciones que excedan $1,000,000 MXN',                   active: true },
  { id: 'p2', name: 'HUMAN_APPROVAL',   desc: 'Escala operaciones de contratación o pagos externos',              active: true },
  { id: 'p3', name: 'NO_MAINNET',       desc: 'Bloquea cualquier transacción en NEAR Mainnet',                    active: true },
  { id: 'p4', name: 'AUDIT_ALL',        desc: 'Registra SHA-256 de todas las operaciones ejecutadas',             active: true },
  { id: 'p5', name: 'AGENT_ISOLATION',  desc: 'Los agentes no pueden modificar su propio estado directamente',    active: true },
  { id: 'p6', name: 'RATE_LIMIT',       desc: 'Máximo 100 operaciones por agente por hora',                       active: true },
  { id: 'p7', name: 'DATA_RETENTION',   desc: 'Auditoría se retiene 30 días mínimo',                              active: true },
  { id: 'p8', name: 'ESCALATION_TIMEOUT', desc: 'Escalaciones sin respuesta en 24h se rechazan automáticamente', active: false },
]

export default function VaultPanel(): JSX.Element {
  const { apiReady, wsConnected, nearTxs } = useHadesStore()
  const [tab, setTab] = useState<'connections' | 'policies' | 'env'>('connections')
  const [accountId, setAccountId] = useState('')
  const [accountResult, setAccountResult] = useState<{accountId:string; balanceYocto:string; blockHeight:number} | null>(null)
  const [accountError, setAccountError] = useState('')
  const [checkingAccount, setCheckingAccount] = useState(false)

  async function checkAccount(): Promise<void> {
    setCheckingAccount(true); setAccountError(''); setAccountResult(null)
    try {
      const response = await fetch(apiPath(`/api/v1/near/testnet/account/${encodeURIComponent(accountId.trim())}`), {headers:apiHeaders()})
      const body = await response.json() as {success?:boolean; data?:{accountId:string; balanceYocto:string; blockHeight:number}}
      if (!response.ok || !body.success || !body.data) throw new Error('unavailable')
      setAccountResult(body.data)
    } catch { setAccountError('No se pudo consultar la cuenta. Se requiere una cuenta testnet válida y acceso de administrador.') }
    finally { setCheckingAccount(false) }
  }

  const enriched: Connection[] = CONNECTIONS.map(c => {
    if (c.id === 'api') return { ...c, status: apiReady ? 'connected' : apiReady === false ? 'offline' : 'pending' }
    if (c.id === 'ws')  return { ...c, status: wsConnected ? 'connected' : 'offline' }
    return c
  })

  const statusColor = {
    connected: 'text-permit',
    simulated: 'text-escalate',
    offline:   'text-deny',
    pending:   'text-gray-500',
  }

  const statusIcon = {
    connected: '●',
    simulated: '◎',
    offline:   '○',
    pending:   '…',
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">VAULT</h2>
        <p className="text-[11px] text-gray-600 font-mono">Conexiones, configuración de políticas y estado de integraciones</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0A0A0F] rounded-lg p-1">
        {(['connections', 'policies', 'env'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 font-mono text-[11px] py-2 rounded transition-colors ${
              tab === t ? 'bg-electric/15 text-electric' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {t === 'connections' ? 'CONEXIONES' : t === 'policies' ? 'POLÍTICAS CERBERUS' : 'ENTORNO'}
          </button>
        ))}
      </div>

      {tab === 'connections' && (
        <div className="flex flex-col gap-3">
          {enriched.map(c => (
            <div key={c.id} className="hades-card rounded-lg p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded border border-white/5 flex items-center justify-center flex-shrink-0 text-sm">
                {c.type === 'near' ? '⬡' : c.type === 'ws' ? '⚡' : c.type === 'ai' ? '◉' : c.type === 'db' ? '◫' : '⊛'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs font-semibold text-gray-200">{c.name}</span>
                  <span className={`font-mono text-[10px] ${statusColor[c.status]}`}>
                    {statusIcon[c.status]} {c.status === 'connected' ? 'Conectado' :
                      c.status === 'simulated' ? 'Simulado' :
                      c.status === 'offline'   ? 'Desconectado' : 'Detectando…'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">{c.desc}</p>
                {c.note && (
                  <p className="font-mono text-[10px] text-escalate/70 mt-1">{c.note}</p>
                )}
                {c.id === 'near' && nearTxs.length > 0 && (
                  <p className="font-mono text-[10px] text-gold mt-1">{nearTxs.length} tx registrada(s) en simulación</p>
                )}
                {c.id === 'near' && (
                  <div className="mt-3 flex flex-col gap-2">
                    <label htmlFor="near-testnet-account" className="text-[10px] text-gray-400">Consulta pública de cuenta testnet (solo lectura)</label>
                    <div className="flex gap-2">
                      <input id="near-testnet-account" value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="cuenta.testnet" className="min-w-0 flex-1 rounded bg-black border border-white/20 px-2 py-1 text-xs text-gray-200" />
                      <button type="button" onClick={() => void checkAccount()} disabled={checkingAccount || !accountId.trim()} className="rounded border border-electric/30 px-2 text-xs text-electric disabled:opacity-40">{checkingAccount ? 'Consultando…' : 'Consultar'}</button>
                    </div>
                    {accountResult && <p className="text-[10px] text-gray-300 break-all">{accountResult.accountId} · {accountResult.balanceYocto} yoctoNEAR · bloque {accountResult.blockHeight}</p>}
                    {accountError && <p role="alert" className="text-[10px] text-deny">{accountError}</p>}
                  </div>
                )}
              </div>
            </div>
          ))}
          <p className="font-mono text-[9px] text-gray-700 text-center mt-1">
            Para conectar el backend real: inicia el servidor con `npm run dev` en packages/api
          </p>
        </div>
      )}

      {tab === 'policies' && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Las políticas de CERBERUS son evaluadas de forma determinista por el motor GUARD antes de cada operación.
            Las políticas activas no se pueden desactivar en producción.
          </p>
          {CERBERUS_POLICIES.map(p => (
            <div key={p.id} className={`hades-card rounded-lg px-4 py-3 flex items-start gap-3 ${
              p.active ? '' : 'opacity-50'
            }`}>
              <span className={`flex-shrink-0 font-mono text-sm mt-0.5 ${p.active ? 'text-permit' : 'text-gray-600'}`}>
                {p.active ? '✓' : '○'}
              </span>
              <div className="flex-1">
                <p className={`font-mono text-[11px] font-bold mb-0.5 ${p.active ? 'text-gray-200' : 'text-gray-600'}`}>{p.name}</p>
                <p className="text-[10px] text-gray-500">{p.desc}</p>
              </div>
              <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                p.active ? 'bg-permit/10 text-permit border border-permit/30' : 'bg-gray-800 text-gray-600 border border-gray-700'
              }`}>{p.active ? 'ACTIVA' : 'INACTIVA'}</span>
            </div>
          ))}
          <p className="font-mono text-[9px] text-gray-700 mt-1">
            Para modificar políticas: editar packages/core/src/cerberus/guard.ts · Requiere PR con revisión
          </p>
        </div>
      )}

      {tab === 'env' && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-gray-500">
            Variables de entorno activas. Los valores sensibles no se exponen en el frontend.
          </p>
          {[
            { key: 'NEAR_EXECUTION_MODE', value: 'simulation', type: 'config', desc: 'Modo NEAR: simulation | real' },
            { key: 'VITE_API_URL',        value: '(localhost:3001)', type: 'config', desc: 'URL base de la API backend' },
            { key: 'NODE_ENV',            value: 'development', type: 'env', desc: 'Entorno de ejecución' },
            { key: 'NEAR_ACCOUNT_ID',     value: '••••••', type: 'secret', desc: 'ID de cuenta NEAR testnet' },
            { key: 'NEAR_PRIVATE_KEY',    value: '••••••', type: 'secret', desc: 'Clave privada NEAR (NO expuesta)' },
          ].map(e => (
            <div key={e.key} className="hades-card rounded-lg px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[11px] text-electric">{e.key}</p>
                <p className="text-[10px] text-gray-600">{e.desc}</p>
              </div>
              <span className={`font-mono text-[10px] px-2 py-0.5 rounded border flex-shrink-0 ${
                e.type === 'secret' ? 'border-deny/30 text-deny bg-deny/5' :
                e.type === 'config' ? 'border-escalate/30 text-escalate bg-escalate/5' :
                'border-white/10 text-gray-500'
              }`}>{e.value}</span>
            </div>
          ))}
          <p className="font-mono text-[9px] text-gray-700">
            Variables sensibles están en .env (gitignored) · Ver packages/frontend/.env.example
          </p>
        </div>
      )}
    </div>
  )
}
