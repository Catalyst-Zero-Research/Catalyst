// @ts-nocheck
import { Database, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/useStore'

export function StatusBar() {
  const graphData = useStore((state) => state.graphData)
  const apiAvailable = useStore((state) => state.apiAvailable)
  const isLoading = useStore((state) => state.isLoading)
  const error = useStore((state) => state.error)
  const selectedMaterialData = useStore((state) => state.selectedMaterialData)
  const health = useStore((state) => state.health)
  const catalog = useStore((state) => state.catalog)
  const providerStatus = useStore((state) => state.providerStatus)
  const isOffline = useStore((state) => state.isOffline)
  const initializeGraph = useStore((state) => state.initializeGraph)

  const visibleError = selectedMaterialData ? null : error
  const status = visibleError ? visibleError : isLoading ? 'Working…' : 'Ready'
  const materialLabel = selectedMaterialData?.summary?.formula_pretty || selectedMaterialData?.material_id

  const catalogMaterials = catalog?.counts?.materials
  const backendLabel = health?.backend || (apiAvailable ? 'local-files-duckdb' : 'Offline')

  return (
    <div className="h-7 w-full border-t border-border-default bg-surface-0 flex items-center justify-between px-4 text-[10px] text-text-tertiary flex-shrink-0 z-20 select-none">
      {/* Left: connection + backend info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          {isOffline ? (
            <WifiOff className="w-3 h-3 text-status-error" />
          ) : (
            <Database className={apiAvailable ? 'w-3 h-3 text-status-success' : 'w-3 h-3 text-status-error'} />
          )}
          <span className={isOffline ? 'text-status-error' : undefined}>
            {isOffline ? 'Backend offline' : `${backendLabel}`}
          </span>
          {isOffline && (
            <button
              onClick={initializeGraph}
              className="ml-1 text-status-info hover:text-accent flex items-center gap-0.5"
              title="Retry connection"
            >
              <RefreshCw className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {catalogMaterials !== undefined && (
          <span className="font-mono text-text-quaternary">
            {catalogMaterials.toLocaleString()} materials
          </span>
        )}

        {catalog?.counts?.material_material_edges !== undefined && (
          <span className="font-mono text-text-quaternary hidden lg:inline">
            {catalog.counts.material_material_edges.toLocaleString()} edges
          </span>
        )}

        <span className="font-mono text-text-quaternary hidden xl:inline">
          {graphData.nodes.length} nodes / {graphData.links.length} links in view
        </span>
      </div>

      {/* Center: status */}
      <div className="flex items-center gap-1.5">
        <Clock className={cn('w-2.5 h-2.5', isLoading ? 'animate-pulse text-accent' : '')} />
        <span className={visibleError ? 'text-status-error' : undefined}>{status}</span>
      </div>

      {/* Right: selected + version */}
      <div className="flex items-center gap-4">
        {providerStatus && (
          <span className={cn(
            'hidden md:inline',
            providerStatus.llm_configured ? 'text-status-success' : 'text-text-quaternary'
          )}>
            {providerStatus.llm_configured
              ? `LLM: ${providerStatus.active_provider || 'configured'}`
              : 'LLM: not configured'}
          </span>
        )}
        <span>{materialLabel ? `${materialLabel}` : 'Catalyst workspace'}</span>
        {health?.version && (
          <span className="hidden lg:inline text-text-quaternary">v{health.version}</span>
        )}
      </div>
    </div>
  )
}
