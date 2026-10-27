import { useState, useRef } from 'react'
import { useHadesStore } from '../store/index.js'
import { apiHeaders, apiPath } from '../lib/api.js'

interface AgentStage {
  name: string
  icon: string
  label: string
}

const STAGES: AgentStage[] = [
  { name: 'intake',      icon: '⬡', label: 'CHARON — Ingesta'      },
  { name: 'validation',  icon: '⊛', label: 'MINOS — Validación'    },
  { name: 'summary',     icon: '◈', label: 'PERSEPHONE — Resumen'  },
  { name: 'deliverable', icon: '✦', label: 'ELYSIUM — Entregable'  },
  { name: 'errors',      icon: '⚔', label: 'TARTARUS — Errores'    },
]

interface DocumentResult {
  id: string
  filename: string
  status: string
  createdAt: number
  data: ProcessResult
}

interface ProcessResult {
  resultId: string
  missionId: string
  filename: string
  mimeType: string
  sizeBytes: number
  overallStatus: 'APPROVED' | 'REJECTED' | 'PARTIAL'
  errors: string[]
  intake: Record<string, unknown> | null
  validation: Record<string, unknown> | null
  summary: Record<string, unknown> | null
  deliverable: Record<string, unknown> | null
  processedAt: number
}

function statusBadge(status: string): JSX.Element {
  const map: Record<string, string> = {
    APPROVED: 'bg-permit/15 text-permit border-permit/30',
    REJECTED: 'bg-deny/15 text-deny border-deny/30',
    PARTIAL:  'bg-escalate/15 text-escalate border-escalate/30',
  }
  return (
    <span className={`font-mono text-[9px] px-2 py-0.5 rounded border ${map[status] ?? 'bg-white/5 text-gray-400 border-white/10'}`}>
      {status}
    </span>
  )
}

function JsonBlock({ data }: { data: unknown }): JSX.Element {
  return (
    <pre className="bg-[#07070E] rounded p-3 text-[10px] text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

export default function DocumentsPanel(): JSX.Element {
  const { addNotification } = useHadesStore()
  const [filename, setFilename] = useState('documento.txt')
  const [content, setContent]   = useState('')
  const [mimeType, setMimeType] = useState('text/plain')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<ProcessResult | null>(null)
  const [error, setError]       = useState('')
  const [history, setHistory]   = useState<DocumentResult[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histLoaded, setHistLoaded]   = useState(false)
  const [openStage, setOpenStage]     = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const MIME_OPTIONS = [
    { value: 'text/plain',       label: 'Texto (.txt)' },
    { value: 'application/json', label: 'JSON (.json)' },
    { value: 'text/csv',         label: 'CSV (.csv)'   },
    { value: 'text/markdown',    label: 'Markdown (.md)' },
  ]

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (ext === '.json') setMimeType('application/json')
    else if (ext === '.csv') setMimeType('text/csv')
    else if (ext === '.md') setMimeType('text/markdown')
    else setMimeType('text/plain')
    const reader = new FileReader()
    reader.onload = ev => setContent((ev.target?.result as string) ?? '')
    reader.readAsText(file, 'utf-8')
  }

  async function processDocument(): Promise<void> {
    if (!content.trim()) { setError('El contenido no puede estar vacío.'); return }
    setLoading(true); setError(''); setResult(null); setOpenStage(null)
    try {
      const res = await fetch(apiPath('/api/v1/documents/process'), {
        method: 'POST',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content, mimeType }),
      })
      const body = await res.json() as { success: boolean; data?: ProcessResult; error?: { code: string; message: string } }
      if (!res.ok || !body.data) {
        const msg = body.error?.message ?? `Error ${res.status}`
        setError(msg)
        addNotification('error', `DOCUMENTOS: ${msg}`)
        return
      }
      setResult(body.data)
      setHistLoaded(false) // reset so history reloads on next open
      addNotification(
        body.data.overallStatus === 'APPROVED' ? 'success' : body.data.overallStatus === 'REJECTED' ? 'error' : 'warning',
        `DOCUMENTOS: ${filename} → ${body.data.overallStatus}`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexión'
      setError(msg)
      addNotification('error', `DOCUMENTOS: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory(): Promise<void> {
    if (histLoading) return
    setHistLoading(true)
    try {
      const res = await fetch(apiPath('/api/v1/documents/results'), { headers: apiHeaders() })
      const body = await res.json() as { success: boolean; data?: DocumentResult[] }
      if (body.success && body.data) { setHistory(body.data); setHistLoaded(true) }
    } catch { /* network error — show nothing */ }
    finally { setHistLoading(false) }
  }

  const stageData: Record<string, unknown> = result
    ? { intake: result.intake, validation: result.validation, summary: result.summary, deliverable: result.deliverable, errors: result.errors }
    : {}

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">DOCUMENTOS</h2>
          <p className="text-[11px] text-gray-600 font-mono">Procesamiento multiagente — 6 agentes en pipeline</p>
        </div>
        <button
          onClick={() => { if (!histLoaded) void loadHistory(); else setHistLoaded(false) }}
          className="font-mono text-[10px] text-electric border border-electric/30 px-3 py-1.5 rounded hover:bg-electric/10 transition-colors"
        >
          {histLoaded ? '↑ Ocultar historial' : '↓ Ver historial'}
        </button>
      </div>

      {/* Pipeline info */}
      <div className="hades-card rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-electric text-sm flex-shrink-0 mt-0.5">⬡</span>
        <p className="text-[11px] text-gray-500 leading-snug">
          Pipeline real (sin simulación): CHARON → MINOS → PERSEPHONE → ELYSIUM → TARTARUS → SQLite.
          Formatos soportados: <span className="text-electric/70">.txt .json .csv .md</span> · Tamaño máximo: <span className="text-electric/70">5 MB</span>
        </p>
      </div>

      {/* Upload form */}
      <div className="hades-card rounded-lg p-4 flex flex-col gap-3">
        <p className="font-mono text-[11px] text-gray-400 tracking-widest">NUEVO DOCUMENTO</p>

        {/* File picker */}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.json,.csv,.md"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="font-mono text-[10px] text-electric border border-electric/30 px-3 py-1.5 rounded hover:bg-electric/10 transition-colors flex-shrink-0"
          >
            ⬆ Seleccionar archivo
          </button>
          <span className="text-[11px] text-gray-500 font-mono truncate flex-1">{filename || 'ningún archivo seleccionado'}</span>
        </div>

        {/* Filename + MIME row */}
        <div className="flex gap-2 flex-wrap">
          <input
            className="flex-1 min-w-0 bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/40 font-mono"
            placeholder="nombre-archivo.txt"
            value={filename}
            onChange={e => setFilename(e.target.value)}
          />
          <select
            className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-electric/40 font-mono"
            value={mimeType}
            onChange={e => setMimeType(e.target.value)}
          >
            {MIME_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Content area */}
        <textarea
          className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/40 resize-y font-mono"
          placeholder="Pegar o escribir el contenido del documento aquí…"
          rows={7}
          value={content}
          onChange={e => setContent(e.target.value)}
        />

        {error && (
          <p className="font-mono text-[11px] text-deny">{error}</p>
        )}

        <button
          onClick={() => void processDocument()}
          disabled={loading || !content.trim()}
          className="font-mono text-[11px] text-electric border border-electric/40 py-2 rounded hover:bg-electric/10 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? <span className="animate-pulse">⬡ Procesando…</span> : '⚡ Procesar documento'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="hades-card rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
            <span className="font-mono text-[11px] text-gray-300 font-bold">{result.filename}</span>
            {statusBadge(result.overallStatus)}
            <span className="font-mono text-[10px] text-gray-600 ml-auto">
              {new Date(result.processedAt).toLocaleTimeString('es-MX')} · {(result.sizeBytes / 1024).toFixed(1)} KB
            </span>
          </div>

          {result.errors.length > 0 && (
            <div className="px-4 py-2 bg-deny/5 border-b border-deny/10">
              {result.errors.map((e, i) => (
                <p key={i} className="font-mono text-[10px] text-deny/80">{e}</p>
              ))}
            </div>
          )}

          {/* Agent stages */}
          <div className="flex flex-col divide-y divide-white/5">
            {STAGES.map(stage => {
              const data = stageData[stage.name]
              const isEmpty = data === null || (Array.isArray(data) && data.length === 0)
              const isOpen = openStage === stage.name
              return (
                <button
                  key={stage.name}
                  onClick={() => setOpenStage(isOpen ? null : stage.name)}
                  className="w-full text-left px-4 py-3 hover:bg-white/2 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-electric/60 text-xs w-5 flex-shrink-0">{stage.icon}</span>
                    <span className="font-mono text-[11px] text-gray-300">{stage.label}</span>
                    {isEmpty && (
                      <span className="font-mono text-[9px] text-gray-600 ml-auto">—</span>
                    )}
                    {!isEmpty && (
                      <span className="font-mono text-[9px] text-electric/50 ml-auto">{isOpen ? '▲' : '▼'}</span>
                    )}
                  </div>
                  {isOpen && !isEmpty && (
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      <JsonBlock data={data} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Mission ID */}
          <div className="px-4 py-2 border-t border-white/5">
            <span className="font-mono text-[9px] text-gray-700">MISSION: {result.missionId}</span>
          </div>
        </div>
      )}

      {/* History */}
      {histLoaded && (
        <div className="hades-card rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <span className="font-mono text-[11px] text-gray-400 tracking-widest">HISTORIAL</span>
            <span className="font-mono text-[10px] text-electric/60 ml-auto">{history.length} resultado{history.length !== 1 ? 's' : ''}</span>
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-4 font-mono text-[11px] text-gray-600">Sin resultados previos.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {history.map(item => (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-[11px] text-gray-300 flex-1 min-w-0 truncate">{item.filename}</span>
                  {statusBadge(item.status)}
                  <span className="font-mono text-[9px] text-gray-600">
                    {new Date(item.createdAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
