// ── TopRail: sparse top bar ─── logo · session · status · icons ──────────────
import { Bot, FlaskConical, Settings, History, Network, ListChecks, WifiOff, Wifi, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCatalystStatus, useCatalystSessions, useCatalystCandidates, useCatalystLayout } from '@/catalyst/bridge/hooks'

export function TopRail() {
  const { status, isOffline } = useCatalystStatus()
  const { sessions, currentSessionId } = useCatalystSessions()
  const { candidates } = useCatalystCandidates()
  const { activeSheet, toggleSheet, theme, toggleTheme } = useCatalystLayout()

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const sessionLabel = currentSession?.title || currentSessionId?.slice(0, 10) || '—'

  return (
    <header className="h-11 flex-shrink-0 flex items-center justify-between px-4 border-b select-none z-30"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>

      {/* Left: logo + session breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded" style={{ background: 'var(--accent)', opacity: 0.9 }}>
            <Network className="w-5 h-5 p-0.5 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-1)' }}>
            Catalyst
          </span>
        </div>

        <span style={{ color: 'var(--border)' }}>/</span>

        <button
          onClick={() => toggleSheet('sessions')}
          className={cn(
            'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition',
            activeSheet === 'sessions'
              ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
              : 'text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-3)]',
          )}
        >
          <History className="w-3 h-3" />
          <span className="max-w-[120px] truncate font-mono">{sessionLabel}</span>
        </button>
      </div>

      {/* Center: catalog summary when online */}
      {status.catalog && (
        <div className="hidden md:flex items-center gap-3 text-[11px] font-mono" style={{ color: 'var(--text-4)' }}>
          <span>{status.catalog.materials.toLocaleString()} materials</span>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span>{status.catalog.clusters.toLocaleString()} clusters</span>
        </div>
      )}

      {/* Right: status + action icons */}
      <div className="flex items-center gap-1">
        {/* API status dot */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px]"
          style={{ color: isOffline ? 'var(--danger)' : 'var(--success)' }}>
          {isOffline
            ? <WifiOff className="w-3 h-3" />
            : <Wifi className="w-3 h-3" />}
          <span className="hidden sm:inline">{isOffline ? 'Offline' : 'Online'}</span>
        </div>

        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />

        {/* Theme switcher */}
        <RailBtn
          icon={theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          active={false}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        />

        {/* Candidates tray toggle */}
        <RailBtn
          icon={<ListChecks className="w-4 h-4" />}
          active={activeSheet === 'candidates' || activeSheet === 'compare'}
          onClick={() => toggleSheet('candidates')}
          badge={candidates.length > 0 ? String(candidates.length) : undefined}
          title="Candidates"
        />

        {/* Research */}
        <RailBtn
          icon={<FlaskConical className="w-4 h-4" />}
          active={activeSheet === 'research'}
          onClick={() => toggleSheet('research')}
          title="Research"
        />

        {/* Agent */}
        <RailBtn
          icon={<Bot className="w-4 h-4" />}
          active={activeSheet === 'agent'}
          onClick={() => toggleSheet('agent')}
          title="AI Agent"
        />

        {/* Settings */}
        <RailBtn
          icon={<Settings className="w-4 h-4" />}
          active={activeSheet === 'settings'}
          onClick={() => toggleSheet('settings')}
          title="Settings"
        />
      </div>
    </header>
  )
}


function RailBtn({
  icon, active, onClick, badge, title,
}: {
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  badge?: string
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
        active
          ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
          : 'text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-3)]',
      )}
    >
      {icon}
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-[9px] font-bold flex items-center justify-center px-0.5"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          {badge}
        </span>
      )}
    </button>
  )
}
