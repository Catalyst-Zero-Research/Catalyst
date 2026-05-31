import { useState } from "react"
import { 
  Settings, 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Download, 
  Maximize2, 
  Lock, 
  Unlock, 
  Loader2,
  Palette
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useStore } from "@/store/useStore"
import { api } from "@/lib/api"

export function GraphSettings() {
  const isSettingsOpen = useStore((state) => state.isSettingsOpen)
  const setSettingsOpen = useStore((state) => state.setSettingsOpen)
  const graphData = useStore((state) => state.graphData)
  const runSearch = useStore((state) => state.runSearch)
  const setSelectedNodeId = useStore((state) => state.setSelectedNodeId)
  const isLoading = useStore((state) => state.isLoading)
  const graphColorMode = useStore((state) => state.graphColorMode)
  const setGraphColorMode = useStore((state) => state.setGraphColorMode)

  // Accordion states
  const [sections, setSections] = useState<Record<string, boolean>>({
    filters: true,
    groups: true,
    display: false,
    forces: false,
  })

  // Search input state
  const [searchQuery, setSearchQuery] = useState("")

  // Physics lock state
  const [physicsLocked, setPhysicsLocked] = useState(false)

  const toggleSection = (key: string) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleExport = async () => {
    try {
      const materialIds = graphData.nodes
        .filter(n => n.type === 'material' || n.id.startsWith('mp-'))
        .map(n => n.id)
      
      if (materialIds.length === 0) return;

      const data = await api.exportSubgraph({ material_ids: materialIds, include_evidence: false })
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'subgraph.json'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (e) {
      console.error("Export failed", e)
    }
  }

  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) return
    const results = await runSearch(searchQuery)
    if (results.length > 0) {
      setSelectedNodeId(results[0].material_id || results[0].id)
    }
  }

  return (
    <div className="absolute top-3 right-3 z-30 flex flex-col items-end pointer-events-none select-none">
      {/* Floating Gear Button (On Canvas) */}
      <button
        onClick={() => setSettingsOpen(!isSettingsOpen)}
        className={cn(
          "w-8 h-8 rounded-md bg-surface-2/90 backdrop-blur border border-border-default text-text-tertiary hover:text-text-primary flex items-center justify-center pointer-events-auto transition shadow-md active:scale-95",
          isSettingsOpen && "bg-accent-muted text-accent border-accent/30"
        )}
        title="Graph Settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      {/* Obsidian-style Collapsible Graph Settings Menu */}
      {isSettingsOpen && (
        <div className="w-64 bg-surface-2/95 backdrop-blur border border-border-default rounded-lg shadow-2xl pointer-events-auto mt-2 flex flex-col max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar transition-all">
          <div className="p-3 border-b border-border-default flex items-center justify-between text-xs font-semibold text-text-primary">
            <span>Graph settings</span>
            <span className="text-[9px] text-text-tertiary font-mono">v1.0.0</span>
          </div>

          <div className="flex flex-col p-1.5 gap-1">
            {/* 1. FILTERS ACCORDION */}
            <div className="border-b border-border-subtle pb-1.5">
              <AccordionHeader 
                label="Filters" 
                isOpen={sections.filters} 
                onClick={() => toggleSection('filters')} 
              />
              {sections.filters && (
                <div className="px-2.5 py-1.5 flex flex-col gap-2.5 text-[11px] text-text-secondary">
                  {/* Search inside Graph Settings (Obsidian Graph style) */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-text-tertiary">Search nodes</label>
                    <div className="relative flex items-center">
                      <Search className="w-3 h-3 text-text-tertiary/60 absolute left-2" />
                      <input 
                        type="text"
                        placeholder="Search formulas (e.g. MnO2)..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
                        className="w-full bg-surface-0 border border-border-default rounded px-2 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-quaternary focus:outline-none focus:border-accent/40"
                      />
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin absolute right-2 text-text-tertiary/60" />
                      ) : (
                        <button 
                          onClick={handleSearchSubmit}
                          className="absolute right-2 text-[9px] font-mono text-accent hover:text-accent/80"
                        >
                          Go
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <span>Show orphan nodes</span>
                    <input type="checkbox" defaultChecked className="rounded border-border-default bg-surface-0 text-accent focus:ring-accent" />
                  </div>
                </div>
              )}
            </div>

            {/* 2. GROUPS & LEGEND ACCORDION */}
            <div className="border-b border-border-subtle pb-1.5">
              <AccordionHeader 
                label="Groups & Legend" 
                isOpen={sections.groups} 
                onClick={() => toggleSection('groups')} 
              />
              {sections.groups && (
                <div className="px-2.5 py-1.5 flex flex-col gap-3 text-[11px] text-text-secondary">
                  {/* Node Colors */}
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] text-text-tertiary mb-0.5">Node groups</div>
                    <LegendItem color="bg-node-material" label="Material" count={graphData.nodes.filter(n => n.type === 'material').length} />
                    <LegendItem color="bg-node-element" label="Element" count={graphData.nodes.filter(n => n.type === 'element').length} />
                    <LegendItem color="bg-node-cluster" label="Cluster" count={graphData.nodes.filter(n => n.type === 'cluster').length} />
                    <LegendItem color="bg-status-warning" label="External research" count={graphData.nodes.filter((n: any) => n.namespace === 'external_research').length} />
                  </div>

                  {/* Edge Types */}
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] text-text-tertiary mb-0.5">Edge relations</div>
                    <div className="flex items-center gap-2"><div className="w-5 border-t border-border-default/40"></div> <span className="truncate">Contains element</span></div>
                    <div className="flex items-center gap-2"><div className="w-5 border-t border-border-default/40 border-dashed"></div> <span className="truncate">Is composed of</span></div>
                    <div className="flex items-center gap-2"><div className="w-5 border-t border-border-subtle border-dotted"></div> <span className="truncate">Similar to</span></div>
                    <div className="flex items-center gap-2"><div className="w-5 border-t border-node-element border-dashed"></div> <span className="truncate">Substitutable</span></div>
                    <div className="flex items-center gap-2"><div className="w-5 border-t border-status-success"></div> <span className="truncate">Stabilizes</span></div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. DISPLAY & PROPERTIES ACCORDION */}
            <div className="border-b border-border-subtle pb-1.5">
              <AccordionHeader 
                label="Display & Properties" 
                isOpen={sections.display} 
                onClick={() => toggleSection('display')} 
              />
              {sections.display && (
                <div className="px-2.5 py-1.5 flex flex-col gap-3 text-[11px] text-text-secondary">
                  {/* Color mode */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
                      <Palette className="w-3 h-3" />
                      Color mode
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {(['type', 'stability', 'band_gap', 'element'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setGraphColorMode(mode)}
                          className={cn(
                            'py-1 px-2 rounded border text-[10px] transition capitalize',
                            graphColorMode === mode
                              ? 'bg-accent/15 border-accent/30 text-accent'
                              : 'border-border-default bg-surface-0 text-text-tertiary hover:bg-surface-1'
                          )}
                        >
                          {mode.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Show edge weights</span>
                    <input type="checkbox" className="rounded border-border-default bg-surface-0 text-accent focus:ring-accent" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Toggle node labels</span>
                    <input type="checkbox" defaultChecked className="rounded border-border-default bg-surface-0 text-accent focus:ring-accent" />
                  </div>
                </div>
              )}
            </div>

            {/* 4. FORCES & CONTROLS ACCORDION */}
            <div>
              <AccordionHeader 
                label="Forces & Controls" 
                isOpen={sections.forces} 
                onClick={() => toggleSection('forces')} 
              />
              {sections.forces && (
                <div className="px-2.5 py-1.5 flex flex-col gap-2.5 text-[11px] text-text-secondary">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-text-tertiary">Center Force</label>
                    <input type="range" min="0" max="100" defaultValue="40" className="w-full h-1 bg-surface-0 rounded-lg appearance-none cursor-pointer" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-text-tertiary">Repulsion Strength</label>
                    <input type="range" min="10" max="200" defaultValue="80" className="w-full h-1 bg-surface-0 rounded-lg appearance-none cursor-pointer" />
                  </div>

                  <div className="w-[1px] h-2"></div>
                  
                  {/* Canvas Control Action Buttons */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-border-subtle">
                    <button
                      onClick={() => setPhysicsLocked(!physicsLocked)}
                      className={cn(
                        "flex items-center justify-center gap-1 py-1 px-1.5 rounded border border-border-default bg-surface-0 hover:bg-surface-1 text-[10px] text-text-secondary hover:text-text-primary transition text-left",
                        physicsLocked && "border-status-warning/20 text-status-warning bg-status-warning/5 hover:bg-status-warning/10"
                      )}
                    >
                      {physicsLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      <span>{physicsLocked ? "Physics Locked" : "Lock Physics"}</span>
                    </button>
                    <button
                      onClick={handleExport}
                      className="flex items-center justify-center gap-1 py-1 px-1.5 rounded border border-border-default bg-surface-0 hover:bg-surface-1 text-[10px] text-text-secondary hover:text-text-primary transition text-left"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export Subgraph</span>
                    </button>
                    <button
                      className="col-span-2 flex items-center justify-center gap-1.5 py-1 px-2 rounded border border-border-default bg-surface-0 hover:bg-surface-1 text-[10px] text-text-secondary hover:text-text-primary transition"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Recenter Graph Canvas</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AccordionHeader({ label, isOpen, onClick }: { label: string; isOpen: boolean; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-1 px-2 py-1.5 hover:bg-surface-3 rounded text-left font-medium text-text-primary"
    >
      {isOpen ? <ChevronDown className="w-3 h-3 text-text-tertiary" /> : <ChevronRight className="w-3 h-3 text-text-tertiary" />}
      <span>{label}</span>
    </button>
  )
}

function LegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", color)} />
        <span className="text-text-secondary">{label}</span>
      </div>
      <span className="font-mono opacity-50 text-[10px]">{count}</span>
    </div>
  )
}
