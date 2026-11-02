import { useCallback, useEffect, useState } from 'react'
import { useHadesStore } from '../store/index.js'
import { apiHeaders, apiPath, isDemoToken } from '../lib/api.js'

type State = 'OPERATIONAL' | 'DEGRADED' | 'DISABLED' | 'CONFIGURATION_PENDING' | 'ERROR'
interface Connection { id: string; name: string; state: State; detail: string; facts: Record<string, string | number | boolean | null> }
interface Setting { key: string; kind: 'public' | 'secret'; description: string; configured: boolean; value?: string }
interface Rule { id: string; name: string; description: string; outcome: string; active: boolean; priority: number }
interface Tool { id: string; description: string; effect: string; agents: string[]; roles: string[]; requiresApproval: boolean; maxAmount?: number; dailyBudget?: number }
interface Run { id: string; taskId: string; status: string; trigger: string; attempt: number; scheduledFor: number; finishedAt: number | null; error: string | null }
interface VaultStatus {
  generatedAt: number; connections: Connection[]; security: { emergencyStop: boolean; pendingApprovals: number; policyHash: string }
  settings: Setting[]; rules: Rule[]; tools: Tool[]
  chronos: { summary: { tasks: Record<string, number>; runs: Record<string, number>; nextRunAt: number | null; lastFinishedAt: number | null }; recentRuns: Run[] }
}
interface Approval { id: string; tool: string; agent: string; paramsHash: string; requestedBy: string; status: string; decidedBy: string | null; decidedAt: number | null; justification: string | null; createdAt: number; expiresAt: number | null; consumedAt: number | null }
interface Recipient { tool: string; recipient: string; addedBy: string; addedAt: number }
interface Probe { reachable: boolean; chainId: string | null; contractDeployed: boolean | null; ownerMatchesSigner: boolean | null; signerKeyPresent: boolean | null; error?: string }

const STATE_TEXT: Record<State, { label: string; cls: string; icon: string }> = {
  OPERATIONAL: { label: 'Operativo', cls: 'text-permit', icon: '●' },
  DEGRADED: { label: 'Degradado', cls: 'text-escalate', icon: '◐' },
  DISABLED: { label: 'Desactivado', cls: 'text-gray-500', icon: '○' },
  CONFIGURATION_PENDING: { label: 'Configuración pendiente', cls: 'text-escalate', icon: '◎' },
  ERROR: { label: 'Error', cls: 'text-deny', icon: '✕' },
}
type Tab = 'connections' | 'policies' | 'approvals' | 'recipients' | 'chronos' | 'env'
const TABS: Array<[Tab, string]> = [['connections', 'CONEXIONES'], ['policies', 'POLÍTICAS'], ['approvals', 'APROBACIONES'], ['recipients', 'DESTINATARIOS'], ['chronos', 'CHRONOS'], ['env', 'ENTORNO']]
const fmt = (t: number | null): string => (t ? new Date(t).toLocaleString('es-MX') : '—')

export default function VaultPanel(): JSX.Element {
  const { apiReady, wsConnected, addNotification } = useHadesStore()
  const [tab, setTab] = useState<Tab>('connections')
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [probe, setProbe] = useState<Probe | null>(null)
  const [busy, setBusy] = useState(false)
  const [newRecipient, setNewRecipient] = useState('')
  const [accountId, setAccountId] = useState('')
  const [accountResult, setAccountResult] = useState<{ accountId: string; balanceYocto: string; blockHeight: number } | null>(null)
  const [accountError, setAccountError] = useState('')
  const [checkingAccount, setCheckingAccount] = useState(false)

  const call = useCallback(async (path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
    try {
      const res = await fetch(apiPath(`/api/v1${path}`), { method, headers: apiHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const json = await res.json().catch(() => ({})) as { data?: unknown; error?: { code?: string; message?: string } }
      return res.ok ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? json.error?.code ?? `HTTP ${res.status}` }
    } catch { return { ok: false, error: 'API no disponible' } }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const [s, a, r] = await Promise.all([call('/vault/status'), call('/cerberus/gate/approvals'), call('/cerberus/gate/recipients')])
    if (!s.ok) { setStatus(null); setError(isDemoToken() ? 'Vault real requiere una sesión ADMIN con persistencia; las sesiones DEMO no consultan el backend.' : s.error ?? 'Error'); return }
    setError(null); setStatus(s.data as VaultStatus)
    if (a.ok) setApprovals(a.data as Approval[])
    if (r.ok) setRecipients(r.data as Recipient[])
  }, [call])
  useEffect(() => { void refresh(); const t = setInterval(() => { void refresh() }, 20_000); return () => clearInterval(t) }, [refresh])

  async function act(label: string, path: string, body?: unknown): Promise<boolean> {
    setBusy(true); const res = await call(path, 'POST', body); setBusy(false)
    addNotification(res.ok ? 'info' : 'error', `VAULT: ${res.ok ? label : res.error}`)
    await refresh(); return res.ok
  }
  async function runProbe(): Promise<void> { setBusy(true); const res = await call('/vault/near/probe', 'POST'); setBusy(false); if (res.ok) setProbe(res.data as Probe); else addNotification('error', `VAULT: ${res.error}`) }
  async function checkAccount(): Promise<void> {
    setCheckingAccount(true); setAccountError(''); setAccountResult(null)
    const res = await call(`/near/testnet/account/${encodeURIComponent(accountId.trim())}`)
    if (res.ok && res.data) setAccountResult(res.data as { accountId: string; balanceYocto: string; blockHeight: number })
    else setAccountError('No se pudo consultar la cuenta. Se requiere una cuenta testnet válida y acceso de administrador.')
    setCheckingAccount(false)
  }

  const card = 'hades-card rounded-lg px-4 py-3'
  const btn = 'font-mono text-[10px] border px-2 py-1 rounded transition-colors disabled:opacity-40'
  const primary = `${btn} text-electric border-electric/40 hover:bg-electric/10`
  const pending = approvals.filter(a => a.status === 'PENDING')
  const history = approvals.filter(a => a.status !== 'PENDING')
  const nearTools = (status?.tools ?? []).filter(t => t.effect === 'BLOCKCHAIN' || t.effect === 'FINANCIAL' || t.effect === 'EXTERNAL')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">VAULT</h2>
        <p className="text-[11px] text-gray-600 font-mono">Estado real consultado al backend{status ? ` · ${fmt(status.generatedAt)}` : ''}. Los secretos nunca llegan al navegador.</p>
      </div>
      {error && <div role="alert" className={`${card} text-[11px] text-escalate font-mono`}>{error}</div>}

      {status && (
        <div className={`${card} flex flex-wrap items-center gap-3 font-mono text-[11px]`}>
          <span className={status.security.emergencyStop ? 'text-deny font-bold' : 'text-gray-400'}>Parada de emergencia: {status.security.emergencyStop ? 'ACTIVA' : 'inactiva'}</span>
          <span className="text-gray-500">Aprobaciones pendientes: <b className="text-gray-200">{status.security.pendingApprovals}</b></span>
          <span className="text-gray-600">Política {status.security.policyHash}…</span>
          <button className={`${btn} ${status.security.emergencyStop ? 'text-permit border-permit/40' : 'text-deny border-deny/40'} ml-auto`} disabled={busy}
            onClick={() => { const next = !status.security.emergencyStop; if (window.confirm(next ? 'Activar la parada de emergencia bloquea todo efecto sensible (NEAR, financiero, externo). ¿Continuar?' : '¿Reanudar las operaciones sensibles?')) void act(next ? 'parada de emergencia activada' : 'parada de emergencia desactivada', '/cerberus/emergency-stop', { stopped: next }) }}>
            {status.security.emergencyStop ? 'Reanudar' : 'Activar parada'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1 bg-[#0A0A0F] rounded-lg p-1">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 font-mono text-[11px] py-2 px-2 rounded transition-colors ${tab === t ? 'bg-electric/15 text-electric' : 'text-gray-600 hover:text-gray-400'}`}>
            {label}{t === 'approvals' && pending.length > 0 ? ` (${pending.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'connections' && (
        <div className="flex flex-col gap-3">
          <div className={`${card} flex flex-wrap gap-x-6 font-mono text-[11px] text-gray-400`}>
            <span>Navegador → API: <b className={apiReady ? 'text-permit' : 'text-deny'}>{apiReady ? 'conectado' : apiReady === false ? 'sin conexión' : 'detectando…'}</b></span>
            <span>Navegador → WebSocket: <b className={wsConnected ? 'text-permit' : 'text-deny'}>{wsConnected ? 'conectado' : 'sin conexión'}</b></span>
          </div>
          {!status && !error && <p className="font-mono text-[11px] text-gray-600">Consultando el backend…</p>}
          {status?.connections.map(c => {
            const st = STATE_TEXT[c.state]
            return (
              <div key={c.id} className={`${card} flex flex-col gap-1`}>
                <div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-gray-200">{c.name}</span><span className={`font-mono text-[10px] ${st.cls}`}>{st.icon} {st.label}</span></div>
                <p className="text-[11px] text-gray-500 leading-snug">{c.detail}</p>
                <p className="font-mono text-[10px] text-gray-600 break-all">{Object.entries(c.facts).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}</p>
                {c.id === 'near' && (
                  <div className="mt-2 flex flex-col gap-2">
                    <div className="flex items-center gap-2"><button className={primary} disabled={busy} onClick={() => { void runProbe() }}>Sondear red (solo lectura)</button>
                      {probe && <span className="font-mono text-[10px] text-gray-400">{probe.reachable ? `red ${probe.chainId}` : `inalcanzable${probe.error ? `: ${probe.error}` : ''}`}{probe.contractDeployed !== null && ` · contrato desplegado: ${probe.contractDeployed ? 'sí' : 'no'}`}{probe.ownerMatchesSigner !== null && ` · propietario = firmante: ${probe.ownerMatchesSigner ? 'sí' : 'no'}`}{probe.signerKeyPresent !== null && ` · clave en cuenta: ${probe.signerKeyPresent ? 'sí' : 'no'}`}</span>}</div>
                    <label htmlFor="near-testnet-account" className="text-[10px] text-gray-400">Consulta pública de cuenta testnet (solo lectura)</label>
                    <div className="flex gap-2">
                      <input id="near-testnet-account" value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="cuenta.testnet" className="min-w-0 flex-1 rounded bg-black border border-white/20 px-2 py-1 text-xs text-gray-200" />
                      <button type="button" onClick={() => { void checkAccount() }} disabled={checkingAccount || !accountId.trim()} className="rounded border border-electric/30 px-2 text-xs text-electric disabled:opacity-40">{checkingAccount ? 'Consultando…' : 'Consultar'}</button>
                    </div>
                    {accountResult && <p className="text-[10px] text-gray-300 break-all">{accountResult.accountId} · {accountResult.balanceYocto} yoctoNEAR · bloque {accountResult.blockHeight}</p>}
                    {accountError && <p role="alert" className="text-[10px] text-deny">{accountError}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'policies' && status && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-gray-500">Reglas del motor GUARD y herramientas registradas en la puerta de autorización, tal como las lee el servidor ahora. Son de solo lectura aquí.</p>
          <p className="font-mono text-[10px] text-gray-500 tracking-widest">REGLAS ({status.rules.filter(r => r.active).length}/{status.rules.length} activas)</p>
          {status.rules.map(r => (
            <div key={r.id} className={`${card} flex items-start gap-3 ${r.active ? '' : 'opacity-50'}`}>
              <span className={`font-mono text-sm ${r.active ? 'text-permit' : 'text-gray-600'}`}>{r.active ? '✓' : '○'}</span>
              <div className="flex-1"><p className="font-mono text-[11px] font-bold text-gray-200">{r.id} · {r.name}</p><p className="text-[10px] text-gray-500">{r.description}</p></div>
              <span className="font-mono text-[9px] text-gray-500 border border-white/10 px-1.5 py-0.5 rounded">{r.outcome}</span>
            </div>
          ))}
          <p className="font-mono text-[10px] text-gray-500 tracking-widest mt-2">HERRAMIENTAS ({status.tools.length})</p>
          {status.tools.map(t => (
            <div key={t.id} className={`${card} font-mono text-[10px] text-gray-400`}>
              <span className="text-gray-200">{t.id}</span> · efecto <b>{t.effect}</b> · {t.requiresApproval ? 'requiere aprobación humana' : 'sin aprobación'} · agentes {t.agents.join(', ')}
              {t.maxAmount !== undefined && ` · máx ${t.maxAmount}`}{t.dailyBudget !== undefined && ` · presupuesto diario ${t.dailyBudget}`}
            </div>
          ))}
        </div>
      )}

      {tab === 'approvals' && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-gray-500">Una aprobación autoriza una única ejecución con los parámetros exactos (hash). No ejecuta nada por sí misma y quien la solicita no puede aprobarla.</p>
          <p className="font-mono text-[10px] text-gray-500 tracking-widest">PENDIENTES ({pending.length})</p>
          {pending.length === 0 && <p className="font-mono text-[11px] text-gray-600">No hay aprobaciones pendientes.</p>}
          {pending.map(a => (
            <div key={a.id} className={`${card} flex flex-col gap-1 font-mono text-[10px] text-gray-400`}>
              <span><b className="text-gray-200">{a.tool}</b> · agente {a.agent} · solicitó {a.requestedBy} · {fmt(a.createdAt)}</span>
              <span className="break-all">parámetros sha256 {a.paramsHash}</span>
              <div className="flex gap-2"><button className={primary} disabled={busy} onClick={() => { const j = window.prompt('Justificación de la aprobación (obligatoria):'); if (j && j.trim().length >= 3) void act('aprobación registrada', `/cerberus/gate/approvals/${a.id}/decision`, { status: 'APPROVED', justification: j.trim() }) }}>Aprobar</button>
                <button className={`${btn} text-gray-400 border-white/10`} disabled={busy} onClick={() => { const j = window.prompt('Motivo del rechazo (obligatorio):'); if (j && j.trim().length >= 3) void act('rechazo registrado', `/cerberus/gate/approvals/${a.id}/decision`, { status: 'REJECTED', justification: j.trim() }) }}>Rechazar</button></div>
            </div>
          ))}
          <p className="font-mono text-[10px] text-gray-500 tracking-widest mt-2">HISTORIAL ({history.length})</p>
          {history.map(a => (
            <div key={a.id} className={`${card} font-mono text-[10px] text-gray-400`}>
              <b className={a.status === 'APPROVED' ? 'text-permit' : 'text-deny'}>{a.status}</b> · {a.tool} · por {a.decidedBy ?? '—'} · {fmt(a.decidedAt)}{a.consumedAt ? ` · consumida ${fmt(a.consumedAt)}` : a.status === 'APPROVED' ? ' · sin consumir' : ''}
              {a.justification && <span className="block text-gray-500">«{a.justification}»</span>}
            </div>
          ))}
        </div>
      )}

      {tab === 'recipients' && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-gray-500">Un destino que no esté en la lista permitida de su herramienta es rechazado por CERBERUS. Cada cambio queda en la auditoría. Solo ADMIN.</p>
          <div className={`${card} flex flex-wrap gap-2 items-center`}>
            <select aria-label="Herramienta" id="recipient-tool" className="bg-[#0A0A0F] border border-obsidian-700 rounded px-2 py-1 text-xs text-gray-200 font-mono">{(nearTools.length ? nearTools : status?.tools ?? []).map(t => <option key={t.id}>{t.id}</option>)}</select>
            <input aria-label="Destinatario" value={newRecipient} onChange={e => setNewRecipient(e.target.value.trim().toLowerCase())} placeholder="contrato.testnet" className="min-w-0 flex-1 rounded bg-black border border-white/20 px-2 py-1 text-xs text-gray-200 font-mono" />
            <button className={primary} disabled={busy || !newRecipient} onClick={() => { const tool = (document.getElementById('recipient-tool') as HTMLSelectElement).value; if (window.confirm(`¿Permitir que «${tool}» envíe a ${newRecipient}?`)) void act('destinatario agregado', '/cerberus/gate/recipients/add', { tool, recipient: newRecipient }).then(ok => { if (ok) setNewRecipient('') }) }}>Agregar</button>
          </div>
          {recipients.length === 0 && <p className="font-mono text-[11px] text-gray-600">Lista vacía: ningún destino está permitido todavía.</p>}
          {recipients.map(r => (
            <div key={`${r.tool}|${r.recipient}`} className={`${card} flex items-center gap-3 font-mono text-[10px] text-gray-400`}>
              <span className="flex-1 break-all"><b className="text-gray-200">{r.recipient}</b> · {r.tool} · agregó {r.addedBy} · {fmt(r.addedAt)}</span>
              <button className={`${btn} text-deny border-deny/40`} disabled={busy} onClick={() => { if (window.confirm(`¿Quitar a ${r.recipient} de ${r.tool}?`)) void act('destinatario eliminado', '/cerberus/gate/recipients/remove', { tool: r.tool, recipient: r.recipient }) }}>Quitar</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'chronos' && status && (
        <div className="flex flex-col gap-2">
          <div className={`${card} font-mono text-[11px] text-gray-400 flex flex-wrap gap-x-6`}>
            <span>Planificador: <b className="text-gray-200">{status.connections.find(c => c.id === 'chronos')?.state === 'OPERATIONAL' ? 'activo' : 'inactivo'}</b></span>
            <span>Tareas: {Object.entries(status.chronos.summary.tasks).map(([k, v]) => `${k} ${v}`).join(' · ') || 'ninguna'}</span>
            <span>Próxima ejecución: {fmt(status.chronos.summary.nextRunAt)}</span>
            <span>Última finalizada: {fmt(status.chronos.summary.lastFinishedAt)}</span>
          </div>
          <p className="font-mono text-[10px] text-gray-500 tracking-widest">EJECUCIONES RECIENTES</p>
          {status.chronos.recentRuns.length === 0 && <p className="font-mono text-[11px] text-gray-600">Aún no hay ejecuciones.</p>}
          {status.chronos.recentRuns.map(r => (
            <div key={r.id} className={`${card} font-mono text-[10px] text-gray-400`}>
              <b className={r.status === 'SUCCEEDED' ? 'text-permit' : r.status === 'FAILED' || r.status === 'INTERRUPTED' ? 'text-deny' : 'text-escalate'}>{r.status}</b> · {r.trigger} · intento {r.attempt} · programada {fmt(r.scheduledFor)} · fin {fmt(r.finishedAt)}{r.error && <span className="text-deny"> · {r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {tab === 'env' && status && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-gray-500">Solo se informa si cada ajuste está configurado. Los valores de secretos no salen del servidor; los identificadores públicos sí se muestran.</p>
          {status.settings.map(e => (
            <div key={e.key} className={`${card} flex items-center gap-3`}>
              <div className="flex-1 min-w-0"><p className="font-mono text-[11px] text-electric">{e.key}</p><p className="text-[10px] text-gray-600">{e.description}</p></div>
              <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${e.kind === 'secret' ? 'border-deny/30 text-deny bg-deny/5' : 'border-white/10 text-gray-400'} max-w-[50%] break-all`}>
                {e.kind === 'secret' ? (e.configured ? 'configurado · oculto' : 'no configurado') : e.configured ? e.value : 'no configurado'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
