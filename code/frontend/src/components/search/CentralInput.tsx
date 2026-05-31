// ── CentralInput: unified Search | Ask | Screen surface ──────────────────────
import { useState, useRef, type KeyboardEvent } from 'react'
import { Search, Bot, BarChart2, Filter, ArrowRight, Loader2, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useCatalystSearch,
  useCatalystAgent,
  useCatalystGraph,
  useCatalystLayout,
} from '@/catalyst/bridge/hooks'

const FILTER_DEFS = [
  { key: 'elements',     label: 'Elements',    placeholder: 'O,Fe,Mn',  type: 'text'     },
  { key: 'chemsys',      label: 'Chem sys',    placeholder: 'Fe-O',     type: 'text'     },
  { key: 'stable',       label: 'Stable only', type: 'boolean'  },
  { key: 'metal',        label: 'Metal',       type: 'boolean3' },
  { key: 'magnetic',     label: 'Magnetic',    type: 'boolean3' },
  { key: 'band_gap_min', label: 'Gap min (eV)',placeholder: '1.0',      type: 'number'   },
  { key: 'band_gap_max', label: 'Gap max (eV)',placeholder: '3.0',      type: 'number'   },
]

const MODES = [
  { key: 'search', label: 'Search', icon: Search,   placeholder: 'Formula, ID, or chemsys…'                  },
  { key: 'ask',    label: 'Ask',    icon: Bot,       placeholder: 'Ask the agent about materials…'            },
  { key: 'screen', label: 'Screen', icon: BarChart2, placeholder: 'Find stable oxide semiconductors above 2 eV…' },
] as const

type Mode = typeof MODES[number]['key']

export function CentralInput() {
  const [query, setQuery]               = useState('')
  const [mode, setMode]                 = useState<Mode>('search')
  const [filtersOpen, setFiltersOpen]   = useState(false)
  const [localFilters, setLocalFilters] = useState<Record<string, any>>({})

  const { runSearch, results, isLoading: searchLoading, clearSearch, runScreen, screenLoading } = useCatalystSearch()
  const { sendMessage, isRunning: agentRunning }                                      = useCatalystAgent()
  const { selectNode }                                                                = useCatalystGraph()
  const { openSheet }                                                                 = useCatalystLayout()

  const inputRef = useRef<HTMLInputElement>(null)

  const isLoading   = searchLoading || agentRunning || screenLoading
  const activeCount = Object.values(localFilters).filter((v) => v !== '' && v != null).length

  const ModeIcon = MODES.find((m) => m.key === mode)?.icon ?? Search
  const placeholder = MODES.find((m) => m.key === mode)?.placeholder ?? ''

  async function submit() {
    if (!query.trim() && activeCount === 0) return
    if (mode === 'search') {
      const r = await runSearch(query, localFilters) as any
      if (Array.isArray(r) && r.length > 0) {
        const first = r[0]
        selectNode(first.material_id || first.id)
      }
    } else if (mode === 'screen') {
      await runScreen(query)
      openSheet('candidates')
    } else {
      await sendMessage(query)
      openSheet('agent')
    }
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    if (e.key === 'Escape') { setQuery(''); clearSearch(); inputRef.current?.blur() }
  }

  function setFilter(key: string, val: any) {
    setLocalFilters((p) => ({ ...p, [key]: val }))
  }
  function clearFilter(key: string) {
    setLocalFilters((p) => { const n = { ...p }; delete n[key]; return n })
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 w-[520px] max-w-[calc(100vw-48px)] pointer-events-none">

      {/* ── Main input bar ─────────────────────────────────────────────── */}
      <div className="w-full pointer-events-auto flex gap-2 items-center">
        {/* Mode tabs */}
        <div className="flex rounded-lg overflow-hidden border shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {MODES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={cn(
                'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                mode === key
                  ? 'text-[var(--text-1)] bg-[var(--surface-3)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-2)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-xl border shadow-lg transition-colors"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <ModeIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-4)]"
            style={{ color: 'var(--text-1)' }}
          />
          {isLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: 'var(--text-3)' }} />
            : query
              ? <button onClick={() => { setQuery(''); clearSearch() }}><X className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} /></button>
              : null
          }
        </div>

        {/* Filter toggle (only in search mode) */}
        {mode === 'search' && (
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={cn(
              'flex items-center gap-1 h-9 px-2.5 rounded-xl border text-xs transition shrink-0',
              filtersOpen || activeCount > 0
                ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-2)]',
            )}
          >
            <Filter className="w-3 h-3" />
            {activeCount > 0 && <span className="font-bold">{activeCount}</span>}
            <ChevronDown className={cn('w-3 h-3 transition-transform', filtersOpen && 'rotate-180')} />
          </button>
        )}
      </div>

      {/* ── Filter panel ────────────────────────────────────────────────── */}
      {filtersOpen && mode === 'search' && (
        <div className="w-full pointer-events-auto rounded-xl border p-4 shadow-2xl animate-slide-bottom"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>Filters</span>
            {activeCount > 0 && (
              <button onClick={() => setLocalFilters({})} className="text-[11px] flex items-center gap-1 transition hover:text-[var(--danger)]"
                style={{ color: 'var(--text-3)' }}>
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {FILTER_DEFS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-[10px]" style={{ color: 'var(--text-3)' }}>{f.label}</label>
                {f.type === 'boolean' ? (
                  <button
                    onClick={() => setFilter(f.key, localFilters[f.key] ? undefined : 'true')}
                    className={cn('h-7 px-2 rounded-lg border text-[11px] text-left transition',
                      localFilters[f.key]
                        ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-3)] hover:bg-[var(--surface-3)]'
                    )}
                  >
                    {localFilters[f.key] ? '✓ On' : 'Off'}
                  </button>
                ) : f.type === 'boolean3' ? (
                  <select
                    value={localFilters[f.key] ?? ''}
                    onChange={(e) => e.target.value ? setFilter(f.key, e.target.value) : clearFilter(f.key)}
                    className="h-7 px-2 rounded-lg border text-[11px] outline-none"
                    style={{ background: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  >
                    <option value="">Any</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    placeholder={(f as any).placeholder}
                    value={localFilters[f.key] ?? ''}
                    onChange={(e) => e.target.value ? setFilter(f.key, e.target.value) : clearFilter(f.key)}
                    className="h-7 px-2 rounded-lg border text-[11px] outline-none bg-[var(--surface-1)] placeholder:text-[var(--text-4)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => { submit(); setFiltersOpen(false) }}
            className="mt-3 w-full h-8 rounded-lg text-xs font-medium transition active:scale-95"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            Apply &amp; Search
          </button>
        </div>
      )}

      {/* ── Search results dropdown ──────────────────────────────────────── */}
      {results.length > 0 && mode === 'search' && (
        <div className="w-full pointer-events-auto rounded-xl border shadow-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Matches</span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{results.length}</span>
          </div>
          <div className="max-h-60 overflow-y-auto scrollbar-thin">
            {results.slice(0, 10).map((r) => (
              <button
                key={r.material_id}
                onClick={() => { selectNode(r.material_id); clearSearch() }}
                className="group w-full grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-left border-b transition hover:bg-[var(--surface-3)] active:scale-[0.99]"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>{r.formula_pretty}</span>
                  <span className="block truncate font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {r.material_id} / {r.chemsys}
                  </span>
                </span>
                <span className="flex items-center gap-2 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {r.band_gap !== undefined && r.band_gap !== null ? `${Number(r.band_gap).toFixed(2)} eV` : 'open'}
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
