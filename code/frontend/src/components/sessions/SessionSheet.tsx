// ── SessionSheet ──────────────────────────────────────────────────────────────
import { X, Plus, Check } from 'lucide-react'
import { useCatalystSessions, useCatalystLayout } from '@/catalyst/bridge/hooks'

export function SessionSheet() {
  const { sessions, currentSessionId, createSession, switchSession } = useCatalystSessions()
  const { activeSheet, closeSheet }                                    = useCatalystLayout()

  if (activeSheet !== 'sessions') return null

  return (
    <div className="absolute top-0 bottom-0 right-0 z-40 flex flex-col animate-slide-right shadow-2xl"
      style={{ width: 320, maxWidth: 'calc(100vw - 56px)', background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>

      <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Sessions</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => createSession()}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs border transition"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface-3)' }}
          >
            <Plus className="w-3 h-3" /> New
          </button>
          <button onClick={closeSheet}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
            style={{ color: 'var(--text-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 flex flex-col gap-1">
        {sessions.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>No sessions yet.</p>
        )}
        {sessions.map((s) => {
          const isActive = s.id === currentSessionId
          return (
            <button
              key={s.id}
              onClick={() => { switchSession(s.id); closeSheet() }}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left border transition"
              style={{
                background: isActive ? 'var(--accent-muted)' : 'transparent',
                borderColor: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.title}</p>
                <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-4)' }}>{s.id}</p>
              </div>
              {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-2" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
