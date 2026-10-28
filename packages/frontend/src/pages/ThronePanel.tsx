import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHadesStore } from '../store/index.js'
import type { AgentName, Mission } from '../store/index.js'
import { apiHeaders, apiPath } from '../lib/api.js'
import LocalOperations from '../components/LocalOperations.js'

const AGENT_META: Record<AgentName, { role: string; symbol: string }> = {
  HADES:      { role: 'Orquestador',      symbol: '⬡' },
  CHARON:     { role: 'Compras',          symbol: '⚡' },
  PERSEPHONE: { role: 'Finanzas',         symbol: '◈' },
  MINOS:      { role: 'Validación',       symbol: '⚖' },
  CERBERUS:   { role: 'Políticas',        symbol: '◉' },
  ELYSIUM:    { role: 'Planificación',    symbol: '◎' },
  TARTARUS:   { role: 'Seguridad',        symbol: '▲' },
}

const QUICK_COMMANDS = [
  { label: 'Evaluar proveedores cloud $50k MXN',    title: 'Evaluación de proveedores de infraestructura', description: 'Evaluar opciones de infraestructura cloud para TechCore Industries con presupuesto de $50,000 MXN.', budget: 50000 },
  { label: 'Auditoría de seguridad de sistemas',   title: 'Auditoría de seguridad interna',              description: 'Revisar políticas CERBERUS y detectar anomalías en los sistemas de seguridad.', budget: 25000 },
  { label: 'Planificar expansión de operaciones',  title: 'Plan de expansión operacional Q1',            description: 'Calcular viabilidad y plan táctico para expansión de operaciones en el siguiente trimestre.', budget: 120000 },
]

function AgentStatusRow({ name }: { name: AgentName }): JSX.Element {
  const agent   = useHadesStore(s => s.agents[name])
  const meta    = AGENT_META[name]
  const active  = agent.status !== 'IDLE'
  const isHades = name === 'HADES'
  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded transition-colors ${active ? 'bg-electric/5' : ''}`}>
      <span className={`font-mono text-sm ${isHades ? 'text-gold' : active ? 'text-electric' : 'text-gray-600'}`}>
        {meta.symbol}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`font-mono text-[10px] font-semibold ${isHades ? 'text-gold' : active ? 'text-electric' : 'text-gray-500'}`}>
          {name}
        </span>
        {active && agent.currentTask && (
          <p className="text-[9px] text-electric/60 truncate">{agent.currentTask}</p>
        )}
      </div>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? (isHades ? 'bg-gold' : 'bg-electric') : 'bg-gray-700'} ${active ? 'animate-pulse' : ''}`} />
    </div>
  )
}

export default function ThronePanel(): JSX.Element {
  const { agents, missions, auditRecords, nearTxs, apiReady } = useHadesStore()

  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [budget,      setBudget]      = useState('50000')
  const [loading,     setLoading]     = useState(false)
  const [log,         setLog]         = useState<{ ts: string; text: string; type: 'info' | 'success' | 'error' | 'agent' }[]>([])
  const [activeMission, setActiveMission] = useState<Mission | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const agentNames: AgentName[] = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'CERBERUS', 'ELYSIUM', 'TARTARUS']
  const anyActive = Object.values(agents).some(a => a.status !== 'IDLE')

  function addLog(text: string, type: 'info' | 'success' | 'error' | 'agent' = 'info'): void {
    const ts = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLog(prev => [{ ts, text, type }, ...prev].slice(0, 50))
  }

  // Scroll log to top on new entry
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0
  }, [log])

  async function executeInstruction(): Promise<void> {
    if (!title.trim() || loading) return
    setLoading(true)
    addLog(`▶ Instrucción recibida: "${title}"`, 'info')
    addLog('⬡ HADES — Analizando y distribuyendo tareas…', 'agent')

    try {
      const res = await fetch(apiPath('/api/v1/missions'), {
        method:  'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body:    JSON.stringify({ title, description: description || title, budgetLimit: Number(budget) }),
      })
      const json = await res.json()

      if (json.success) {
        const m = json.data
        addLog(`✓ Misión creada: ${m.id.slice(0, 8)}`, 'success')

        const tasks = m.tasks ?? []
        for (const t of tasks) {
          const status = t.status === 'EXECUTED' ? '✓' : t.status === 'FAILED' ? '✗' : '○'
          addLog(`${status} [${t.assignedTo}] ${t.title}`, 'agent')
        }
        addLog(`◉ Misión ${m.status === 'COMPLETED' ? 'COMPLETADA' : m.status}`, m.status === 'COMPLETED' ? 'success' : 'info')

        const store = useHadesStore.getState()
        const tasks2 = tasks.map((t: any) => ({
          id: t.id, title: t.title, assignedTo: t.assignedTo, status: t.status, result: t.result,
        }))
        const done     = tasks2.filter((t: any) => t.status === 'EXECUTED' || t.status === 'FAILED').length
        const progress = tasks2.length ? Math.round((done / tasks2.length) * 100) : 0

        store.addMission({ id: m.id, title: m.title, description: m.description, status: m.status, progress, createdAt: m.createdAt, tasks: tasks2 })
        json.auditRecords?.forEach((r: any) => store.addAuditRecord(r))
        json.nearTxs?.forEach((tx: any) => store.addNearTx({ auditId: tx.auditId, txHash: tx.txHash, explorerUrl: tx.explorerUrl }))

        setActiveMission({ id: m.id, title: m.title, description: m.description, status: m.status, progress, createdAt: m.createdAt, tasks: tasks2 })

        if (json.nearTxs?.length) {
          addLog(`⬡ NEAR: ${json.nearTxs.length} tx registrada(s) en testnet`, 'success')
        }
        if (json.auditRecords?.length) {
          const denies = json.auditRecords.filter((r: any) => r.guardDecision === 'DENY').length
          if (denies > 0) addLog(`⚠ CERBERUS: ${denies} decisión(es) DENY`, 'error')
        }

        setTitle('')
        setDescription('')
      } else {
        addLog(`✗ Error: ${json.error?.message ?? 'respuesta inesperada'}`, 'error')
      }
    } catch (e: any) {
      addLog(`✗ Sin conexión a la API: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  function applyQuick(q: typeof QUICK_COMMANDS[0]): void {
    setTitle(q.title)
    setDescription(q.description)
    setBudget(String(q.budget))
  }

  return (
    <div className="flex flex-col gap-4">
      <LocalOperations />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">THRONE</h2>
          <p className="text-[11px] text-gray-600 font-mono">Consola central de instrucciones · HADES</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[10px] px-2 py-1 rounded border ${anyActive ? 'text-electric border-electric/30 bg-electric/5 animate-pulse' : 'text-gray-600 border-gray-800'}`}>
            {anyActive ? '◉ PROCESANDO' : '○ EN ESPERA'}
          </span>
          <span className={`font-mono text-[10px] px-2 py-1 rounded border ${apiReady ? 'text-permit border-permit/30' : 'text-deny border-deny/30'}`}>
            {apiReady ? 'API OK' : 'API INACTIVA'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4">
        {/* Left: Command console */}
        <div className="flex flex-col gap-4">
          {/* Quick commands */}
          <div className="hades-card rounded-lg p-3">
            <p className="font-mono text-[10px] text-gray-600 mb-2 tracking-widest">INSTRUCCIONES RÁPIDAS</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_COMMANDS.map(q => (
                <button
                  key={q.label}
                  onClick={() => applyQuick(q)}
                  className="font-mono text-[10px] text-electric border border-electric/25 px-2.5 py-1.5 rounded hover:bg-electric/10 transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mission form */}
          <div className="hades-card rounded-lg p-4 flex flex-col gap-3">
            <p className="font-mono text-[11px] text-gray-400 tracking-widest">NUEVA INSTRUCCIÓN</p>
            <input
              className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/50 transition-colors"
              placeholder="Instrucción para HADES…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && executeInstruction()}
            />
            <textarea
              className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/50 resize-none transition-colors"
              placeholder="Contexto adicional, requisitos y restricciones…"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="font-mono text-[11px] text-gray-500 whitespace-nowrap">Presupuesto MXN</label>
                <input
                  type="number"
                  className="w-28 bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-electric/50 transition-colors"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                />
              </div>
              <button
                onClick={executeInstruction}
                disabled={loading || !title.trim()}
                className="flex-1 bg-electric/15 border border-electric/50 text-electric font-mono text-[11px] px-4 py-2.5 rounded hover:bg-electric/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? '⏳ PROCESANDO…' : '▶ EJECUTAR INSTRUCCIÓN'}
              </button>
            </div>
            <p className="font-mono text-[9px] text-gray-700">
              CERBERUS evaluará todas las políticas · NEAR registrará en testnet · Tecla Enter para ejecutar
            </p>
          </div>

          {/* Execution log */}
          <div className="hades-card rounded-lg overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
              <span className="font-mono text-[11px] text-gray-500 tracking-widest">REGISTRO DE EJECUCIÓN</span>
              <button onClick={() => setLog([])} className="font-mono text-[9px] text-gray-700 hover:text-gray-500 transition-colors">
                Limpiar
              </button>
            </div>
            <div ref={logRef} className="h-48 overflow-y-auto p-3 flex flex-col gap-1.5 font-mono text-[10px]">
              {log.length === 0 ? (
                <p className="text-gray-700">Sin actividad — ejecuta una instrucción para ver el registro</p>
              ) : (
                log.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-gray-700 flex-shrink-0">{entry.ts}</span>
                    <span className={
                      entry.type === 'success' ? 'text-permit' :
                      entry.type === 'error'   ? 'text-deny' :
                      entry.type === 'agent'   ? 'text-electric/80' :
                      'text-gray-400'
                    }>{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Last mission result */}
          <AnimatePresence>
            {activeMission && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="hades-card rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className={`font-mono text-[10px] ${activeMission.status === 'COMPLETED' ? 'text-permit' : 'text-escalate'}`}>
                      {activeMission.status === 'COMPLETED' ? '✓ COMPLETADA' : `● ${activeMission.status}`}
                    </span>
                    <p className="text-sm text-gray-200 font-medium mt-0.5">{activeMission.title}</p>
                  </div>
                  <span className="font-mono text-[10px] text-gray-600">{activeMission.id.slice(0, 8)}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {activeMission.tasks.map(t => (
                    <div key={t.id} className={`rounded border p-2 text-center ${
                      t.status === 'EXECUTED' ? 'border-permit/25 bg-permit/5' :
                      t.status === 'FAILED'   ? 'border-deny/25 bg-deny/5' :
                      'border-white/5 bg-obsidian-600/20'
                    }`}>
                      <p className={`font-mono text-[10px] font-bold ${
                        t.status === 'EXECUTED' ? 'text-permit' : t.status === 'FAILED' ? 'text-deny' : 'text-gray-600'
                      }`}>{t.status === 'EXECUTED' ? '✓' : t.status === 'FAILED' ? '✗' : '○'} {t.assignedTo}</p>
                      <p className="text-[9px] text-gray-600 mt-0.5 leading-tight truncate">{t.title.slice(0, 22)}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Agent status + stats */}
        <div className="flex flex-col gap-4">
          {/* Agent live status */}
          <div className="hades-card rounded-lg overflow-hidden">
            <div className="px-3 py-2.5 border-b border-white/5">
              <span className="font-mono text-[11px] text-gray-500 tracking-widest">AGENTES ACTIVOS</span>
            </div>
            <div className="p-2">
              {agentNames.map(n => <AgentStatusRow key={n} name={n} />)}
            </div>
          </div>

          {/* System stats */}
          <div className="hades-card rounded-lg p-3 flex flex-col gap-2">
            <p className="font-mono text-[10px] text-gray-600 tracking-widest">ESTADÍSTICAS</p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="border border-white/5 rounded p-2">
                <p className="font-mono text-lg font-bold text-electric">{missions.length}</p>
                <p className="font-mono text-[9px] text-gray-600">Misiones</p>
              </div>
              <div className="border border-white/5 rounded p-2">
                <p className="font-mono text-lg font-bold text-gold">{nearTxs.length}</p>
                <p className="font-mono text-[9px] text-gray-600">NEAR TXs</p>
              </div>
              <div className="border border-white/5 rounded p-2">
                <p className="font-mono text-lg font-bold text-permit">{auditRecords.filter(r => r.guardDecision === 'PERMIT').length}</p>
                <p className="font-mono text-[9px] text-gray-600">PERMIT</p>
              </div>
              <div className="border border-white/5 rounded p-2">
                <p className="font-mono text-lg font-bold text-deny">{auditRecords.filter(r => r.guardDecision === 'DENY').length}</p>
                <p className="font-mono text-[9px] text-gray-600">DENY</p>
              </div>
            </div>
          </div>

          {/* NEAR recent txs */}
          {nearTxs.length > 0 && (
            <div className="hades-card rounded-lg p-3">
              <p className="font-mono text-[10px] text-gray-600 tracking-widest mb-2">NEAR TESTNET</p>
              <div className="flex flex-col gap-1.5">
                {nearTxs.slice(0, 4).map(tx => (
                  <a key={tx.auditId} href={tx.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 font-mono text-[9px] text-blue-400 hover:text-blue-300 transition-colors">
                    <span className="text-gold">⬡</span>
                    <span className="truncate">{tx.txHash.slice(0, 16)}…</span>
                    <span className="ml-auto badge-demo">SIM</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
