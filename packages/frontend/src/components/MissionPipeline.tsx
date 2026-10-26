import { motion, AnimatePresence } from 'framer-motion';
import { Map, BarChart3, Wallet, Shield, UserCheck, AlertTriangle, CheckCircle2, Clock, XCircle, ChevronRight } from 'lucide-react';
import { useHadesStore } from '../store.js';
import type { AgentName, Mission, Task } from '../types.js';

type StepStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'WAITING_HUMAN';
type StepAgent = AgentName | 'CERBERUS';

interface PipelineStep {
  agent: StepAgent;
  label: string;
  Icon: React.ElementType;
  color: string;
}

const STEPS: PipelineStep[] = [
  { agent: 'ELYSIUM',    label: 'Plan',     Icon: Map,           color: '#00D4FF' },
  { agent: 'CHARON',     label: 'Procure',  Icon: BarChart3,     color: '#818CF8' },
  { agent: 'PERSEPHONE', label: 'Budget',   Icon: Wallet,        color: '#00FF88' },
  { agent: 'CERBERUS',   label: 'Guard',    Icon: Shield,        color: '#FFD700' },
  { agent: 'MINOS',      label: 'Approve',  Icon: UserCheck,     color: '#FFD700' },
  { agent: 'TARTARUS',   label: 'Audit',    Icon: AlertTriangle, color: '#FF9F43' },
];

// CERBERUS isn't a task agent but shows in the flow — map it to CHARON's cerberus_review task status
function getStepStatus(step: PipelineStep, mission: Mission | null): StepStatus {
  if (!mission) return 'PENDING';

  if ((step.agent as string) === 'CERBERUS') {
    const charonTask = mission.tasks.find(t => t.assignedTo === 'CHARON');
    if (!charonTask) return 'PENDING';
    if (charonTask.status === 'CERBERUS_REVIEW') return 'ACTIVE';
    if (['EXECUTED', 'APPROVED', 'DENIED'].includes(charonTask.status)) return 'COMPLETED';
    if (charonTask.status === 'AWAITING_HUMAN') return 'COMPLETED';
    return 'PENDING';
  }

  const task = mission.tasks.find(t => t.assignedTo === step.agent);
  if (!task) return 'PENDING';
  if (['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'].includes(task.status)) return 'ACTIVE';
  if (task.status === 'CERBERUS_REVIEW') return 'ACTIVE';
  if (task.status === 'AWAITING_HUMAN') return 'WAITING_HUMAN';
  if (task.status === 'EXECUTED' || task.status === 'APPROVED') return 'COMPLETED';
  if (task.status === 'DENIED' || task.status === 'FAILED') return 'FAILED';
  return 'PENDING';
}

function stepBorderClass(status: StepStatus): string {
  switch (status) {
    case 'ACTIVE':        return 'border-electric-400/60 bg-electric-400/5';
    case 'COMPLETED':     return 'border-emerald-400/50 bg-emerald-400/5';
    case 'FAILED':        return 'border-ruby-400/50 bg-ruby-400/5';
    case 'WAITING_HUMAN': return 'border-golden-400/60 bg-golden-400/5';
    default:              return 'border-white/8 bg-white/2';
  }
}

function stepIconColor(status: StepStatus, baseColor: string): string {
  switch (status) {
    case 'ACTIVE':        return '#00D4FF';
    case 'COMPLETED':     return '#00FF88';
    case 'FAILED':        return '#FF4D6D';
    case 'WAITING_HUMAN': return '#FFD700';
    default:              return '#374151';
  }
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'COMPLETED':     return <CheckCircle2 size={10} className="text-emerald-400" />;
    case 'FAILED':        return <XCircle size={10} className="text-ruby-400" />;
    case 'WAITING_HUMAN': return <Clock size={10} className="text-golden-400" />;
    case 'ACTIVE':        return <div className="w-2 h-2 rounded-full bg-electric-400 animate-pulse" />;
    default:              return <div className="w-2 h-2 rounded-full bg-gray-700" />;
  }
}

function StepCard({ step, status, task, agents }: {
  step: PipelineStep;
  status: StepStatus;
  task?: Task;
  agents: { name: string; currentTask?: string; status: string }[];
}) {
  const agent = agents.find(a => a.name === step.agent);
  const iconColor = stepIconColor(status, step.color);
  const currentTask = task?.result?.summary ?? agent?.currentTask;

  return (
    <motion.div
      layout
      className={`flex flex-col gap-1 p-2 rounded-lg border transition-all min-w-0 flex-1 ${stepBorderClass(status)}`}
      animate={status === 'ACTIVE' ? { borderColor: ['#00D4FF44', '#00D4FF99', '#00D4FF44'] } : {}}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <div className="flex items-center justify-between gap-1">
        <step.Icon size={14} style={{ color: iconColor, flexShrink: 0 }} />
        <span className={`text-[8px] font-bold font-mono uppercase tracking-wider flex-1 mx-1 ${
          status === 'ACTIVE' ? 'text-electric-400' :
          status === 'COMPLETED' ? 'text-emerald-400' :
          status === 'FAILED' ? 'text-ruby-400' :
          status === 'WAITING_HUMAN' ? 'text-golden-400' : 'text-gray-600'
        }`}>{step.label}</span>
        <StatusIcon status={status} />
      </div>
      <div className="text-[7px] font-mono text-gray-500 uppercase tracking-wide">{step.agent}</div>
      <AnimatePresence>
        {(status === 'ACTIVE' || status === 'WAITING_HUMAN') && currentTask && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[8px] text-gray-400 leading-relaxed line-clamp-2"
          >
            {currentTask.slice(0, 60)}{currentTask.length > 60 ? '…' : ''}
          </motion.p>
        )}
        {status === 'COMPLETED' && task?.result?.summary && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[8px] text-emerald-400/70 line-clamp-1"
          >
            ✓ {task.result.summary.slice(0, 50)}…
          </motion.p>
        )}
        {status === 'WAITING_HUMAN' && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[8px] text-golden-400/80 font-mono"
          >
            ⏳ Awaiting human decision…
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function MissionPipeline() {
  const { activeMission, agents, missions } = useHadesStore(s => ({
    activeMission: s.activeMission,
    agents: s.agents,
    missions: s.missions,
  }));

  const completedCount = missions.filter(m => m.status === 'COMPLETED').length;
  const activeCount = agents.filter(a => a.status !== 'IDLE' && a.status !== 'COMPLETED').length;

  return (
    <div className="flex-1 glass-card rounded-xl border border-white/8 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-electric-400 animate-pulse" />
          <span className="text-[11px] font-bold text-gray-300 uppercase tracking-[0.2em]">Execution Pipeline</span>
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono">
          <span className="text-electric-400">{activeCount} active</span>
          <span className="text-gray-600">·</span>
          <span className="text-emerald-400">{completedCount} done</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-0">
        {/* Mission text */}
        <AnimatePresence mode="wait">
          {activeMission ? (
            <motion.div
              key={activeMission.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-card rounded-lg px-3 py-2 border border-electric-400/15"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] text-gray-500 uppercase tracking-wider font-mono">Active Mission</span>
                <span className={`text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded border ${
                  activeMission.status === 'COMPLETED' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' :
                  activeMission.status === 'FAILED' ? 'text-ruby-400 border-ruby-400/30' :
                  'text-electric-400 border-electric-400/30 bg-electric-400/5'
                }`}>
                  {activeMission.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">{activeMission.text}</p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-2 text-[10px] text-gray-600 font-mono"
            >
              Awaiting mission directive
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pipeline stepper */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-1 sm:gap-0">
          {STEPS.map((step, idx) => {
            const status = getStepStatus(step, activeMission ?? null);
            const task = activeMission?.tasks.find(t => (t.assignedTo as string) === step.agent);
            return (
              <div key={step.agent} className="flex sm:flex-col items-center sm:items-stretch gap-1 sm:gap-0 flex-1 min-w-0">
                <StepCard step={step} status={status} task={task} agents={agents} />
                {idx < STEPS.length - 1 && (
                  <div className="flex sm:hidden items-center shrink-0">
                    <ChevronRight size={10} className="text-gray-700" />
                  </div>
                )}
                {idx < STEPS.length - 1 && (
                  <div className="hidden sm:flex justify-center items-center h-3 mt-1">
                    <ChevronRight size={10} className="text-gray-700" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Completed mission report */}
        <AnimatePresence>
          {activeMission?.report && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-lg p-2.5 border border-emerald-400/20 bg-emerald-400/3"
            >
              <div className="text-[9px] text-emerald-400 font-bold font-mono uppercase mb-1.5">Mission Complete</div>
              <p className="text-[10px] text-gray-300 mb-2 leading-relaxed">{activeMission.report.summary}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold text-electric-400 font-mono">{activeMission.report.totalAuditRecords}</div>
                  <div className="text-[8px] text-gray-500">Audit Records</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-golden-400 font-mono">{activeMission.report.nearTransactions}</div>
                  <div className="text-[8px] text-gray-500">NEAR Txs</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">{activeMission.tasks.filter(t => t.status === 'EXECUTED').length}</div>
                  <div className="text-[8px] text-gray-500">Tasks Done</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mission history (last 3) */}
        {missions.length > 1 && (
          <div>
            <div className="text-[9px] text-gray-600 font-mono uppercase tracking-wider mb-1.5">Recent Missions</div>
            <div className="flex flex-col gap-1">
              {missions.slice(1, 4).map(m => (
                <div key={m.id} className="flex items-center gap-2 text-[9px] px-2 py-1 rounded border border-white/4 bg-white/1">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    m.status === 'COMPLETED' ? 'bg-emerald-400' :
                    m.status === 'FAILED' ? 'bg-ruby-400' : 'bg-gray-600'
                  }`} />
                  <span className="text-gray-500 truncate flex-1 font-mono">{m.text.slice(0, 50)}…</span>
                  <span className={`text-[8px] font-mono uppercase shrink-0 ${
                    m.status === 'COMPLETED' ? 'text-emerald-400' :
                    m.status === 'FAILED' ? 'text-ruby-400' : 'text-gray-500'
                  }`}>{m.status.slice(0, 6)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
