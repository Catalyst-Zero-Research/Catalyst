// ── ToastStack: non-blocking notification stack ───────────────────────────────
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useCatalystToasts } from '@/catalyst/bridge/hooks'
import type { Toast } from '@/catalyst/ui-state/appStore'

const ICONS: Record<Toast['type'], React.ReactNode> = {
  success: <CheckCircle  className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />,
  error:   <AlertCircle  className="w-3.5 h-3.5" style={{ color: 'var(--danger)'  }} />,
  warning: <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />,
  info:    <Info          className="w-3.5 h-3.5" style={{ color: 'var(--info)'    }} />,
}

export function ToastStack() {
  const { toasts, removeToast } = useCatalystToasts()
  if (toasts.length === 0) return null

  return (
    <div className="absolute bottom-14 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: 340 }}>
      {toasts.map((t) => (
        <div key={t.id}
          className="flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-xl border shadow-lg text-sm animate-slide-bottom"
          style={{ background: 'var(--surface-3)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        >
          {ICONS[t.type]}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)}
            className="w-5 h-5 rounded flex items-center justify-center transition hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--text-3)' }}>
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
