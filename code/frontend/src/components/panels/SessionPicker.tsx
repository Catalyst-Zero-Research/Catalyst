// @ts-nocheck
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Clock, Plus, ChevronRight, History, MessageSquare
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

function timeAgo(ts: string | number | undefined): string {
  if (!ts) return 'Unknown'
  const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function SessionPicker() {
  const isSessionPickerOpen = useStore((s) => s.isSessionPickerOpen)
  const setSessionPickerOpen = useStore((s) => s.setSessionPickerOpen)
  const sessions = useStore((s) => s.sessions)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const loadSessions = useStore((s) => s.loadSessions)
  const createSession = useStore((s) => s.createSession)
  const switchSession = useStore((s) => s.switchSession)

  useEffect(() => {
    if (isSessionPickerOpen) loadSessions()
  }, [isSessionPickerOpen])

  const handleCreate = async () => {
    await createSession()
    setSessionPickerOpen(false)
  }

  const handleSwitch = (id: string) => {
    switchSession(id)
    setSessionPickerOpen(false)
  }

  return (
    <AnimatePresence>
      {isSessionPickerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSessionPickerOpen(false)}
            className="absolute inset-0 z-40"
          />
          {/* Dropdown */}
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            className="absolute top-12 left-16 w-72 bg-surface-1 border border-border-default rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-3.5 py-3 border-b border-border-default">
              <div className="flex items-center gap-2 text-text-primary">
                <History className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-semibold">Sessions</span>
              </div>
              <button
                onClick={() => setSessionPickerOpen(false)}
                className="p-1 text-text-tertiary hover:text-text-primary rounded transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto custom-scrollbar py-1.5">
              {sessions.length === 0 && (
                <div className="text-center py-6 text-xs text-text-quaternary">No sessions yet</div>
              )}
              {sessions.map((session: any) => {
                const id = session.session_id || session.id
                const isCurrent = id === currentSessionId
                const title = session.title || session.name || id?.slice(0, 16) || 'Session'
                const msgCount = session.message_count || 0
                const updatedAt = session.updated_at || session.created_at

                return (
                  <button
                    key={id}
                    onClick={() => handleSwitch(id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2 transition text-left',
                      isCurrent && 'bg-accent-subtle'
                    )}
                  >
                    <div className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0 mt-0.5',
                      isCurrent ? 'bg-accent' : 'bg-border-default'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-xs font-medium truncate', isCurrent ? 'text-accent' : 'text-text-primary')}>
                        {title}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-1 text-[10px] text-text-quaternary">
                          <MessageSquare className="w-2.5 h-2.5" />
                          {msgCount} msgs
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-text-quaternary">
                          <Clock className="w-2.5 h-2.5" />
                          {timeAgo(updatedAt)}
                        </div>
                      </div>
                    </div>
                    {isCurrent && <ChevronRight className="w-3 h-3 text-accent flex-shrink-0" />}
                  </button>
                )
              })}
            </div>

            <div className="border-t border-border-default p-2">
              <button
                onClick={handleCreate}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                New session
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
