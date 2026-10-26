import { AnimatePresence, motion } from 'framer-motion'
import { useHadesStore } from '../store/index.js'
import clsx from 'clsx'

const TYPE_STYLES = {
  info:    'border-electric/50 bg-electric/10 text-electric',
  success: 'border-permit/50 bg-green-950/60 text-green-400',
  warning: 'border-escalate/50 bg-yellow-950/60 text-yellow-400',
  error:   'border-deny/50 bg-red-950/60 text-red-400',
}

const TYPE_ICONS = { info: 'ℹ', success: '✓', warning: '⚠', error: '✗' }

export default function NotificationToast(): JSX.Element {
  const { notifications, removeNotification } = useHadesStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      <AnimatePresence>
        {notifications.map(n => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={clsx(
              'flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs font-mono pointer-events-auto cursor-pointer',
              TYPE_STYLES[n.type],
            )}
            onClick={() => removeNotification(n.id)}
          >
            <span className="flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type]}</span>
            <span className="leading-snug">{n.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
