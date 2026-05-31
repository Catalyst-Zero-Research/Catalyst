// @ts-nocheck
import { useState, type KeyboardEvent } from 'react'
import { Search, Filter, ArrowRight, Loader2, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

const FILTER_DEFS = [
  { key: 'elements', label: 'Elements', placeholder: 'O,Fe,Mn', type: 'text' },
  { key: 'chemsys', label: 'Chem sys', placeholder: 'Fe-O', type: 'text' },
  { key: 'stable', label: 'Stable only', type: 'boolean' },
  { key: 'metal', label: 'Metal', type: 'boolean3' },
  { key: 'magnetic', label: 'Magnetic', type: 'boolean3' },
  { key: 'band_gap_min', label: 'Gap min (eV)', placeholder: '1.0', type: 'number' },
  { key: 'band_gap_max', label: 'Gap max (eV)', placeholder: '3.0', type: 'number' },
  { key: 'density_min', label: 'Density min', placeholder: '1.0', type: 'number' },
  { key: 'density_max', label: 'Density max', placeholder: '10.0', type: 'number' },
]

export function SearchOverlay() {
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState<Record<string, any>>({})
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId)
  const runSearch = useStore((s) => s.runSearch)
  const searchResults = useStore((s) => s.searchResults)
  const isLoading = useStore((s) => s.isLoading)
  const error = useStore((s) => s.error)
  const selectedMaterialData = useStore((s) => s.selectedMaterialData)
  const visibleError = selectedMaterialData ? null : error

  const activeFilterCount = Object.values(localFilters).filter((v) => v !== '' && v !== undefined && v !== null).length

  const submitSearch = async () => {
    if (!query.trim() && activeFilterCount === 0) return
    const results = await runSearch(query, localFilters)
    if (results.length > 0) {
      setSelectedNodeId(results[0].material_id || results[0].id)
    }
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (query.trim() || activeFilterCount > 0)) submitSearch()
  }

  const setFilter = (key: string, val: any) => {
    setLocalFilters((prev) => ({ ...prev, [key]: val }))
  }

  const clearFilter = (key: string) => {
    setLocalFilters((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  const clearAll = () => { setLocalFilters({}); setQuery('') }

  return (
    <div className="absolute top-6 left-6 z-40 flex max-w-[calc(100vw-128px)] flex-col gap-2 pointer-events-none">
      {/* Search bar */}
      <div className="flex gap-2 items-center pointer-events-auto">
        <div className="w-[430px] max-w-full min-h-10 bg-surface-2/95 backdrop-blur border border-border-default rounded-lg flex items-center px-3 shadow-lg">
          <Search className="w-4 h-4 text-text-tertiary mr-2 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search material, formula, chemsys…"
            className="bg-transparent border-none outline-none text-sm text-text-primary flex-1 placeholder:text-text-quaternary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          {isLoading ? (
            <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin text-text-tertiary" />
          ) : (
            <button
              onClick={submitSearch}
              className="ml-2 rounded bg-surface-0 border border-border-default px-2 py-1 text-[10px] font-mono text-text-tertiary transition hover:bg-surface-1 hover:text-text-primary active:scale-95"
            >
              Enter
            </button>
          )}
        </div>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={cn(
            'flex items-center gap-1.5 px-3 h-10 border rounded-lg text-xs shadow-lg cursor-pointer transition active:scale-[0.98]',
            filtersOpen || activeFilterCount > 0
              ? 'bg-accent/15 border-accent/30 text-accent'
              : 'bg-surface-2/90 border-border-default text-text-primary hover:bg-surface-3'
          )}
        >
          <Filter className="w-3 h-3" />
          Filters
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-accent text-white text-[9px] flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={cn('w-3 h-3 transition-transform', filtersOpen && 'rotate-180')} />
        </button>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div className="pointer-events-auto w-[540px] max-w-full bg-surface-2/97 backdrop-blur-xl border border-border-default rounded-xl shadow-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-text-primary">Search filters</span>
            {activeFilterCount > 0 && (
              <button onClick={clearAll} className="text-[11px] text-text-tertiary hover:text-status-error transition flex items-center gap-1">
                <X className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {FILTER_DEFS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-[10px] text-text-tertiary">{f.label}</label>
                {f.type === 'boolean' ? (
                  <button
                    onClick={() => setFilter(f.key, localFilters[f.key] ? undefined : 'true')}
                    className={cn(
                      'h-7 px-2 rounded border text-[11px] text-left transition',
                      localFilters[f.key]
                        ? 'bg-accent/15 border-accent/30 text-accent'
                        : 'bg-surface-1 border-border-default text-text-tertiary hover:bg-surface-0'
                    )}
                  >
                    {localFilters[f.key] ? '✓ On' : 'Off'}
                  </button>
                ) : f.type === 'boolean3' ? (
                  <select
                    value={localFilters[f.key] ?? ''}
                    onChange={(e) => e.target.value ? setFilter(f.key, e.target.value) : clearFilter(f.key)}
                    className="h-7 px-2 rounded border border-border-default bg-surface-1 text-[11px] text-text-primary focus:outline-none focus:border-accent/50"
                  >
                    <option value="">Any</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    placeholder={f.placeholder}
                    value={localFilters[f.key] ?? ''}
                    onChange={(e) => e.target.value ? setFilter(f.key, e.target.value) : clearFilter(f.key)}
                    className="h-7 px-2 rounded border border-border-default bg-surface-1 text-[11px] text-text-primary placeholder:text-text-quaternary focus:outline-none focus:border-accent/50"
                  />
                )}
              </div>
            ))}
          </div>
          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="mt-3 pt-3 border-t border-border-subtle flex flex-wrap gap-1.5">
              {Object.entries(localFilters)
                .filter(([, v]) => v !== '' && v !== undefined && v !== null)
                .map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent"
                  >
                    {k}: {String(v)}
                    <button onClick={() => clearFilter(k)} className="ml-0.5 hover:text-white transition">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
            </div>
          )}
          <button
            onClick={() => { submitSearch(); setFiltersOpen(false) }}
            className="mt-3 w-full h-8 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition active:scale-95"
          >
            Apply filters
          </button>
        </div>
      )}

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="pointer-events-auto w-[430px] max-w-full max-h-[280px] overflow-hidden rounded-xl border border-border-default bg-surface-2/95 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
            <span className="text-[11px] uppercase tracking-[0.16em] text-text-tertiary">Matches</span>
            <span className="font-mono text-[11px] text-text-tertiary">{searchResults.length}</span>
          </div>
          <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
            {searchResults.slice(0, 10).map((result: any) => (
              <button
                key={result.material_id || result.id}
                className="group grid w-full grid-cols-[1fr_auto] gap-3 border-b border-border-subtle px-3 py-2 text-left transition hover:bg-surface-3 active:scale-[0.99]"
                onClick={() => setSelectedNodeId(result.material_id || result.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary">{result.formula_pretty || result.material_id}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-text-tertiary">
                    {result.material_id} / {result.chemsys || 'unknown'}
                  </span>
                </span>
                <span className="flex items-center gap-2 font-mono text-[11px] text-text-tertiary">
                  {typeof result.band_gap === 'number' ? `${result.band_gap.toFixed(2)} eV` : 'open'}
                  <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {visibleError && (
        <div className="pointer-events-auto w-[430px] max-w-full rounded-md border border-status-error/20 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {visibleError}
        </div>
      )}
    </div>
  )
}
