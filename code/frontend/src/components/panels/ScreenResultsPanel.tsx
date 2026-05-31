// @ts-nocheck
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Check, AlertTriangle, FlaskConical, ChevronRight,
  Plus, Loader2, BarChart2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(Math.max(score, 0), 1) * 100)
  const color =
    pct >= 70 ? 'bg-status-success' : pct >= 40 ? 'bg-status-warning' : 'bg-status-error'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-1 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-text-secondary w-8 text-right">{pct}%</span>
    </div>
  )
}

function RequirementChip({ req, matched }: { req: any; matched: boolean }) {
  const label = typeof req === 'string' ? req : (req.property || req.label || req.type || JSON.stringify(req))
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
        matched
          ? 'bg-status-success/10 border-status-success/25 text-status-success'
          : 'bg-status-error/10 border-status-error/25 text-status-error'
      )}
    >
      {matched ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
      {String(label).slice(0, 40)}
    </span>
  )
}

export function ScreenResultsPanel() {
  const isScreenOpen = useStore((s) => s.isScreenOpen)
  const setScreenOpen = useStore((s) => s.setScreenOpen)
  const screenResult = useStore((s) => s.screenResult)
  const screenLoading = useStore((s) => s.screenLoading)
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId)
  const addCandidate = useStore((s) => s.addCandidate)
  const setResearchOpen = useStore((s) => s.setResearchOpen)

  if (!isScreenOpen && !screenLoading) return null

  return (
    <AnimatePresence>
      <motion.div
        key="screen-panel"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 max-h-[62vh] bg-surface-1/96 backdrop-blur-xl border-t border-border-default flex flex-col z-35 shadow-2xl"
        style={{ zIndex: 35 }}
      >
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-border-default flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-text-primary">Candidate Screening</span>
            {screenResult?.candidates && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                {screenResult.candidates.length} found
              </span>
            )}
          </div>
          <button
            onClick={() => setScreenOpen(false)}
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-2 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loading */}
        {screenLoading && (
          <div className="flex-1 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
            <span className="text-sm text-text-tertiary">Screening materials…</span>
          </div>
        )}

        {/* Results */}
        {!screenLoading && screenResult && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Requirement header */}
            {screenResult.requirement && (
              <div className="px-4 pt-3 pb-2.5 border-b border-border-subtle">
                <div className="text-[10px] uppercase tracking-wider text-text-quaternary mb-1">Requirement</div>
                <p className="text-sm text-text-secondary leading-snug">"{screenResult.requirement}"</p>
                {screenResult.parsed_requirements?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {screenResult.parsed_requirements.slice(0, 6).map((req: any, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-0 border border-border-default text-text-tertiary">
                        {String(req.property || req.label || req).slice(0, 30)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Unsupported */}
            {screenResult.unsupported_requirements?.length > 0 && (
              <div className="px-4 py-2 flex items-center gap-2 bg-status-warning/5 border-b border-status-warning/10">
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                <span className="text-[11px] text-status-warning">
                  {screenResult.unsupported_requirements.length} requirement{screenResult.unsupported_requirements.length !== 1 ? 's' : ''} require external literature
                </span>
              </div>
            )}

            {/* Candidate list */}
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(screenResult.candidates || []).map((candidate: any, i: number) => {
                const m = candidate.material || candidate
                const matId = candidate.material_id || m.material_id
                const formula = candidate.label || m.formula_pretty || matId || '—'
                const score = typeof candidate.score === 'number' ? candidate.score : 0
                const matched = Array.isArray(candidate.matched) ? candidate.matched : []
                const missing = Array.isArray(candidate.missing) ? candidate.missing : []
                const reason = candidate.reason_summary || ''
                const evidenceCount = Array.isArray(candidate.evidence_refs) ? candidate.evidence_refs.length : 0

                return (
                  <div
                    key={matId || i}
                    className="rounded-xl bg-surface-0 border border-border-default p-3.5 hover:border-accent/20 transition"
                  >
                    <div className="flex items-start justify-between mb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary font-mono">{formula}</span>
                          <span className="text-[10px] bg-surface-2 text-text-quaternary px-1.5 py-0.5 rounded font-mono">#{i + 1}</span>
                        </div>
                        {matId && matId !== formula && (
                          <div className="text-[10px] text-text-quaternary mt-0.5 font-mono">{matId}</div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => matId && setSelectedNodeId(matId)}
                          title="Open workspace"
                          className="p-1.5 text-text-tertiary hover:text-accent hover:bg-accent/10 rounded-lg transition"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => matId && addCandidate({
                            material_id: matId,
                            summary: { formula_pretty: formula, chemsys: m.chemsys, is_stable: m.is_stable, band_gap: m.band_gap, formation_energy_per_atom: m.formation_energy_per_atom, energy_above_hull: m.energy_above_hull, is_metal: m.is_metal, is_magnetic: m.is_magnetic, ordering: m.ordering, source_release: m.source_release },
                            material: m,
                            relation_count: candidate.relation_count || 0,
                          })}
                          title="Add to candidate set"
                          className="p-1.5 text-text-tertiary hover:text-status-success hover:bg-status-success/10 rounded-lg transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <ScoreBar score={score} />

                    {reason && (
                      <p className="text-xs text-text-secondary mt-2 leading-relaxed line-clamp-2">{reason}</p>
                    )}

                    {(matched.length > 0 || missing.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {matched.slice(0, 3).map((r: any, j: number) => (
                          <RequirementChip key={j} req={r} matched={true} />
                        ))}
                        {missing.slice(0, 3).map((r: any, j: number) => (
                          <RequirementChip key={`m-${j}`} req={r} matched={false} />
                        ))}
                      </div>
                    )}

                    {evidenceCount > 0 && (
                      <div className="mt-2 text-[10px] text-text-quaternary">{evidenceCount} evidence ref{evidenceCount !== 1 ? 's' : ''}</div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Research suggestion */}
            {screenResult.research_suggestion && (
              <div className="mx-4 mb-4 p-3.5 rounded-xl bg-status-info/8 border border-status-info/20">
                <div className="flex items-start gap-2.5">
                  <FlaskConical className="w-4 h-4 text-status-info flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-status-info mb-1">Research mode suggested</div>
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      {screenResult.research_suggestion.message || 'External literature may have better candidates for some requirements.'}
                    </p>
                    <button
                      onClick={() => { setScreenOpen(false); setResearchOpen(true) }}
                      className="mt-2 text-[11px] px-3 py-1 rounded-lg bg-status-info/15 text-status-info hover:bg-status-info/25 transition"
                    >
                      Configure research sources →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
