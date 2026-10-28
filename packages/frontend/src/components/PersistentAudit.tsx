import { useCallback, useEffect, useState } from 'react'
import { apiHeaders, apiPath } from '../lib/api.js'
type EventRow = { id:string;actor:string;missionId:string|null;action:string;result:string;correlationId:string;timestamp:number }
export default function PersistentAudit(): JSX.Element {
  const [events,setEvents]=useState<EventRow[]>([]), [action,setAction]=useState(''), [missionId,setMissionId]=useState(''), [filter,setFilter]=useState({action:'',missionId:''}), [offset,setOffset]=useState(0), [error,setError]=useState('')
  const load=useCallback(async()=>{
    try {const q=new URLSearchParams({limit:'20',offset:String(offset)});if(filter.action)q.set('action',filter.action);if(filter.missionId)q.set('missionId',filter.missionId)
      const res=await fetch(apiPath(`/api/v1/audit/events?${q}`),{headers:apiHeaders()});if(!res.ok)throw new Error(res.status===403?'Auditoría disponible solo para ADMIN.':`No se pudo consultar la auditoría (HTTP ${res.status}).`)
      setEvents((await res.json()).data);setError('')
    }catch(e){setEvents([]);setError(e instanceof Error?e.message:'Error de conexión')}
  },[filter,offset])
  useEffect(()=>{void load()},[load])
  return <section aria-label="Auditoría persistente" className="border-t border-white/10 p-3 text-xs text-gray-300">
    <div className="flex flex-wrap gap-2"><label>Acción <input className="bg-black/40 border border-white/20 p-1" value={action} onChange={e=>setAction(e.target.value.toUpperCase())} /></label><label>Misión <input className="bg-black/40 border border-white/20 p-1" value={missionId} onChange={e=>setMissionId(e.target.value)} /></label><button onClick={()=>{setOffset(0);setFilter({action:action.trim(),missionId:missionId.trim()})}}>Filtrar</button><button onClick={()=>void load()}>Actualizar</button></div>
    {error && <p role="alert">{error}</p>}
    {events.map(e=><div key={e.id} className="border-b border-white/5 py-1 break-all"><span>{new Date(e.timestamp).toLocaleString('es-MX')} · {e.action} · {e.result}</span><p className="text-gray-500">Actor: {e.actor} · Misión: {e.missionId ?? '—'} · Correlación: {e.correlationId}</p></div>)}
    {!error && !events.length && <p>Sin eventos en esta página.</p>}
    <div className="flex gap-3 mt-2"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Anterior</button><span>{offset+1}–{offset+events.length}</span><button disabled={events.length<20} onClick={()=>setOffset(offset+20)}>Siguiente</button></div>
  </section>
}
