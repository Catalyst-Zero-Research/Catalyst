// @ts-nocheck
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Settings, Key, Cpu, FlaskConical, CheckCircle,
  AlertCircle, XCircle, RefreshCw, Save, ChevronDown, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

const STATUS_ICON: Record<string, React.ReactNode> = {
  available: <CheckCircle className="w-3.5 h-3.5 text-status-success" />,
  missing_key: <Key className="w-3.5 h-3.5 text-status-warning" />,
  disabled: <XCircle className="w-3.5 h-3.5 text-status-error" />,
  not_configured: <AlertCircle className="w-3.5 h-3.5 text-text-quaternary" />,
}
const STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  missing_key: 'API key missing',
  disabled: 'Disabled',
  not_configured: 'Not configured',
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border-default rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-0 hover:bg-surface-1 transition text-left"
      >
        <span className="text-sm font-medium text-text-primary">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-text-tertiary" /> : <ChevronRight className="w-4 h-4 text-text-tertiary" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 bg-surface-1 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  )
}

function SourceRow({ name, status }: { name: string; status: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-text-secondary capitalize">{name.replace(/_/g, ' ')}</span>
      <div className="flex items-center gap-1.5">
        {STATUS_ICON[status] || STATUS_ICON.not_configured}
        <span className={cn(
          'text-xs',
          status === 'available' ? 'text-status-success' :
          status === 'missing_key' ? 'text-status-warning' :
          status === 'disabled' ? 'text-text-quaternary' : 'text-text-quaternary'
        )}>
          {STATUS_LABEL[status] || status}
        </span>
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const isSettingsOpen = useStore((s) => s.isSettingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const settings = useStore((s) => s.settings)
  const providerStatus = useStore((s) => s.providerStatus)
  const catalog = useStore((s) => s.catalog)
  const loadSettings = useStore((s) => s.loadSettings)
  const updateSettings = useStore((s) => s.updateSettings)
  const health = useStore((s) => s.health)

  const [researchEnabled, setResearchEnabled] = useState(settings?.research?.enabled ?? false)
  const [restoreSession, setRestoreSession] = useState(settings?.sessions?.restore_last_session ?? true)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (isSettingsOpen) loadSettings()
  }, [isSettingsOpen])

  useEffect(() => {
    if (settings) {
      setResearchEnabled(settings.research?.enabled ?? false)
      setRestoreSession(settings.sessions?.restore_last_session ?? true)
    }
  }, [settings])

  const handleSave = async () => {
    await updateSettings({
      research: { enabled: researchEnabled },
      sessions: { restore_last_session: restoreSession },
    })
    setDirty(false)
  }

  const researchSources = catalog?.provider_status?.literature_sources || settings?.research_sources || {}
  const litSources = Object.entries(researchSources)

  return (
    <AnimatePresence>
      {isSettingsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-base/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-[560px] max-h-[85vh] bg-surface-1 border border-border-default rounded-2xl flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-5 border-b border-border-default flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Settings className="w-4.5 h-4.5 text-accent" />
                <span className="text-sm font-semibold text-text-primary">Settings</span>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-2 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-4">
              {/* Backend status */}
              <Section title="Backend Status">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">API</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
                      <span className="text-xs text-status-success">{health?.backend || 'local-files-duckdb'}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Version</span>
                    <span className="text-xs font-mono text-text-tertiary">{health?.version || '—'}</span>
                  </div>
                  {catalog && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">Materials</span>
                        <span className="text-xs font-mono text-text-tertiary">{catalog.counts?.materials?.toLocaleString() || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">Edges</span>
                        <span className="text-xs font-mono text-text-tertiary">{catalog.counts?.material_material_edges?.toLocaleString() || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">Evidence rows</span>
                        <span className="text-xs font-mono text-text-tertiary">{catalog.counts?.evidence_rows?.toLocaleString() || '—'}</span>
                      </div>
                    </>
                  )}
                </div>
              </Section>

              {/* LLM provider */}
              <Section title="LLM Provider">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Status</span>
                    <div className="flex items-center gap-1.5">
                      {providerStatus?.llm_configured
                        ? <CheckCircle className="w-3.5 h-3.5 text-status-success" />
                        : <AlertCircle className="w-3.5 h-3.5 text-status-warning" />}
                      <span className={cn('text-xs', providerStatus?.llm_configured ? 'text-status-success' : 'text-status-warning')}>
                        {providerStatus?.llm_configured ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                  </div>
                  {providerStatus?.active_provider && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary">Active provider</span>
                      <span className="text-xs font-mono text-text-primary capitalize">{providerStatus.active_provider}</span>
                    </div>
                  )}
                  <div className="mt-2 p-3 rounded-lg bg-surface-0 border border-border-subtle text-[11px] text-text-tertiary leading-relaxed">
                    <Cpu className="w-3.5 h-3.5 inline mr-1.5 text-text-quaternary" />
                    API keys are read from environment variables. Set <span className="font-mono text-text-secondary">GEMINI_API_KEY</span>, <span className="font-mono text-text-secondary">GROQ_API_KEY</span>, or others before starting the backend.
                  </div>
                </div>
              </Section>

              {/* Research mode */}
              <Section title="Research Mode" defaultOpen={false}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-text-primary">Enable research mode</div>
                      <div className="text-[11px] text-text-tertiary mt-0.5">Search external literature sources</div>
                    </div>
                    <button
                      onClick={() => { setResearchEnabled(!researchEnabled); setDirty(true) }}
                      className={cn(
                        'w-10 h-6 rounded-full transition-colors relative',
                        researchEnabled ? 'bg-accent' : 'bg-surface-0 border border-border-default'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                        researchEnabled ? 'translate-x-4.5 left-0.5' : 'translate-x-0 left-0.5'
                      )} />
                    </button>
                  </div>

                  {litSources.length > 0 && (
                    <div className="border-t border-border-subtle pt-3">
                      <div className="text-[11px] uppercase tracking-wider text-text-quaternary mb-2">Literature sources</div>
                      {litSources.map(([name, status]) => (
                        <SourceRow key={name} name={name} status={status as string} />
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              {/* Session restore */}
              <Section title="Session Behavior" defaultOpen={false}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-text-primary">Restore last session</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">Auto-restore workspace on startup</div>
                  </div>
                  <button
                    onClick={() => { setRestoreSession(!restoreSession); setDirty(true) }}
                    className={cn(
                      'w-10 h-6 rounded-full transition-colors relative',
                      restoreSession ? 'bg-accent' : 'bg-surface-0 border border-border-default'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                      restoreSession ? 'translate-x-4.5 left-0.5' : 'translate-x-0 left-0.5'
                    )} />
                  </button>
                </div>
              </Section>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border-default flex items-center justify-between flex-shrink-0">
              <button
                onClick={loadSettings}
                className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload
              </button>
              {dirty && (
                <button
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save settings
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
