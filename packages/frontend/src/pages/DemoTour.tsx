import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiHeaders, demoPath } from '../lib/api.js'
import { useLang, useT, translate } from '../lib/i18n.js'

interface Capability { id: string; label: 'REAL' | 'DETERMINISTA' | 'SIMULADA' | 'NO_DISPONIBLE'; description: string }
interface Info { expiresAt: number; runsUsed: number; runsMax: number; capabilities: Capability[]; agents: Array<{ name: string; description: string }> }
interface TaskView { id: string; title: string; assignedTo: string; status: string; result?: { summary?: string } }
interface MissionView { id: string; status: string; title: string; tasks: TaskView[]; context?: { guardDecision?: { outcome?: string; reason?: string } } }
// Public, verifiable on NEAR Testnet (see docs/evidencia-hades-attest-0001.md). Not a secret.
const REAL_TX = 'BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3'
interface Report { markdown: string; sha256: string; verifiable: boolean }
interface AuditEvent { id: string; actor: string; action: string; result: string; timestamp: number }

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(demoPath(path), { headers: apiHeaders() })
    if (!res.ok) return null
    return (await res.json()).data as T
  } catch { return null }
}

export default function DemoTour(): JSX.Element {
  const lang = useLang()
  const t = useT()
  const [info, setInfo] = useState<Info | null>(null)
  const [mission, setMission] = useState<MissionView | null>(null)
  const [approvalId, setApprovalId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const refreshInfo = useCallback(async () => { setInfo(await getJson<Info>(`/info?lang=${lang}`)) }, [lang])
  useEffect(() => { void refreshInfo() }, [refreshInfo])

  async function refreshMission(id: string): Promise<MissionView | null> {
    const list = await getJson<MissionView[]>('/missions')
    const current = list?.find(m => m.id === id) ?? null
    setMission(current)
    setAudit((await getJson<AuditEvent[]>('/audit/events')) ?? [])
    if (current?.status === 'COMPLETED') setReport(await getJson<Report>(`/missions/${encodeURIComponent(id)}/report`))
    return current
  }

  async function run(): Promise<void> {
    setBusy(true); setMessage(''); setReport(null)
    try {
      const res = await fetch(demoPath('/scenario/run'), { method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ lang }) })
      if (res.status === 429) { setMessage(t('tour.limit')); return }
      if (!res.ok) { setMessage(`HTTP ${res.status}`); return }
      const data = (await res.json()).data as { mission: MissionView; approvalId: string }
      setMission(data.mission); setApprovalId(data.approvalId)
      await refreshMission(data.mission.id); await refreshInfo()
    } finally { setBusy(false) }
  }

  async function decide(status: 'APPROVED' | 'REJECTED'): Promise<void> {
    if (!approvalId || !mission) return
    setBusy(true)
    try {
      const res = await fetch(demoPath(`/local-approvals/${encodeURIComponent(approvalId)}/decision`), {
        method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status, justification: translate(lang, 'tour.justification') }),
      })
      if (!res.ok) setMessage(`HTTP ${res.status}`)
      setApprovalId(null)
      await refreshMission(mission.id)
    } finally { setBusy(false) }
  }

  async function exportReport(): Promise<void> {
    if (!mission) return
    const res = await fetch(demoPath(`/missions/${encodeURIComponent(mission.id)}/report?format=md`), { headers: apiHeaders() })
    if (!res.ok) return
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a'); a.href = url; a.download = `hades-demo-report-${mission.id}.md`; a.click()
    URL.revokeObjectURL(url)
  }

  const waiting = !!approvalId && mission?.tasks.some(x => x.status === 'CERBERUS_REVIEW')
  const runsLeft = info ? info.runsMax - info.runsUsed : 0

  return (
    <div className="tour" data-testid="demo-tour">
      <section className="tour-card">
        <h2>{t('tour.title')}</h2>
        <p style={{ marginTop: 8 }}>{t('tour.lead')}</p>
        <p style={{ marginTop: 8, color: '#9aa0ad' }}>{t('tour.explore')}</p>
      </section>

      <section className="tour-card">
        <h3>{t('tour.agents')}</h3>
        <div className="tour-grid">
          {info?.agents.map(a => (
            <div key={a.name} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: 10 }}>
              <strong style={{ color: '#f3d27a', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{a.name}</strong>
              <p style={{ fontSize: 13 }}>{a.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="tour-card">
        <h3>{t('tour.arch')}</h3>
        <div className="tour-arch">
          {(['tour.arch1', 'tour.arch2', 'tour.arch3', 'tour.arch4', 'tour.arch5', 'tour.arch6'] as const).map((k, i) => (
            <span key={k} style={{ display: 'contents' }}>{i > 0 && <span className="arrow">→</span>}<span className="step">{t(k)}</span></span>
          ))}
        </div>
      </section>

      <section className="tour-card">
        <h3>{t('tour.caps')}</h3>
        <table><tbody>
          {info?.capabilities.map(c => (
            <tr key={c.id}><td style={{ width: 130 }}><span className={`tour-chip ${c.label}`}>{t(`label.${c.label}` as const).toUpperCase()}</span></td><td>{c.description}</td></tr>
          ))}
        </tbody></table>
      </section>

      <section className="tour-card">
        <h3>{t('tour.scenario')}</h3>
        <p>{t('tour.scenarioText')}</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button className="primary" onClick={() => void run()} disabled={busy || !info || runsLeft <= 0}>{busy ? t('tour.running') : t('tour.run')}</button>
          {info && <span style={{ fontSize: 12, color: '#9aa0ad' }}>{t('tour.runsLeft')}: {runsLeft}</span>}
          <span className="tour-chip DETERMINISTA">{t('label.DETERMINISTA').toUpperCase()}</span>
        </div>
        {message && <p role="alert" style={{ color: '#ff8a8a', marginTop: 8 }}>{message}</p>}
      </section>

      {mission && (
        <section className="tour-card" data-testid="demo-mission">
          <h3>{t('tour.status')}: <span data-testid="demo-mission-status">{mission.status}</span></h3>
          <p style={{ marginBottom: 8 }}>{mission.title}</p>
          <table><tbody>
            {mission.tasks.map(task => (
              <tr key={task.id}><td style={{ width: 120 }}>{task.assignedTo}</td><td>{task.title}</td><td style={{ width: 170 }}>{task.status}</td></tr>
            ))}
          </tbody></table>
          {mission.context?.guardDecision && (
            <p style={{ marginTop: 10 }}><strong>{t('tour.cerberus')}:</strong> <span className="tour-chip REAL">{mission.context.guardDecision.outcome}</span> {mission.context.guardDecision.reason}</p>
          )}
          {waiting && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid #f0a500', borderRadius: 8 }} data-testid="demo-gate">
              <p style={{ color: '#f0a500', marginBottom: 8 }}>{t('tour.gate')}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="primary" disabled={busy} onClick={() => void decide('APPROVED')}>{t('tour.approve')}</button>
                <button className="ghost" disabled={busy} onClick={() => void decide('REJECTED')}>{t('tour.reject')}</button>
              </div>
            </div>
          )}
        </section>
      )}

      {report && (
        <section className="tour-card" data-testid="demo-report">
          <h3>{t('tour.report')}</h3>
          <pre>{report.markdown}</pre>
          <p style={{ marginTop: 10 }}><strong>{t('tour.sha')}:</strong> <code style={{ wordBreak: 'break-all' }}>{report.sha256}</code></p>
          {report.verifiable && <p style={{ color: '#3ddc97' }}>✓ {t('tour.verified')}</p>}
          <button className="ghost" style={{ marginTop: 10 }} onClick={() => void exportReport()}>{t('tour.export')}</button>
        </section>
      )}

      {audit.length > 0 && (
        <section className="tour-card">
          <h3>{t('tour.audit')}</h3>
          <table><tbody>
            {audit.slice(0, 12).map(e => <tr key={e.id}><td>{e.actor.startsWith('demo:') ? 'demo' : e.actor}</td><td>{e.action}</td><td>{e.result}</td></tr>)}
          </tbody></table>
        </section>
      )}

      <section className="tour-card">
        <h3>{t('tour.near')}</h3>
        <p><span className="tour-chip SIMULADA">{t('label.SIMULADA').toUpperCase()}</span> {t('tour.nearText')}</p>
      </section>

      <section className="tour-card" data-testid="demo-real-evidence">
        <h3>{t('tour.nearReal')}</h3>
        <p><span className="tour-chip REAL">{t('label.REAL').toUpperCase()}</span> {t('tour.nearRealText')}</p>
        <p style={{ marginTop: 8 }}>
          <a href={`https://explorer.testnet.near.org/transactions/${REAL_TX}`} target="_blank" rel="noopener noreferrer">{t('tour.nearRealTx')}</a>
          {' · '}
          <a href="/verify/index.html" target="_blank" rel="noopener noreferrer">{t('tour.nearRealVerify')}</a>
        </p>
        <p className="mono" style={{ fontSize: 11, opacity: 0.75, wordBreak: 'break-all' }}>{REAL_TX}</p>
      </section>

      <section className="tour-card">
        <h3>{t('tour.holo')}</h3>
        <p>{t('tour.holoText')}</p>
        <Link to="/command" className="ghost" style={{ display: 'inline-block', marginTop: 10, textDecoration: 'none', padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(69,201,236,.55)', color: '#8fe3ff' }}>{t('tour.openCommand')}</Link>
      </section>
    </div>
  )
}
