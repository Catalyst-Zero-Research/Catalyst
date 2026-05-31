import {
  ChevronDown,
  ChevronRight,
  Maximize2,
  RotateCcw,
  Search,
  Settings,
  Plus,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useCatalystGraph, useCatalystLayout } from '@/catalyst/bridge/hooks'
import type { GraphSettingsVM, GraphGroupVM } from '@/catalyst/bridge/viewModels'

type Section = 'filters' | 'groups' | 'display' | 'forces'

const DEFAULT_GROUP_COLORS = [
  '#f0a36f', '#c5a3ff', '#8fbcff', '#7acb8f', '#f0c36a', '#ee7b7b'
]

export function GraphControls() {
  const {
    graphSettings,
    colorMode,
    setColorMode,
    setGraphSettings,
    resetGraphSettings,
  } = useCatalystGraph()
  const { graphControlsOpen, setGraphControlsOpen } = useCatalystLayout()
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    filters: true,
    groups: true,
    display: true,
    forces: false,
  })

  const patch = (next: Partial<GraphSettingsVM>) => setGraphSettings(next)
  const toggleSection = (section: Section) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }
  const recenter = () => window.dispatchEvent(new CustomEvent('catalyst:graph-recenter'))
  
  const addGroup = () => {
     const newGroup: GraphGroupVM = {
        id: `group-${Date.now()}`,
        name: `Group ${(graphSettings.groups || []).length + 1}`,
        query: '',
        color: DEFAULT_GROUP_COLORS[(graphSettings.groups || []).length % DEFAULT_GROUP_COLORS.length]
     };
     patch({ groups: [...(graphSettings.groups || []), newGroup] });
  };
  
  const updateGroup = (id: string, updates: Partial<GraphGroupVM>) => {
     patch({
        groups: (graphSettings.groups || []).map(g => g.id === id ? { ...g, ...updates } : g)
     });
  };
  
  const removeGroup = (id: string) => {
     patch({
        groups: (graphSettings.groups || []).filter(g => g.id !== id)
     });
  };

  return (
    <div className="absolute right-4 top-4 z-30 flex flex-col items-end gap-2 pointer-events-none">
      <button
        onClick={() => setGraphControlsOpen(!graphControlsOpen)}
        className={cn(
          'pointer-events-auto flex h-9 items-center justify-center rounded-lg border transition active:scale-[0.98]',
          graphControlsOpen
            ? 'w-9 border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent)]'
            : 'w-9 border-[var(--border)] bg-[var(--bg)] text-[var(--text-2)] hover:text-[var(--text-1)]',
        )}
        title="Graph settings"
      >
        <Settings className="h-4 w-4" />
      </button>

      {graphControlsOpen && (
        <div
          className="pointer-events-auto w-[240px] overflow-hidden rounded-lg border animate-slide-right"
          style={{
            background: 'var(--surface-1)',
            borderColor: 'var(--border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div className="flex h-10 items-center justify-between border-b px-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Graph settings
            </div>
            <button
              onClick={resetGraphSettings}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] transition hover:bg-[var(--surface-2)]"
              style={{ color: 'var(--text-3)' }}
              title="Restore defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="no-scrollbar max-h-[calc(100vh-112px)] overflow-y-auto">
            <SectionBlock label="Filters" open={openSections.filters} onClick={() => toggleSection('filters')}>
              <div className="space-y-3 px-3 pb-3">
                <label className="block">
                  <div className="relative mt-1">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--text-4)' }} />
                    <input
                      value={graphSettings.search || ''}
                      onChange={(event) => patch({ search: event.target.value })}
                      placeholder="Search graph..."
                      className="h-7 w-full rounded-md border bg-[var(--bg)] pl-7 pr-2 text-xs outline-none transition focus:border-[var(--accent)]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                    />
                  </div>
                </label>
                <ToggleRow label="Clusters" checked={graphSettings.showClusters} onChange={(showClusters) => patch({ showClusters })} />
                <ToggleRow label="Materials" checked={graphSettings.showMaterials} onChange={(showMaterials) => patch({ showMaterials })} />
                <ToggleRow label="Elements" checked={graphSettings.showElements} onChange={(showElements) => patch({ showElements })} />
                <ToggleRow label="Orphans" checked={graphSettings.showOrphans ?? true} onChange={(showOrphans) => patch({ showOrphans })} />
                <RangeRow label="Local depth" min={1} max={5} step={1} value={graphSettings.localDepth ?? 1} onChange={(localDepth) => patch({ localDepth })} />
              </div>
            </SectionBlock>

            <SectionBlock label="Groups" open={openSections.groups} onClick={() => toggleSection('groups')}>
              <div className="space-y-2 px-3 pb-3">
                {(graphSettings.groups || []).map(group => (
                  <div key={group.id} className="flex flex-col gap-1.5 rounded-md border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                    <div className="flex items-center gap-2">
                       <input 
                         type="color" 
                         value={group.color}
                         onChange={(e) => updateGroup(group.id, { color: e.target.value })}
                         className="h-5 w-5 rounded cursor-pointer border-none p-0 bg-transparent"
                       />
                       <input
                         value={group.query}
                         onChange={(e) => updateGroup(group.id, { query: e.target.value })}
                         placeholder="query (e.g. type:cluster)"
                         className="flex-1 h-6 text-xs bg-transparent border-b outline-none focus:border-[var(--accent)]"
                         style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                       />
                       <button onClick={() => removeGroup(group.id)} className="text-[var(--text-3)] hover:text-[var(--danger)]">
                          <Trash2 className="h-3.5 w-3.5" />
                       </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addGroup}
                  className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-[11px] transition hover:bg-[var(--surface-2)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                >
                  <Plus className="h-3 w-3" />
                  New group
                </button>
              </div>
            </SectionBlock>

            <SectionBlock label="Display" open={openSections.display} onClick={() => toggleSection('display')}>
              <div className="space-y-3 px-3 pb-3">
                <div className="grid grid-cols-2 gap-1 rounded-md border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  {[
                    ['type', 'Type'],
                    ['stability', 'Stability'],
                    ['band_gap', 'Band gap'],
                    ['element', 'Element'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setColorMode(mode as typeof colorMode)}
                      className="h-6 rounded text-[10px] transition"
                      style={{
                        background: colorMode === mode ? 'var(--accent-muted)' : 'transparent',
                        color: colorMode === mode ? 'var(--accent)' : 'var(--text-3)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <ToggleRow label="Arrows" checked={graphSettings.showArrows} onChange={(showArrows) => patch({ showArrows })} />
                <ToggleRow label="Labels" checked={graphSettings.showLabels} onChange={(showLabels) => patch({ showLabels })} />
                <ToggleRow label="Edge labels" checked={graphSettings.showEdgeLabels} onChange={(showEdgeLabels) => patch({ showEdgeLabels })} />
                <div className="flex flex-col gap-1 rounded-md border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <span className="px-1 py-0.5 text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-4)' }}>Motion</span>
                  <div className="grid grid-cols-3 gap-1">
                    {['still', 'subtle', 'active'].map((m) => (
                      <button
                        key={m}
                        onClick={() => patch({ motion: m as 'still'|'subtle'|'active' })}
                        className="h-6 rounded text-[10px] transition capitalize"
                        style={{
                          background: graphSettings.motion === m ? 'var(--accent-muted)' : 'transparent',
                          color: graphSettings.motion === m ? 'var(--accent)' : 'var(--text-3)',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1 rounded-md border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <span className="px-1 py-0.5 text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--text-4)' }}>Edge Density</span>
                  <div className="grid grid-cols-3 gap-1">
                    {['sparse', 'normal', 'dense'].map((m) => (
                      <button
                        key={m}
                        onClick={() => patch({ edgeDensity: m as 'sparse'|'normal'|'dense' })}
                        className="h-6 rounded text-[10px] transition capitalize"
                        style={{
                          background: graphSettings.edgeDensity === m ? 'var(--accent-muted)' : 'transparent',
                          color: graphSettings.edgeDensity === m ? 'var(--accent)' : 'var(--text-3)',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <RangeRow label="Text fade" min={0.6} max={2.8} step={0.05} value={graphSettings.textFadeThreshold} onChange={(textFadeThreshold) => patch({ textFadeThreshold })} />
                <RangeRow label="Node size" min={0.7} max={1.8} step={0.05} value={graphSettings.nodeSize} onChange={(nodeSize) => patch({ nodeSize })} />
                <RangeRow label="Link thickness" min={0.5} max={2.2} step={0.05} value={graphSettings.linkThickness} onChange={(linkThickness) => patch({ linkThickness })} />
              </div>
            </SectionBlock>

            <SectionBlock label="Forces" open={openSections.forces} onClick={() => toggleSection('forces')}>
              <div className="space-y-3 px-3 pb-3">
                <RangeRow label="Collision padding" min={0} max={20} step={1} value={graphSettings.collisionPadding} onChange={(collisionPadding) => patch({ collisionPadding })} />
                <RangeRow label="Collision strength" min={0} max={1} step={0.01} value={graphSettings.collisionStrength} onChange={(collisionStrength) => patch({ collisionStrength })} />
                <RangeRow label="Charge dist max" min={50} max={800} step={5} value={graphSettings.chargeDistanceMax} onChange={(chargeDistanceMax) => patch({ chargeDistanceMax })} />
                <RangeRow label="Local repel boost" min={1} max={5} step={0.1} value={graphSettings.localRepelBoost} onChange={(localRepelBoost) => patch({ localRepelBoost })} />
                <RangeRow label="Cluster spread" min={1} max={3} step={0.05} value={graphSettings.clusterSpread} onChange={(clusterSpread) => patch({ clusterSpread })} />
                <RangeRow label="Center force" min={0.05} max={1.5} step={0.01} value={graphSettings.centerForce} onChange={(centerForce) => patch({ centerForce })} />
                <RangeRow label="Repel force" min={15} max={180} step={1} value={graphSettings.repelForce} onChange={(repelForce) => patch({ repelForce })} />
                <RangeRow label="Link force" min={0.05} max={1.8} step={0.01} value={graphSettings.linkForce} onChange={(linkForce) => patch({ linkForce })} />
                <RangeRow label="Link distance" min={18} max={110} step={1} value={graphSettings.linkDistance} onChange={(linkDistance) => patch({ linkDistance })} />
                <button
                  onClick={recenter}
                  className="flex h-7 w-full items-center justify-center gap-2 rounded-md border text-xs transition hover:bg-[var(--surface-2)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                >
                  <Maximize2 className="h-3 w-3" />
                  Recenter
                </button>
              </div>
            </SectionBlock>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionBlock({ label, open, onClick, children }: { label: string; open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider transition hover:bg-[var(--surface-2)]"
        style={{ color: 'var(--text-2)' }}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 rounded border bg-[var(--surface-2)] accent-[var(--accent)]"
      />
    </label>
  )
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-xs" style={{ color: 'var(--text-2)' }}>
      <span className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-4)' }}>{Number(value).toFixed(step < 1 ? 2 : 0)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-full rounded-full appearance-none bg-[var(--surface-3)] accent-[var(--accent)]"
      />
    </label>
  )
}
