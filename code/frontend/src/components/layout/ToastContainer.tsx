// @ts-nocheck
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

const ICON = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}
const COLOR = {
  success: 'text-status-success border-status-success/25 bg-status-success/8',
  error: 'text-status-error border-status-error/25 bg-status-error/8',
  warning: 'text-status-warning border-status-warning/25 bg-status-warning/8',
  info: 'text-accent border-accent/25 bg-accent/8',
}

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts)
  const removeToast = useStore((s) => s.removeToast)

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[100] pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = ICON[toast.type]
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className={cn(
                'flex items-center gap-2.5 pl-3.5 pr-2.5 py-2.5 rounded-xl border backdrop-blur-xl shadow-xl text-sm pointer-events-auto',
                COLOR[toast.type]
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 opacity-60 hover:opacity-100 transition rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
