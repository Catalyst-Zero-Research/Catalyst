// ── CompareSheet: right sheet for comparing candidates ───────────────────────
import { X, Download, Loader2 } from 'lucide-react'
import { useCatalystCandidates, useCatalystLayout } from '@/catalyst/bridge/hooks'
import type { CandidateRowVM } from '@/catalyst/bridge/viewModels'

const COLS: { key: keyof CandidateRowVM; label: string; unit?: string; mono?: boolean }[] = [
  { key: 'formula_pretty',            label: 'Formula',   mono: true },
  { key: 'chemsys',                   label: 'Chem sys',  mono: true },
  { key: 'is_stable',                 label: 'Stable'                },
  { key: 'formation_energy_per_atom', label: 'Eform',     unit: 'eV/atom', mono: true },
  { key: 'energy_above_hull',         label: 'Hull',      unit: 'eV/atom', mono: true },
  { key: 'band_gap',                  label: 'Band gap',  unit: 'eV',      mono: true },
  { key: 'is_metal',                  label: 'Metal'                 },
  { key: 'density',                   label: 'Density',   unit: 'g/cm³', mono: true },
  { key: 'crystal_system',            label: 'Crystal'               },
  { key: 'relation_count',            label: 'Relations', mono: true },
  { key: 'evidence_records',          label: 'Evidence',  mono: true },
]

export function CompareSheet() {
  const { candidates, compareLoading, compareError, exportCandidates } = useCatalystCandidates()
  const { activeSheet, closeSheet } = useCatalystLayout()

  if (activeSheet !== 'compare') return null

  return (
    <div className="absolute top-0 bottom-0 right-0 z-40 flex flex-col animate-slide-right shadow-2xl overflow-hidden"
      style={{ width: 640, maxWidth: 'calc(100vw - 56px)', background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>

      {/* Header */}
      <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          Compare ({candidates.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCandidates('json')}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs border transition"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--surface-3)' }}
          >
            <Download className="w-3 h-3" /> Export JSON
          </button>
          <button onClick={closeSheet}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
            style={{ color: 'var(--text-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto scrollbar-thin p-5">
        {compareLoading && (
          <div className="flex items-center justify-center h-32 gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading comparison…
          </div>
        )}
        {compareError && !compareLoading && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--danger)' }}>{compareError}</p>
        )}

        {candidates.length > 0 && (
          <table className="w-full text-xs border-separate" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-4)', width: 140 }}>Property</th>
                {candidates.map((c) => (
                  <th key={c.material_id} className="text-left py-2 px-3 font-medium" style={{ color: 'var(--text-2)' }}>
                    <span className="font-mono">{c.formula_pretty}</span>
                    <span className="block text-[10px] font-mono" style={{ color: 'var(--text-4)' }}>{c.material_id}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COLS.map(({ key, label, unit, mono }) => (
                <tr key={key} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text-3)' }}>{label}</td>
                  {candidates.map((c) => {
                    const raw = c[key]
                    let val = '—'
                    if (raw === true)  val = 'Yes'
                    else if (raw === false) val = 'No'
                    else if (raw !== undefined && raw !== null) {
                      const n = Number(raw)
                      val = isNaN(n) ? String(raw) : n.toFixed(typeof raw === 'number' && raw < 10 ? 3 : 0)
                      if (unit) val += ` ${unit}`
                    }
                    return (
                      <td key={c.material_id} className="py-2 px-3"
                        style={{ color: 'var(--text-1)', fontFamily: mono ? 'monospace' : undefined }}>
                        {val}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
