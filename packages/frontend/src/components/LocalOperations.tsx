import { askJustification } from '../components/JustificationDialog.js'
import { translate, getLang } from '../lib/i18n.js'
import { useState } from 'react'
import { apiHeaders, apiPath } from '../lib/api.js'

type LocalMission = { id: string; title: string; status: string; tasks: Array<{ status: string; result?: { summary: string; data?: { sha256?: string } } }> }
type Pending = { id: string; missionId: string; ownerId: string; input: string }

export default function LocalOperations(): JSX.Element {
  const [title, setTitle] = useState('')
  const [input, setInput] = useState('')
  const [missions, setMissions] = useState<LocalMission[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh(): Promise<void> {
    const [m, p] = await Promise.all([fetch(apiPath('/api/v1/missions'), {headers:apiHeaders()}), fetch(apiPath('/api/v1/local-approvals'), {headers:apiHeaders()})])
    if (!m.ok) throw new Error('No se pudieron consultar las misiones')
    const body = await m.json()
    setMissions(body.data.filter((item: { context?: { tags?: string[] } }) => item.context?.tags?.includes('local-sha256')))
    setPending(p.ok ? (await p.json()).data : [])
  }
  async function create(): Promise<void> {
    setBusy(true); setNotice('')
    try {
      const response=await fetch(apiPath('/api/v1/local-missions'), {method:'POST',headers:apiHeaders({'Content-Type':'application/json'}),body:JSON.stringify({title,input})})
      if(!response.ok) throw new Error(`No se pudo crear la misión (HTTP ${response.status})`)
      setInput(''); setNotice('Misión creada. La operación espera aprobación ADMIN.'); await refresh()
    } catch (error) {setNotice(error instanceof Error ? error.message : 'Error de conexión')} finally {setBusy(false)}
  }
  async function decide(id: string, status: 'APPROVED'|'REJECTED'): Promise<void> {
    const justification=await askJustification(translate(getLang(), 'dlg.decide'))
    if (!justification || justification.length < 3) return
    setBusy(true); setNotice('')
    try {
      const response=await fetch(apiPath(`/api/v1/local-approvals/${encodeURIComponent(id)}/decision`),{method:'POST',headers:apiHeaders({'Content-Type':'application/json'}),body:JSON.stringify({status,justification})})
      if(!response.ok) throw new Error(`No se pudo registrar la decisión (HTTP ${response.status})`)
      setNotice(status === 'APPROVED' ? 'Operación completada; consulte el resultado.' : 'Operación cancelada.'); await refresh()
    } catch(error){setNotice(error instanceof Error ? error.message : 'Error de conexión')} finally {setBusy(false)}
  }
  async function cancel(id: string): Promise<void> {
    const reason=await askJustification(translate(getLang(), 'dlg.cancelReason'))
    if (!reason || reason.length < 3) return
    setBusy(true); setNotice('')
    try { const response=await fetch(apiPath(`/api/v1/local-missions/${encodeURIComponent(id)}/cancel`),{method:'POST',headers:apiHeaders({'Content-Type':'application/json'}),body:JSON.stringify({reason})}); if (!response.ok) throw new Error(`No se pudo cancelar (HTTP ${response.status})`); setNotice('Misión cancelada antes de ejecutar.'); await refresh() }
    catch(error) {setNotice(error instanceof Error ? error.message : 'Error de conexión')} finally {setBusy(false)}
  }
  return <section className="panel p-4 flex flex-col gap-3" aria-label="Operación local verificable">
    <h2 className="text-sm text-gold font-semibold">Operación local verificable · SHA-256</h2>
    <p className="text-xs text-gray-400">HADES calcula el hash de la entrada solo después de aprobación ADMIN. La entrada se guarda en la base local para la revisión.</p>
    <label className="text-xs text-gray-300">Título<input className="w-full bg-black/40 border border-white/20 rounded p-2 mt-1" value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/></label>
    <label className="text-xs text-gray-300">Entrada<textarea className="w-full bg-black/40 border border-white/20 rounded p-2 mt-1" value={input} onChange={e=>setInput(e.target.value)} /></label>
    <div className="flex gap-2"><button className="border border-gold/40 rounded px-3 py-2 text-xs" disabled={busy || title.trim().length < 3} onClick={create}>Solicitar operación</button><button className="border border-white/20 rounded px-3 py-2 text-xs" disabled={busy} onClick={()=>void refresh().catch(()=>setNotice('No se pudieron consultar las misiones'))}>Actualizar</button></div>
    {notice && <p role="status" className="text-xs text-gray-300">{notice}</p>}
    {pending.map(item=><div key={item.id} className="border border-white/10 rounded p-2 text-xs"><p>Revisión pendiente · {item.ownerId}</p><pre className="whitespace-pre-wrap break-all text-gray-400">{item.input}</pre><div className="flex gap-3 mt-2"><button disabled={busy} onClick={()=>void decide(item.id,'APPROVED')}>Aprobar</button><button disabled={busy} onClick={()=>void decide(item.id,'REJECTED')}>Rechazar</button></div></div>)}
    {missions.map(m=><div key={m.id} className="border border-white/10 rounded p-2 text-xs"><p>{m.title} · {m.status}</p>{m.tasks.map((t,i)=><p key={i} className="break-all text-gray-400">{t.result?.data?.sha256 ? `SHA-256: ${t.result.data.sha256}` : t.result?.summary}</p>)}{m.tasks.some(t=>t.status==='CERBERUS_REVIEW') && <button disabled={busy} onClick={()=>void cancel(m.id)}>Cancelar misión</button>}</div>)}
  </section>
}
