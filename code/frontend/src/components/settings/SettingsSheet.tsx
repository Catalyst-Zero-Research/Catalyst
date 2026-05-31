// ── SettingsSheet ─────────────────────────────────────────────────────────────
import { X, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useCatalystSettings, useCatalystStatus, useCatalystLayout } from '@/catalyst/bridge/hooks'

export function SettingsSheet() {
  const { status, catalog, provider } = useCatalystSettings()
  const { activeSheet, closeSheet }                 = useCatalystLayout()
  const { isOffline }                               = useCatalystStatus()

  if (activeSheet !== 'settings') return null

  return (
    <div className="absolute top-0 bottom-0 right-0 z-40 flex flex-col animate-slide-right shadow-2xl"
      style={{ width: 380, maxWidth: 'calc(100vw - 56px)', background: 'var(--surface-2)', borderLeft: '1px solid var(--border)' }}>

      <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Settings</span>
        <button onClick={closeSheet}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:bg-[var(--surface-3)]"
          style={{ color: 'var(--text-3)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 flex flex-col gap-6">

        {/* Backend status */}
        <Section title="Backend">
          <Row label="Status"  value={isOffline ? 'Offline' : 'Online'} color={isOffline ? 'var(--danger)' : 'var(--success)'} />
          <Row label="Label"   value={status.backendLabel} />
          {status.version && <Row label="Version" value={status.version} mono />}
        </Section>

        {/* Catalog */}
        {catalog && (
          <Section title="Catalog">
            <Row label="Materials"     value={catalog.materials.toLocaleString()} mono />
            <Row label="Evidence rows" value={catalog.evidenceRows.toLocaleString()} mono />
            <Row label="Clusters"      value={catalog.clusters.toLocaleString()} mono />
            {catalog.sourceRelease && <Row label="Release" value={catalog.sourceRelease} mono />}
          </Section>
        )}

        {/* Provider */}
        <Section title="AI provider">
          <Row label="LLM configured"
            value={provider.llmConfigured ? 'Yes' : 'No'}
            color={provider.llmConfigured ? 'var(--success)' : 'var(--warning)'} />
          {provider.activeProvider && <Row label="Active provider" value={provider.activeProvider} />}
        </Section>

        {/* Research sources */}
        {Object.keys(status.provider.researchSources).length > 0 && (
          <Section title="Research sources">
            {Object.entries(status.provider.researchSources).map(([key, st]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-3)' }}>{key}</span>
                <SourceBadge status={st as string} />
              </div>
            ))}
          </Section>
        )}

        {/* API keys note */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs"
          style={{ background: 'rgba(143,188,255,0.06)', borderColor: 'rgba(143,188,255,0.15)', color: 'var(--text-3)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
          Configure API keys via environment variables or the backend config file. Keys are never stored in this UI.
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-4)' }}>{title}</p>
      <div className="flex flex-col gap-2 text-xs">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ color: color || 'var(--text-1)', fontFamily: mono ? 'monospace' : undefined }}>
        {value}
      </span>
    </div>
  )
}

function SourceBadge({ status }: { status: string }) {
  if (status === 'available')   return <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}><CheckCircle className="w-3 h-3" />Available</span>
  if (status === 'missing_key') return <span className="flex items-center gap-1" style={{ color: 'var(--warning)' }}><AlertCircle className="w-3 h-3" />Missing key</span>
  return <span className="flex items-center gap-1" style={{ color: 'var(--text-4)' }}><XCircle className="w-3 h-3" />Disabled</span>
}
