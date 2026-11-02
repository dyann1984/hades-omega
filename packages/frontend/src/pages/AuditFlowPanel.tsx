import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHadesStore } from '../store/index.js'
import { apiHeaders, apiPath, isDemoToken } from '../lib/api.js'

type StageStatus = 'DONE' | 'PENDING' | 'WAITING_APPROVAL' | 'BLOCKED' | 'NOT_STARTED' | 'CONFIGURATION_PENDING'
interface Stage { id: string; label: string; agent: string; status: StageStatus; executed: boolean; detail: string; evidence?: Record<string, string | number | boolean | null> }
interface Flow { missionId: string; missionStatus: string; title: string; stages: Stage[]; report: { sha256: string; markdown: string } | null }
interface MissionRow { id: string; title: string; status: string; createdAt: number; context?: { tags?: string[] } }

const BADGE: Record<StageStatus, { text: string; cls: string }> = {
  DONE: { text: 'Completado', cls: 'text-permit border-permit/40' },
  PENDING: { text: 'En curso', cls: 'text-electric border-electric/40' },
  WAITING_APPROVAL: { text: 'Espera aprobación', cls: 'text-escalate border-escalate/40' },
  BLOCKED: { text: 'Bloqueado', cls: 'text-deny border-deny/40' },
  NOT_STARTED: { text: 'Sin iniciar', cls: 'text-gray-500 border-white/10' },
  CONFIGURATION_PENDING: { text: 'Configuración pendiente', cls: 'text-escalate border-escalate/40' },
}
const SAMPLE = [
  { filename: 'contrato-proveedor.txt', content: 'Contrato de suministro. Monto total 120,000 MXN. Penalización por retraso 5%. Pago a 30 días.' },
  { filename: 'cotizacion-proveedor.txt', content: 'Cotización vigente. Monto 98,500 MXN. Plazo de entrega 30 días. Garantía de 12 meses.' },
]

export default function AuditFlowPanel(): JSX.Element {
  const { addNotification } = useHadesStore()
  const [title, setTitle] = useState('Auditoría de proveedor')
  const [docs, setDocs] = useState(SAMPLE)
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [selected, setSelected] = useState<string>('')
  const [flow, setFlow] = useState<Flow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const call = useCallback(async (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
    try {
      const res = await fetch(apiPath(`/api/v1${path}`), { method, headers: apiHeaders(body === undefined ? headers : { 'Content-Type': 'application/json', ...headers }), ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const json = await res.json().catch(() => ({})) as { data?: unknown; error?: { code?: string; message?: string } }
      return res.ok ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? json.error?.code ?? `HTTP ${res.status}` }
    } catch { return { ok: false, error: 'API no disponible' } }
  }, [])

  const loadMissions = useCallback(async (): Promise<void> => {
    const res = await call('/missions')
    if (!res.ok) { setError(isDemoToken() ? 'El flujo de auditoría requiere una sesión real (no DEMO) con persistencia.' : res.error ?? 'Error'); return }
    setError(null)
    setMissions((res.data as MissionRow[]).filter(m => m.context?.tags?.includes('dispatcher-v1')).slice(0, 30))
  }, [call])
  const loadFlow = useCallback(async (id: string): Promise<void> => {
    if (!id) { setFlow(null); return }
    const res = await call(`/audit-flow/${encodeURIComponent(id)}`)
    if (res.ok) setFlow(res.data as Flow); else setError(res.error ?? 'Error')
  }, [call])

  useEffect(() => { void loadMissions() }, [loadMissions])
  useEffect(() => { void loadFlow(selected); if (!selected) return; const t = setInterval(() => { void loadFlow(selected) }, 5_000); return () => clearInterval(t) }, [selected, loadFlow])

  async function createMission(): Promise<void> {
    setBusy(true)
    const res = await call('/local-missions/multi-document', 'POST', { title: title.trim(), documents: docs, budgetLimit: 150000 }, { 'Idempotency-Key': `audit-${Date.now()}-${Math.random().toString(36).slice(2)}` })
    setBusy(false)
    if (!res.ok) { addNotification('error', `AUDITORÍA: ${res.error}`); return }
    const id = (res.data as { mission: { id: string } }).mission.id
    addNotification('info', 'AUDITORÍA: misión creada; CHARON, MINOS y PERSEPHONE ya procesaron los documentos')
    await loadMissions(); setSelected(id)
  }
  async function act(label: string, path: string, body?: unknown): Promise<void> {
    setBusy(true); const res = await call(path, 'POST', body); setBusy(false)
    addNotification(res.ok ? 'info' : 'error', `AUDITORÍA: ${res.ok ? label : res.error}`)
    await loadFlow(selected); await loadMissions()
  }
  async function decide(status: 'APPROVED' | 'REJECTED'): Promise<void> {
    const justification = window.prompt(status === 'APPROVED' ? 'Justificación de la aprobación (obligatoria):' : 'Motivo del rechazo (obligatorio):')
    if (!justification || justification.trim().length < 3) return
    const pending = await call('/local-approvals')
    const op = (pending.data as Array<{ id: string; missionId: string }> | undefined)?.find(p => p.missionId === selected)
    if (!pending.ok || !op) { addNotification('error', 'AUDITORÍA: no se encontró la aprobación pendiente (¿eres ADMIN?)'); return }
    await act(status === 'APPROVED' ? 'aprobada; ELYSIUM y TARTARUS ejecutaron' : 'rechazada; la operación protegida no se ejecutó', `/local-approvals/${op.id}/decision`, { status, justification: justification.trim() })
  }

  const stage = (id: string): Stage | undefined => flow?.stages.find(s => s.id === id)
  const completed = flow?.missionStatus === 'COMPLETED'
  const card = 'hades-card rounded-lg p-4'
  const btn = 'font-mono text-[10px] border px-2 py-1 rounded transition-colors disabled:opacity-40 text-electric border-electric/40 hover:bg-electric/10'
  const field = 'bg-[#0A0A0F] border border-obsidian-700 rounded px-2 py-1 text-xs text-gray-200'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">AUDITORÍA EMPRESARIAL</h2>
        <p className="text-[11px] text-gray-600 font-mono">Misión → agentes → CERBERUS → evidencia → seguimiento CHRONOS → registro NEAR preparado. Cada etapa indica si se ejecutó o solo está planificada.</p>
      </div>
      {error && <div role="alert" className={`${card} text-[11px] text-escalate font-mono`}>{error}</div>}

      <div className={`${card} flex flex-col gap-2`}>
        <p className="font-mono text-[11px] text-gray-400 tracking-widest">1 · NUEVA MISIÓN</p>
        <input className={field} aria-label="Título" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} />
        {docs.map((d, i) => (
          <div key={i} className="flex flex-col gap-1">
            <input className={`${field} font-mono`} aria-label={`Nombre del documento ${i + 1}`} value={d.filename} onChange={e => setDocs(ds => ds.map((x, j) => j === i ? { ...x, filename: e.target.value } : x))} maxLength={255} />
            <textarea className={`${field} resize-y`} rows={2} aria-label={`Contenido del documento ${i + 1}`} value={d.content} onChange={e => setDocs(ds => ds.map((x, j) => j === i ? { ...x, content: e.target.value } : x))} />
          </div>
        ))}
        <div className="flex gap-2">
          <button className={btn} disabled={busy || title.trim().length < 3 || docs.some(d => !d.filename.trim() || !d.content.trim())} onClick={() => { void createMission() }}>Crear misión y ejecutar agentes</button>
          <button className={`${btn} !text-gray-400 !border-white/10`} disabled={docs.length >= 5} onClick={() => setDocs(ds => [...ds, { filename: `documento-${ds.length + 1}.txt`, content: '' }])}>Agregar documento</button>
        </div>
        <p className="font-mono text-[10px] text-gray-600">El análisis es determinista por reglas (importes, porcentajes, términos); no es un dictamen jurídico ni usa IA generativa.</p>
      </div>

      <div className={`${card} flex flex-col gap-2`}>
        <p className="font-mono text-[11px] text-gray-400 tracking-widest">2 · MISIÓN</p>
        <select className={field} aria-label="Misión" value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">— selecciona una misión —</option>
          {missions.map(m => <option key={m.id} value={m.id}>{m.title} · {m.status} · {new Date(m.createdAt).toLocaleString('es-MX')}</option>)}
        </select>
      </div>

      {flow && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] text-gray-400 tracking-widest">3 · FLUJO · {flow.title} · {flow.missionStatus}</p>
          {flow.stages.map(s => {
            const b = BADGE[s.status]
            return (
              <div key={s.id} className={`${card} flex flex-col gap-1`} data-stage={s.id}>
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                  <span className="text-gray-200 text-xs font-semibold">{s.label}</span>
                  <span className="text-gray-600">{s.agent}</span>
                  <span className={`border px-1.5 py-0.5 rounded ${b.cls}`}>{b.text}</span>
                  <span className={s.executed ? 'text-permit' : 'text-gray-500'}>{s.executed ? 'ejecutado' : 'no ejecutado'}</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">{s.detail}</p>
                {s.evidence && <p className="font-mono text-[10px] text-gray-600 break-all">{Object.entries(s.evidence).filter(([, v]) => v !== null).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}</p>}
                {s.id === 'cerberus' && s.status === 'WAITING_APPROVAL' && (
                  <div className="flex gap-2 mt-1"><button className={btn} disabled={busy} onClick={() => { void decide('APPROVED') }}>Aprobar (ADMIN)</button>
                    <button className={`${btn} !text-gray-400 !border-white/10`} disabled={busy} onClick={() => { void decide('REJECTED') }}>Rechazar</button></div>
                )}
                {s.id === 'evidence' && s.status === 'PENDING' && <div className="mt-1"><button className={btn} disabled={busy} onClick={() => { void act('evidencia registrada', `/audit-flow/${selected}/evidence`) }}>Registrar evidencia</button></div>}
                {s.id === 'followup' && s.status === 'NOT_STARTED' && <div className="mt-1"><button className={btn} disabled={busy || !completed} onClick={() => { void act('seguimiento programado (no ejecutado aún)', `/audit-flow/${selected}/followup`) }}>Programar seguimiento diario</button></div>}
                {s.id === 'near' && (s.status === 'NOT_STARTED' || s.status === 'CONFIGURATION_PENDING') && <div className="mt-1"><button className={btn} disabled={busy || !completed} onClick={() => { void act('registro NEAR preparado (no enviado)', `/audit-flow/${selected}/near-audit`) }}>Preparar registro NEAR</button></div>}
                {s.id === 'near' && s.status === 'WAITING_APPROVAL' && <Link to="/near" className="font-mono text-[10px] text-electric underline mt-1">Revisar y aprobar en la página NEAR →</Link>}
              </div>
            )
          })}
          {flow.report && (
            <details className={card}>
              <summary className="font-mono text-[11px] text-gray-300 cursor-pointer">Informe guardado · SHA-256 {flow.report.sha256.slice(0, 16)}…</summary>
              <pre className="mt-2 text-[10px] text-gray-400 whitespace-pre-wrap break-words">{flow.report.markdown}</pre>
              <p className="font-mono text-[10px] text-gray-600 break-all mt-2">sha256 completo: {flow.report.sha256}</p>
            </details>
          )}
          {stage('near')?.status === 'CONFIGURATION_PENDING' && <p className="font-mono text-[10px] text-escalate">NEAR sigue en «configuración pendiente»: sin cuenta firmante y contrato no se puede preparar la operación. Ver el runbook de testnet.</p>}
        </div>
      )}
    </div>
  )
}
