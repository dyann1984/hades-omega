import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';

const DEMO_MISSIONS = [
  'Evaluate server vendors for TechCore Industries Q1 2027, budget $50,000 MXN',
  'Analyze cloud migration options for DataCore SA, infrastructure budget $120,000 MXN',
  'Review cybersecurity vendor proposals, annual contract $80,000 MXN',
];

export function MissionControl() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { connected, missions } = useHadesStore(s => ({ connected: s.connected, missions: s.missions }));

  async function submit() {
    if (!text.trim() || loading || !connected) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] px-0.5">Mission Control</div>

      {/* Input area */}
      <div className="glass-card rounded-lg p-2.5 border border-electric-400/20">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submit(); }}
          placeholder="Enter enterprise mission directive…"
          rows={3}
          disabled={loading}
          className="w-full bg-transparent text-xs text-gray-300 placeholder-gray-600 resize-none focus:outline-none font-mono leading-relaxed"
        />
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
          <span className="text-[8px] text-gray-600 font-mono">Ctrl+Enter to send</span>
          <button
            onClick={submit}
            disabled={!text.trim() || loading || !connected}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold font-mono uppercase tracking-wider
              bg-electric-400/10 border border-electric-400/30 text-electric-400
              hover:bg-electric-400/20 hover:border-electric-400/60
              disabled:opacity-30 disabled:cursor-not-allowed
              transition-all"
          >
            {loading ? (
              <><span className="animate-spin">⚙</span> Processing…</>
            ) : (
              <>⚡ Execute</>
            )}
          </button>
        </div>
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[9px] text-ruby-400 mt-1.5 font-mono"
            >
              ⚠ {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Quick scenarios */}
      <div>
        <div className="text-[8px] text-gray-600 uppercase tracking-wider mb-1 font-mono">Quick Scenarios</div>
        <div className="flex flex-col gap-1">
          {DEMO_MISSIONS.map((m, i) => (
            <button
              key={i}
              onClick={() => setText(m)}
              disabled={loading}
              className="text-left text-[9px] text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded
                border border-transparent hover:border-electric-400/20 hover:bg-electric-400/5
                transition-all font-mono leading-relaxed truncate disabled:opacity-30"
            >
              → {m.slice(0, 55)}…
            </button>
          ))}
        </div>
      </div>

      {/* Recent missions mini list */}
      {missions.length > 0 && (
        <div className="mt-1">
          <div className="text-[8px] text-gray-600 uppercase tracking-wider mb-1 font-mono">Recent</div>
          <div className="flex flex-col gap-1">
            {missions.slice(0, 3).map(m => {
              const sc: Record<string, string> = {
                COMPLETED: 'text-emerald-400', FAILED: 'text-ruby-400',
                IN_PROGRESS: 'text-electric-400', ANALYZING: 'text-indigo-400',
              };
              return (
                <div key={m.id} className="flex items-center gap-2 text-[9px] font-mono px-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'COMPLETED' ? 'bg-emerald-400' : m.status === 'FAILED' ? 'bg-ruby-400' : 'bg-electric-400 animate-pulse'}`} />
                  <span className="text-gray-500 truncate flex-1">{m.text.slice(0, 40)}…</span>
                  <span className={`${sc[m.status] ?? 'text-gray-500'} uppercase text-[8px] shrink-0`}>{m.status.slice(0, 4)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
