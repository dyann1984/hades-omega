import { useCallback, useEffect, useState } from 'react'
import { useHadesStore } from '../store/index.js'
import { apiHeaders, apiPath, isDemoToken } from '../lib/api.js'

interface Config { executionMode: string; signingEnabled: boolean; signerAccountId: string | null; signerPublicKey: string | null; contractId: string | null; emergencyStop: boolean; blockers: string[]; note: string }
interface IntentParams { network: string; signerId: string; receiverId: string; type: string; amountYocto: string; auditId: string; contentHash: string; operationType: string; agentName: string; decision: string; timestampMs: number; gas: string }
interface Intent { id: string; params: IntentParams; hash: string; status: string; expiresAt: number | null; createdAt: number }
interface Submission { txHash: string; explorerUrl: string; nonce: number; broadcastCount: number; lastError: string | null; onChainVerified: boolean | null; payload: { actions: Array<{ type: string; method?: string; gas?: string; deposit?: string }> } }
interface Row { intent: Intent; submission: Submission | null }

const BLOCKER_TEXT: Record<string, string> = {
  SIGNING_DISABLED: 'La firma está desactivada en el servidor (NEAR_SIGNING_ENABLED y NEAR_EXECUTION_MODE).',
  NO_SIGNER: 'No hay cuenta firmante configurada en el servidor.',
  NO_CONTRACT_CONFIGURED: 'No hay contrato de auditoría configurado (NEAR_AUDIT_CONTRACT_ID).',
}
const STATUS_TEXT: Record<string, string> = {
  DRAFT: 'Borrador', PENDING_APPROVAL: 'Esperando aprobación', APPROVED: 'Aprobada (un solo uso)', SIGNING: 'Firmando', BROADCAST_PENDING: 'Firmada, envío pendiente',
  BROADCASTED: 'Enviada, esperando confirmación', CONFIRMED: 'Confirmada', FAILED: 'Fallida', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', RECONCILIATION_REQUIRED: 'Requiere conciliación',
}
const hex = (n: number): string => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('')
}

export default function NearPanel(): JSX.Element {
  const { addNotification } = useHadesStore()
  const [cfg, setCfg] = useState<Config | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ eventText: '', operationType: 'PLANNING', agentName: 'HADES', decision: 'PERMIT' })
  const [review, setReview] = useState<IntentParams | null>(null)

  const call = useCallback(async (path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
    try {
      const res = await fetch(apiPath(`/api/v1${path}`), { method, headers: apiHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const json = await res.json().catch(() => ({})) as { data?: unknown; error?: { code?: string; message?: string } }
      if (!res.ok) return { ok: false, error: json.error?.message ?? json.error?.code ?? `HTTP ${res.status}` }
      return { ok: true, data: json.data }
    } catch { return { ok: false, error: 'API no disponible' } }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const [c, s] = await Promise.all([call('/near/config'), call('/near/submissions')])
    if (!c.ok) { setError(isDemoToken() ? 'NEAR transaccional no está disponible en sesiones DEMO.' : c.error ?? 'Error'); return }
    setError(null); setCfg(c.data as Config); if (s.ok) setRows(s.data as Row[])
  }, [call])
  useEffect(() => { void refresh(); const t = setInterval(() => { void refresh() }, 15_000); return () => clearInterval(t) }, [refresh])

  async function prepare(): Promise<void> {
    if (!cfg?.signerAccountId || !cfg.contractId) return
    const contentHash = await sha256Hex(form.eventText)
    setReview({ network: 'testnet', signerId: cfg.signerAccountId, receiverId: cfg.contractId, type: 'AUDIT_HASH', amountYocto: '0', auditId: `hades-${Date.now().toString(36)}-${hex(4)}`, contentHash, operationType: form.operationType, agentName: form.agentName, decision: form.decision, timestampMs: Date.now(), gas: '30000000000000' })
  }
  async function step(label: string, id: string, path: string, body?: unknown): Promise<void> {
    setBusy(id)
    const res = await call(path, 'POST', body)
    setBusy(null)
    addNotification(res.ok ? 'info' : 'error', `NEAR: ${res.ok ? label : res.error}`)
    await refresh()
  }
  async function createIntent(): Promise<void> {
    if (!review) return
    setBusy('create')
    const created = await call('/near/intents', 'POST', review)
    if (!created.ok) { setBusy(null); addNotification('error', `NEAR: ${created.error}`); return }
    const id = (created.data as Intent).id
    const asked = await call(`/near/intents/${id}/request-approval`, 'POST')
    setBusy(null)
    addNotification(asked.ok ? 'info' : 'error', asked.ok ? 'NEAR: operación preparada, pendiente de tu aprobación' : `NEAR: ${asked.error} (¿el contrato está en la lista de destinatarios permitidos de CERBERUS?)`)
    if (asked.ok) { setReview(null); setForm(f => ({ ...f, eventText: '' })) }
    await refresh()
  }

  const canSubmit = !!cfg && cfg.blockers.length === 0 && !cfg.emergencyStop
  const card = 'hades-card rounded-lg p-4'
  const btn = 'font-mono text-[10px] border px-2 py-1 rounded transition-colors disabled:opacity-40'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">NEAR · REGISTRO DE AUDITORÍA (TESTNET)</h2>
        <p className="text-[11px] text-gray-600 font-mono">Prepara, revisa y aprueba cada operación. Nada se firma ni se envía sin tu aprobación de un solo uso.</p>
      </div>
      {error && <div className={`${card} text-[11px] text-escalate font-mono`}>{error}</div>}

      {cfg && (
        <div className={`${card} flex flex-col gap-2 text-[11px] font-mono`}>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-400">
            <span>Modo: <b className="text-gray-200">{cfg.executionMode === 'real' ? 'testnet (real)' : 'simulación'}</b></span>
            <span>Firmante: <b className="text-gray-200">{cfg.signerAccountId ?? '— no configurado'}</b></span>
            <span>Contrato: <b className="text-gray-200">{cfg.contractId ?? '— no configurado'}</b></span>
            <span>Parada de emergencia: <b className={cfg.emergencyStop ? 'text-escalate' : 'text-gray-200'}>{cfg.emergencyStop ? 'ACTIVA' : 'inactiva'}</b></span>
          </div>
          {cfg.blockers.length > 0 && (
            <ul className="text-escalate list-disc pl-5">{cfg.blockers.map(b => <li key={b}>{BLOCKER_TEXT[b] ?? b}</li>)}</ul>
          )}
          <p className="text-gray-600">{cfg.note} Puedes preparar y aprobar operaciones, pero el envío permanece bloqueado hasta que se resuelvan los puntos anteriores.</p>
        </div>
      )}

      {cfg?.signerAccountId && cfg.contractId && (
        <div className={`${card} flex flex-col gap-3`}>
          <p className="font-mono text-[11px] text-gray-400 tracking-widest">PREPARAR OPERACIÓN</p>
          <textarea className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 resize-none" rows={3}
            placeholder="Contenido del evento a registrar. Solo se publica su hash SHA-256; el texto no sale de tu navegador."
            value={form.eventText} onChange={e => { setForm(f => ({ ...f, eventText: e.target.value })); setReview(null) }} />
          <div className="flex flex-wrap gap-2">
            <input className="bg-[#0A0A0F] border border-obsidian-700 rounded px-2 py-1 text-xs text-gray-200 font-mono" aria-label="Tipo de operación" value={form.operationType} onChange={e => { setForm(f => ({ ...f, operationType: e.target.value.toUpperCase().replace(/[^A-Z_]/g, '') })); setReview(null) }} />
            <select className="bg-[#0A0A0F] border border-obsidian-700 rounded px-2 py-1 text-xs text-gray-200 font-mono" aria-label="Agente" value={form.agentName} onChange={e => { setForm(f => ({ ...f, agentName: e.target.value })); setReview(null) }}>
              {['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS', 'CERBERUS'].map(a => <option key={a}>{a}</option>)}
            </select>
            <select className="bg-[#0A0A0F] border border-obsidian-700 rounded px-2 py-1 text-xs text-gray-200 font-mono" aria-label="Decisión" value={form.decision} onChange={e => { setForm(f => ({ ...f, decision: e.target.value })); setReview(null) }}>
              {['PERMIT', 'DENY', 'ESCALATE'].map(a => <option key={a}>{a}</option>)}
            </select>
            <button className={`${btn} text-electric border-electric/40 hover:bg-electric/10`} disabled={!form.eventText.trim() || form.operationType.length < 1} onClick={() => { void prepare() }}>Revisar parámetros</button>
          </div>
          {review && (
            <div className="border border-electric/30 rounded p-3 flex flex-col gap-2">
              <p className="font-mono text-[10px] text-gray-500 tracking-widest">REVISIÓN — ESTO ES EXACTAMENTE LO QUE SE APROBARÁ</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-[10px] text-gray-300 break-all">
                {Object.entries(review).map(([k, v]) => (<><dt key={`k${k}`} className="text-gray-600">{k}</dt><dd key={`v${k}`}>{String(v)}</dd></>))}
                <dt className="text-gray-600">acción</dt><dd>FunctionCall store_audit_hash · depósito 0 · gas 30 Tgas</dd>
              </dl>
              <button className={`${btn} text-electric border-electric/40 hover:bg-electric/10 self-start`} disabled={busy === 'create'} onClick={() => { void createIntent() }}>Crear y solicitar aprobación</button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] text-gray-500 tracking-widest">OPERACIONES</p>
        {!error && rows.length === 0 && <p className="font-mono text-[11px] text-gray-600">Aún no hay operaciones NEAR.</p>}
        {rows.map(({ intent, submission }) => (
          <div key={intent.id} className={`${card} flex flex-col gap-2`}>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
              <span className="text-gray-200">{intent.params.auditId}</span>
              <span className="border border-white/10 px-1.5 py-0.5 rounded text-electric/80">{STATUS_TEXT[intent.status] ?? intent.status}</span>
              <span className="text-gray-600">hash {intent.hash.slice(0, 16)}…</span>
              {intent.expiresAt && intent.status === 'APPROVED' && <span className="text-gray-500">válida hasta {new Date(intent.expiresAt).toLocaleTimeString('es-MX')}</span>}
            </div>
            <div className="font-mono text-[10px] text-gray-500 break-all">contenido SHA-256: {intent.params.contentHash}</div>
            {submission && (
              <div className="font-mono text-[10px] text-gray-400 break-all">
                tx: <a className="text-electric underline" href={submission.explorerUrl} target="_blank" rel="noreferrer noopener">{submission.txHash}</a> · nonce {submission.nonce} · envíos {submission.broadcastCount}
                {submission.onChainVerified !== null && <> · verificado en el contrato: <b>{submission.onChainVerified ? 'sí' : 'NO'}</b></>}
                {submission.lastError && <span className="text-escalate"> · {submission.lastError}</span>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {intent.status === 'PENDING_APPROVAL' && <>
                <button className={`${btn} text-electric border-electric/40 hover:bg-electric/10`} disabled={busy === intent.id} onClick={() => { if (window.confirm(`¿Aprobar UNA ejecución con hash ${intent.hash.slice(0, 16)}… válida 10 minutos?`)) void step('aprobada', intent.id, `/near/intents/${intent.id}/approve`, { hash: intent.hash, expiresAt: Date.now() + 10 * 60_000 }) }}>Aprobar (10 min)</button>
                <button className={`${btn} text-gray-400 border-white/10`} disabled={busy === intent.id} onClick={() => { void step('rechazada', intent.id, `/near/intents/${intent.id}/resolve`, { outcome: 'REJECTED' }) }}>Rechazar</button>
              </>}
              {intent.status === 'APPROVED' && <>
                <button className={`${btn} text-electric border-electric/40 hover:bg-electric/10`} disabled={busy === intent.id || !canSubmit} title={canSubmit ? '' : 'Bloqueado: ver avisos arriba'} onClick={() => { if (window.confirm('Esto firma y envía una transacción a NEAR testnet. ¿Continuar?')) void step('enviada', intent.id, `/near/intents/${intent.id}/submit`) }}>Firmar y enviar</button>
                <button className={`${btn} text-gray-400 border-white/10`} disabled={busy === intent.id} onClick={() => { void step('cancelada', intent.id, `/near/intents/${intent.id}/resolve`, { outcome: 'CANCELLED' }) }}>Cancelar</button>
              </>}
              {['BROADCAST_PENDING', 'BROADCASTED', 'SIGNING'].includes(intent.status) && <button className={`${btn} text-electric border-electric/40 hover:bg-electric/10`} disabled={busy === intent.id} onClick={() => { void step('estado actualizado', intent.id, `/near/submissions/${intent.id}/refresh`) }}>Consultar confirmación</button>}
              {intent.status === 'RECONCILIATION_REQUIRED' && <button className={`${btn} text-electric border-electric/40 hover:bg-electric/10`} disabled={busy === intent.id} onClick={() => { void step('conciliada', intent.id, `/near/submissions/${intent.id}/reconcile`) }}>Conciliar con el contrato</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
