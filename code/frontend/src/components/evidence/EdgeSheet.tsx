// ── EdgeSheet: edge/relation inspection, right sheet ─────────────────────────
import { X, Loader2 } from 'lucide-react'
import { useCatalystWorkspace, useCatalystLayout } from '@/catalyst/bridge/hooks'

export function EdgeSheet() {
  const { edgeDetail, edgeLoading } = useCatalystWorkspace()
  const { activeSheet, closeSheet } = useCatalystLayout()

  if (activeSheet !== 'edge') return null

  return (
    <div className="absolute top-0 bottom-0 right-0 z-40 flex flex-col animate-slide-right shadow-2xl"
      style={{ width: 360, maxWidth: 'calc(100vw - 56px)', background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>

      <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Relation detail</span>
        <button onClick={closeSheet}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
          style={{ color: 'var(--text-3)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 flex flex-col gap-4">
        {edgeLoading && (
          <div className="flex items-center justify-center h-20 gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading relation…
          </div>
        )}

        {!edgeLoading && !edgeDetail && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-3)' }}>
            No relation data available.
          </p>
        )}

        {edgeDetail && (
          <>
            <Row label="Edge ID"     value={edgeDetail.edgeId}         mono />
            <Row label="Type"        value={edgeDetail.type || '—'}    />
            <Row label="Source"      value={edgeDetail.source}         mono />
            <Row label="Target"      value={edgeDetail.target}         mono />
            {edgeDetail.recipe    && <Row label="Recipe"     value={edgeDetail.recipe}    />}
            {edgeDetail.weight    !== undefined && <Row label="Weight"  value={edgeDetail.weight!.toFixed(4)} mono />}
            {edgeDetail.confidence !== undefined && <Row label="Confidence" value={edgeDetail.confidence!.toFixed(4)} mono />}
            {edgeDetail.reasonSummary && (
              <div>
                <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-4)' }}>Reason summary</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{edgeDetail.reasonSummary}</p>
              </div>
            )}
            {edgeDetail.featureDeltas && (
              <div>
                <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-4)' }}>Feature deltas</p>
                <pre className="text-[11px] rounded-lg p-3 overflow-x-auto scrollbar-thin font-mono"
                  style={{ background: 'var(--surface-1)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {JSON.stringify(edgeDetail.featureDeltas, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4 text-xs">
      <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      <span className="text-right truncate" style={{ color: 'var(--text-1)', fontFamily: mono ? 'monospace' : undefined }}>
        {value}
      </span>
    </div>
  )
}
