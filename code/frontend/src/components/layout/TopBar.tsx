// @ts-nocheck
import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Settings,
  ListChecks,
  FileText,
  Bot,
  BarChart2,
  Loader2,
  FlaskConical,
  History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

export function TopBar() {
  const candidates = useStore((s) => s.candidates)
  const setCompareOpen = useStore((s) => s.setCompareOpen)
  const isSettingsOpen = useStore((s) => s.isSettingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const selectedMaterialData = useStore((s) => s.selectedMaterialData)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const isAgentOpen = useStore((s) => s.isAgentOpen)
  const setAgentOpen = useStore((s) => s.setAgentOpen)
  const isResearchOpen = useStore((s) => s.isResearchOpen)
  const setResearchOpen = useStore((s) => s.setResearchOpen)
  const isSessionPickerOpen = useStore((s) => s.isSessionPickerOpen)
  const setSessionPickerOpen = useStore((s) => s.setSessionPickerOpen)
  const currentSessionId = useStore((s) => s.currentSessionId)
  const sessions = useStore((s) => s.sessions)
  const screenLoading = useStore((s) => s.screenLoading)
  const runScreen = useStore((s) => s.runScreen)

  const [screenInputOpen, setScreenInputOpen] = useState(false)
  const [screenQuery, setScreenQuery] = useState('')

  const currentTitle = selectedMaterialData?.summary?.formula_pretty || selectedNodeId || 'workspace-graph'
  const currentSession = sessions.find((s: any) => (s.session_id || s.id) === currentSessionId)
  const sessionLabel = currentSession?.title || currentSessionId?.slice(0, 12) || 'No session'

  const handleScreen = () => {
    if (!screenQuery.trim()) return
    runScreen(screenQuery.trim())
    setScreenQuery('')
    setScreenInputOpen(false)
  }

  return (
    <div className="h-10 w-full bg-surface-0 border-b border-border-default flex items-center justify-between px-3 z-20 flex-shrink-0 select-none">
      {/* Left: Nav + Tabs */}
      <div className="flex items-center h-full gap-1.5 overflow-hidden">
        {/* Navigation arrows */}
        <div className="flex items-center gap-0.5 text-text-tertiary mr-2">
          <button className="p-1 hover:text-text-primary hover:bg-surface-1 rounded transition" title="Go back">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 hover:text-text-primary hover:bg-surface-1 rounded transition" title="Go forward">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Obsidian-style tabs */}
        <div className="flex items-end h-full gap-0.5 overflow-x-auto custom-scrollbar pt-1 pr-4">
          <ObsidianTab label="Graph View" isActive icon={<NetworkIcon />} />
          <ObsidianTab label="Table View" icon={<TableIcon />} />
          <ObsidianTab label="Explore" icon={<ExploreIcon />} />
          <button className="p-1 mb-1.5 hover:text-text-primary hover:bg-surface-1 rounded text-text-tertiary transition" title="New tab">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Middle: breadcrumb */}
      <div className="hidden md:flex items-center gap-1.5 text-[11px] text-text-tertiary font-mono truncate max-w-[28%]">
        <span>catalyst</span>
        <span>/</span>
        <button
          onClick={() => setSessionPickerOpen(!isSessionPickerOpen)}
          className="flex items-center gap-1 hover:text-text-secondary transition"
          title="Switch session"
        >
          <History className="w-3 h-3" />
          <span className="truncate max-w-[80px]">{sessionLabel}</span>
        </button>
        <span>/</span>
        <span className="text-text-secondary truncate flex items-center gap-1">
          <FileText className="w-3 h-3 text-node-material" />
          {currentTitle}
        </span>
      </div>

      {/* Right: Action bar */}
      <div className="flex items-center gap-2 text-text-tertiary">
        {/* Screen input */}
        {screenInputOpen ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={screenQuery}
              onChange={(e) => setScreenQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleScreen(); if (e.key === 'Escape') setScreenInputOpen(false) }}
              placeholder="Screen requirement…"
              className="h-6 w-52 bg-surface-1 border border-accent/30 rounded px-2 text-[11px] text-text-primary placeholder:text-text-quaternary focus:outline-none"
            />
            <button
              onClick={handleScreen}
              disabled={screenLoading}
              className="h-6 px-2 rounded bg-accent text-white text-[11px] flex items-center gap-1 hover:bg-accent-hover transition"
            >
              {screenLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart2 className="w-3 h-3" />}
              Screen
            </button>
            <button onClick={() => setScreenInputOpen(false)} className="p-1 hover:text-text-primary rounded transition">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setScreenInputOpen(true)}
            className="inline-flex h-6 items-center gap-1.5 rounded border border-border-default bg-surface-1 px-2 text-[10px] hover:bg-surface-2 hover:text-text-primary transition"
            title="Screen materials by requirement"
          >
            {screenLoading ? <Loader2 className="w-3 h-3 animate-spin text-accent" /> : <BarChart2 className="w-3 h-3" />}
            Screen
          </button>
        )}

        {/* Candidates */}
        <button
          onClick={() => setCompareOpen(candidates.length > 0)}
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded border px-2 text-[10px] transition active:scale-[0.98]',
            candidates.length > 0
              ? 'bg-accent-muted text-accent border-accent/20 hover:bg-accent/25'
              : 'bg-surface-1 border-border-default text-text-tertiary hover:bg-surface-2'
          )}
          title={candidates.length > 0 ? 'Open comparison' : 'No candidates selected'}
        >
          <ListChecks className="w-3 h-3" />
          <span>Candidates ({candidates.length})</span>
        </button>

        {/* Research */}
        <button
          onClick={() => setResearchOpen(!isResearchOpen)}
          className={cn(
            'p-1 rounded transition',
            isResearchOpen ? 'text-status-info bg-surface-1' : 'hover:text-text-primary hover:bg-surface-1'
          )}
          title="Research mode"
        >
          <FlaskConical className="w-4 h-4" />
        </button>

        {/* Agent */}
        <button
          onClick={() => setAgentOpen(!isAgentOpen)}
          className={cn(
            'p-1 rounded transition relative',
            isAgentOpen ? 'text-accent bg-surface-1' : 'hover:text-text-primary hover:bg-surface-1'
          )}
          title="Open agent"
        >
          <Bot className="w-4 h-4" />
          {isAgentOpen && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />
          )}
        </button>

        <div className="w-[1px] h-4 bg-border-default" />

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(!isSettingsOpen)}
          className={cn(
            'p-1 rounded transition',
            isSettingsOpen ? 'text-text-primary bg-surface-1' : 'hover:text-text-primary hover:bg-surface-1'
          )}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function ObsidianTab({ label, isActive, icon }: { label: string; isActive?: boolean; icon?: React.ReactNode }) {
  return (
    <div
      className={cn(
        'h-8 px-3 flex items-center gap-1.5 text-xs rounded-t-md border-t border-x transition-colors relative cursor-pointer select-none group min-w-[110px] max-w-[150px]',
        isActive
          ? 'bg-surface-1 text-text-primary border-border-default border-b-surface-1'
          : 'bg-surface-0 text-text-tertiary border-transparent hover:bg-surface-1 hover:text-text-secondary'
      )}
    >
      {icon}
      <span className="truncate pr-4">{label}</span>
      <button
        className={cn(
          'absolute right-1.5 p-0.5 rounded-full hover:bg-surface-2 hover:text-text-primary text-text-tertiary/30 transition opacity-0 group-hover:opacity-100',
          isActive && 'opacity-60'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

const NetworkIcon = () => (
  <svg className="w-3 h-3 text-node-element" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" />
    <path d="M15 6H9M9 6v12M15 18H9" />
  </svg>
)
const TableIcon = () => (
  <svg className="w-3 h-3 text-status-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
)
const ExploreIcon = () => (
  <svg className="w-3 h-3 text-node-cluster" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
)
