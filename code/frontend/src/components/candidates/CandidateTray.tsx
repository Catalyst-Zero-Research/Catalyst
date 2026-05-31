// ── CandidateTray: bottom bar when candidates exist ────────────────────────
import { X, BarChart2, Download, ChevronUp, ChevronDown } from 'lucide-react'
import { useCatalystCandidates, useCatalystLayout } from '@/catalyst/bridge/hooks'
import type { CandidateRowVM } from '@/catalyst/bridge/viewModels'

export function CandidateTray() {
  const { candidates, removeCandidate, canCompare, canExport, runCompare, exportCandidates } = useCatalystCandidates()
  const { candidateTrayExpanded, setCandidateTrayExpanded, openSheet } = useCatalystLayout()

  if (candidates.length === 0) return null

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 animate-slide-bottom"
      style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>

      {/* Handle */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {candidates.length} candidate{candidates.length > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => { if (canCompare) { openSheet('compare'); runCompare() } }}
            disabled={!canCompare}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition active:scale-95 disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            <BarChart2 className="w-3 h-3" /> Compare
          </button>
          <button
            onClick={() => exportCandidates('json')}
            disabled={!canExport}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs border transition active:scale-95 disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface-3)' }}
          >
            <Download className="w-3 h-3" /> Export
          </button>
        </div>
        <button
          onClick={() => setCandidateTrayExpanded(!candidateTrayExpanded)}
          className="flex items-center gap-1 text-xs transition"
          style={{ color: 'var(--text-3)' }}
        >
          {candidateTrayExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expanded list */}
      {candidateTrayExpanded && (
        <div className="px-4 pb-3 flex flex-wrap gap-2 max-h-28 overflow-y-auto scrollbar-thin">
          {candidates.map((c) => <CandidateChip key={c.material_id} candidate={c} onRemove={removeCandidate} />)}
        </div>
      )}
    </div>
  )
}

function CandidateChip({ candidate, onRemove }: { candidate: CandidateRowVM; onRemove: (id: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border text-xs"
      style={{ background: 'var(--surface-3)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
      <span className="font-mono">{candidate.formula_pretty}</span>
      <button onClick={() => onRemove(candidate.material_id)}
        className="w-4 h-4 rounded-full flex items-center justify-center transition hover:bg-[var(--danger)] hover:text-white"
        style={{ color: 'var(--text-4)' }}>
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}
