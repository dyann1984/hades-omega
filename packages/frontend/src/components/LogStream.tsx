import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';
import type { LogEntry } from '../types.js';

const LEVEL_STYLE: Record<LogEntry['level'], { dot: string; text: string; bg: string }> = {
  info:  { dot: 'bg-electric-400', text: 'text-electric-400/80', bg: '' },
  warn:  { dot: 'bg-golden-400',   text: 'text-golden-400',      bg: 'bg-golden-900/5' },
  error: { dot: 'bg-ruby-400',     text: 'text-ruby-400',        bg: 'bg-ruby-900/10' },
};

function LogLine({ log }: { log: LogEntry }) {
  const s = LEVEL_STYLE[log.level] ?? LEVEL_STYLE.info;
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex gap-1.5 items-start py-0.5 px-1.5 rounded text-[9px] font-mono ${s.bg}`}
    >
      <div className={`w-1 h-1 rounded-full mt-1 shrink-0 ${s.dot}`} />
      <span className="text-gray-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
      <span className="text-gray-500 shrink-0">[{log.source}]</span>
      <span className={`${s.text} break-all leading-relaxed`}>{log.message}</span>
    </motion.div>
  );
}

export function LogStream() {
  const logs = useHadesStore(s => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0" style={{ maxHeight: '220px' }}>
      <div className="flex items-center justify-between px-0.5 shrink-0">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">System Log</div>
        <div className="text-[9px] font-mono text-gray-600">{logs.length}</div>
      </div>
      <div className="flex-1 overflow-y-auto glass-card rounded-lg border border-white/5 p-1.5">
        <AnimatePresence initial={false}>
          {logs.length === 0 ? (
            <div className="text-center py-4 text-[9px] text-gray-600 font-mono">Awaiting activity…</div>
          ) : (
            logs.slice().reverse().map(log => <LogLine key={log.id} log={log} />)
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
