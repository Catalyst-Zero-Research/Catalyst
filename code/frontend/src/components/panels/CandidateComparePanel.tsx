// @ts-nocheck
import type { ReactNode } from "react"
import { Download, ExternalLink, Trash2, X } from "lucide-react"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"

export function CandidateComparePanel() {
  const candidates = useStore((state) => state.candidates)
  const isCompareOpen = useStore((state) => state.isCompareOpen)
  const setCompareOpen = useStore((state) => state.setCompareOpen)
  const clearCandidates = useStore((state) => state.clearCandidates)
  const removeCandidate = useStore((state) => state.removeCandidate)
  const setSelectedNodeId = useStore((state) => state.setSelectedNodeId)
  const exportCandidates = useStore((state) => state.exportCandidates)

  if (!isCompareOpen || candidates.length === 0) return null

  return (
    <div className="absolute top-6 bottom-6 left-6 right-[430px] z-30 pointer-events-none">
      <div className="h-full rounded-xl border border-border-default bg-surface-2/95 shadow-[0_28px_80px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl pointer-events-auto flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Candidate comparison</h2>
            <p className="mt-1 text-xs text-text-tertiary">
              {candidates.length} selected material{candidates.length === 1 ? "" : "s"} from the live backend contract
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCandidates}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border-default bg-surface-0 px-3 text-xs text-text-secondary transition hover:bg-surface-1 hover:text-text-primary active:scale-[0.98]"
            >
              <Download className="h-3.5 w-3.5" />
              Export set
            </button>
            <button
              onClick={clearCandidates}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border-default bg-surface-0 px-3 text-xs text-text-tertiary transition hover:bg-surface-1 hover:text-text-primary active:scale-[0.98]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
            <button
              onClick={() => setCompareOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition hover:bg-surface-1 hover:text-text-primary active:scale-[0.96]"
              title="Close comparison"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-[240px_1fr]">
          <div className="border-r border-border-default bg-surface-1 p-4 overflow-y-auto custom-scrollbar">
            <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-text-tertiary">Candidate set</div>
            <div className="flex flex-col gap-2">
              {candidates.map((candidate) => (
                <button
                  key={candidate.material_id}
                  onClick={() => setSelectedNodeId(candidate.material_id)}
                  className="group rounded-lg border border-border-default bg-surface-0 p-3 text-left transition hover:border-border-default/80 hover:bg-surface-1 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-primary">{candidate.formula_pretty}</div>
                      <div className="mt-1 truncate font-mono text-[10px] text-text-tertiary">
                        {candidate.material_id} / {candidate.chemsys}
                      </div>
                    </div>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-quaternary transition group-hover:text-text-secondary" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge active={candidate.is_stable === true}>{candidate.is_stable ? "stable" : "metastable"}</Badge>
                    <Badge>{candidate.is_metal ? "metal" : "non-metal"}</Badge>
                    <Badge>{candidate.ordering || "magnetic N/A"}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 overflow-auto custom-scrollbar p-4">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
                  <HeaderCell>Material</HeaderCell>
                  <HeaderCell>Chemsys</HeaderCell>
                  <HeaderCell>Stability</HeaderCell>
                  <HeaderCell>Formation energy</HeaderCell>
                  <HeaderCell>Hull energy</HeaderCell>
                  <HeaderCell>Band gap</HeaderCell>
                  <HeaderCell>Magnetism</HeaderCell>
                  <HeaderCell>Density</HeaderCell>
                  <HeaderCell>Evidence</HeaderCell>
                  <HeaderCell>Relations</HeaderCell>
                  <HeaderCell></HeaderCell>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.material_id} className="group">
                    <BodyCell>
                      <button
                        onClick={() => setSelectedNodeId(candidate.material_id)}
                        className="text-left transition hover:text-accent"
                      >
                        <span className="block text-sm font-medium text-text-primary">{candidate.formula_pretty}</span>
                        <span className="font-mono text-[10px] text-text-tertiary">{candidate.material_id}</span>
                      </button>
                    </BodyCell>
                    <BodyCell>{candidate.chemsys}</BodyCell>
                    <BodyCell>
                      <span className={cn(candidate.is_stable ? "text-status-success" : "text-status-warning")}>
                        {candidate.is_stable ? "Stable" : "Metastable"}
                      </span>
                    </BodyCell>
                    <BodyCell>{formatNumber(candidate.formation_energy_per_atom, " eV/atom")}</BodyCell>
                    <BodyCell>{formatNumber(candidate.energy_above_hull, " eV")}</BodyCell>
                    <BodyCell>{formatNumber(candidate.band_gap, " eV")}</BodyCell>
                    <BodyCell>{candidate.ordering || (candidate.is_magnetic ? "Magnetic" : "Non-magnetic")}</BodyCell>
                    <BodyCell>{formatNumber(candidate.density, " g/cm3")}</BodyCell>
                    <BodyCell>{candidate.evidence_sections} sections / {candidate.evidence_records} records</BodyCell>
                    <BodyCell>{candidate.relation_count}</BodyCell>
                    <BodyCell>
                      <button
                        onClick={() => removeCandidate(candidate.material_id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition hover:bg-status-danger/10 hover:text-status-danger"
                        title={`Remove ${candidate.formula_pretty}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </BodyCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeaderCell({ children }: { children?: ReactNode }) {
  return <th className="sticky top-0 border-b border-border-default bg-surface-2 px-3 py-3 font-medium">{children}</th>
}

function BodyCell({ children }: { children: ReactNode }) {
  return <td className="border-b border-border-default/40 px-3 py-3 align-top text-text-secondary">{children}</td>
}

function Badge({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px]",
        active ? "border-status-success/25 bg-status-success/10 text-status-success" : "border-border-default bg-surface-0 text-text-tertiary"
      )}
    >
      {children}
    </span>
  )
}

function formatNumber(value?: number | null, suffix = "") {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A"
  return `${value.toFixed(3)}${suffix}`
}
