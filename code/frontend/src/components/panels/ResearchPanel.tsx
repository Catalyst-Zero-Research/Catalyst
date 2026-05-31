// @ts-nocheck
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, FlaskConical, CheckCircle, AlertCircle, XCircle,
  Key, Loader2, Search, ExternalLink, Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'available' || status === 'ok' ? 'bg-status-success' :
    status === 'missing_key' ? 'bg-status-warning' :
    status === 'disabled' || status === 'error' ? 'bg-status-error' :
    'bg-text-quaternary'
  return <span className={cn('w-2 h-2 rounded-full flex-shrink-0', cls)} />
}

function SourceCard({ name, source }: { name: string; source: any }) {
  const status = source?.status || 'unknown'
  const requiresKey = source?.requires_api_key === true
  const label = source?.name || name.replace(/_/g, ' ')
  const desc = source?.description || ''
  const configured = source?.configured === true

  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border-default bg-surface-0 hover:border-border-default/80 transition">
      <StatusDot status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary capitalize">{label}</span>
          {requiresKey && !configured && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-status-warning/10 border border-status-warning/20 text-status-warning">
              <Key className="w-2.5 h-2.5" />
              Key needed
            </span>
          )}
        </div>
        {desc && <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{desc}</p>}
        <div className="mt-1 text-[10px] text-text-quaternary capitalize">{status}</div>
      </div>
    </div>
  )
}

export function ResearchPanel() {
  const isResearchOpen = useStore((s) => s.isResearchOpen)
  const setResearchOpen = useStore((s) => s.setResearchOpen)
  const researchStatus = useStore((s) => s.researchStatus)
  const researchRuns = useStore((s) => s.researchRuns)
  const loadResearchStatus = useStore((s) => s.loadResearchStatus)
  const runResearch = useStore((s) => s.runResearch)
  const isLoading = useStore((s) => s.isLoading)
  const selectedMaterialData = useStore((s) => s.selectedMaterialData)
  const screenResult = useStore((s) => s.screenResult)

  const [query, setQuery] = useState('')

  useEffect(() => {
    if (isResearchOpen) loadResearchStatus()
  }, [isResearchOpen])

  useEffect(() => {
    // Pre-fill query from screen suggestion context
    if (isResearchOpen && screenResult?.research_suggestion?.suggested_query) {
      setQuery(screenResult.research_suggestion.suggested_query)
    } else if (isResearchOpen && selectedMaterialData?.summary?.formula_pretty) {
      setQuery(selectedMaterialData.summary.formula_pretty)
    }
  }, [isResearchOpen])

  const handleSearch = async () => {
    if (!query.trim()) return
    const context = selectedMaterialData
      ? { current_material_id: selectedMaterialData.resolved_material_id || selectedMaterialData.material_id }
      : undefined
    await runResearch(query.trim(), context)
  }

  const modeEnabled = researchStatus?.enabled !== false
  const sources: Record<string, any> = researchStatus?.sources || {}
  const runs = Object.values(researchRuns)

  return (
    <AnimatePresence>
      {isResearchOpen && (
        <motion.div
          initial={{ x: '-100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute top-0 bottom-0 left-0 w-[380px] max-w-[calc(100vw-60px)] bg-surface-1/96 backdrop-blur-xl border-r border-border-default flex flex-col z-40 shadow-2xl"
          style={{ left: '48px' }}
        >
          {/* Header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-border-default flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-status-info/15 border border-status-info/25 flex items-center justify-center">
                <FlaskConical className="w-3.5 h-3.5 text-status-info" />
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary leading-none">Research Mode</div>
                <div className="text-[10px] text-text-tertiary mt-0.5">
                  {modeEnabled ? 'External literature search' : 'Disabled — local snapshot only'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setResearchOpen(false)}
              className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-2 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 flex flex-col gap-4">
            {/* Disabled banner */}
            {!modeEnabled && (
              <div className="p-4 rounded-xl bg-surface-0 border border-border-default">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-text-secondary font-medium">Research mode not enabled</p>
                    <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
                      Research mode is not enabled in this local build. I can continue with the local Materials Project snapshot, or you can configure research sources in Settings.
                    </p>
                    <button
                      onClick={() => { setResearchOpen(false) }}
                      className="mt-2 text-[11px] px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition"
                    >
                      Open settings to configure →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sources */}
            {Object.keys(sources).length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-text-quaternary mb-2 px-0.5">
                  Literature sources ({Object.keys(sources).length})
                </div>
                <div className="flex flex-col gap-2">
                  {Object.entries(sources).map(([name, source]: [string, any]) => (
                    <SourceCard key={name} name={name} source={source} />
                  ))}
                </div>
              </div>
            )}

            {/* Research query */}
            {modeEnabled && (
              <div className="border border-border-default rounded-xl bg-surface-0 p-4">
                <div className="text-xs font-medium text-text-primary mb-3">Run research query</div>
                <div className="flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="e.g. MnO2 high-temperature fatigue resistance"
                    className="flex-1 bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-quaternary focus:outline-none focus:border-accent/50 transition"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!query.trim() || isLoading}
                    className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 text-white text-xs font-medium transition active:scale-95"
                  >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Search
                  </button>
                </div>
              </div>
            )}

            {/* Recent runs */}
            {runs.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-text-quaternary mb-2 px-0.5">
                  Recent runs
                </div>
                <div className="flex flex-col gap-2">
                  {runs.slice(0, 5).map((run: any) => (
                    <div key={run.run_id} className="p-3 rounded-lg bg-surface-0 border border-border-default">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-text-primary truncate flex-1">{run.query || run.run_id}</span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full border ml-2 flex-shrink-0',
                          run.status === 'completed' ? 'bg-status-success/10 border-status-success/20 text-status-success' :
                          run.status === 'running' ? 'bg-accent/10 border-accent/20 text-accent' :
                          'bg-surface-2 border-border-default text-text-tertiary'
                        )}>
                          {run.status || 'queued'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-text-quaternary">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{run.hit_count ?? 0} hits</span>
                        {run.sources?.map((s: string, i: number) => (
                          <span key={i} className="capitalize">{s}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
