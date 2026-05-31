// ── ResearchSheet ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import { X, Loader2, FlaskConical, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { useCatalystResearch, useCatalystLayout } from '@/catalyst/bridge/hooks'

export function ResearchSheet() {
  const { research, isLoading, runResearch } = useCatalystResearch()
  const { activeSheet, closeSheet }           = useCatalystLayout()
  const [query, setQuery]                     = useState('')
  const [running, setRunning]                 = useState(false)

  if (activeSheet !== 'research') return null

  async function handleRun() {
    if (!query.trim() || running) return
    setRunning(true)
    await runResearch(query)
    setQuery('')
    setRunning(false)
  }

  return (
    <div className="absolute top-0 bottom-0 right-0 z-40 flex flex-col animate-slide-right shadow-2xl"
      style={{ width: 380, maxWidth: 'calc(100vw - 56px)', background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>

      <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4" style={{ color: 'var(--info)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Research</span>
        </div>
        <button onClick={closeSheet}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
          style={{ color: 'var(--text-3)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 flex flex-col gap-5">
        {isLoading && !research && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading research status…
          </div>
        )}

        {research && (
          <>
            {/* Availability */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-4)' }}>
                Source availability
              </p>
              <div className="flex flex-col gap-1.5">
                {research.sources.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border"
                    style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{s.label}</span>
                    <StatusIcon status={s.status} />
                  </div>
                ))}
              </div>
            </div>

            {/* Missing keys */}
            {research.missingKeys.length > 0 && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs"
                style={{ background: 'rgba(240,195,106,0.06)', borderColor: 'rgba(240,195,106,0.2)', color: 'var(--warning)' }}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Missing API keys: {research.missingKeys.join(', ')}. Configure in Settings.</span>
              </div>
            )}

            {/* Query form */}
            {research.isEnabled && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-4)' }}>
                  Research query
                </p>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Find recent papers on MnO2 battery cathodes"
                  rows={3}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none scrollbar-thin placeholder:text-[var(--text-4)]"
                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
                <button
                  onClick={handleRun}
                  disabled={!query.trim() || running}
                  className="mt-2 w-full h-9 rounded-xl text-sm font-medium transition active:scale-95 disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Run research query'}
                </button>
              </div>
            )}

            {!research.isEnabled && (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                No research sources available. Add API keys in Settings.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'available')     return <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
  if (status === 'missing_key')   return <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
  return <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--text-4)' }} />
}
