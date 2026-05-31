// @ts-nocheck
import { useState } from "react"
import { 
  Folder, 
  FolderOpen, 
  Network, 
  Compass, 
  Database, 
  Settings, 
  Server, 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  Circle, 
  List, 
  Search,
  History,
  FlaskConical,
  Bot
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useStore } from "@/store/useStore"

export function Sidebar() {
  const isFileExplorerOpen = useStore((state) => state.isFileExplorerOpen)
  const setFileExplorerOpen = useStore((state) => state.setFileExplorerOpen)
  const graphData = useStore((state) => state.graphData)
  const selectedNodeId = useStore((state) => state.selectedNodeId)
  const setSelectedNodeId = useStore((state) => state.setSelectedNodeId)
  const apiAvailable = useStore((state) => state.apiAvailable)
  const isLoading = useStore((state) => state.isLoading)
  const setSettingsOpen = useStore((state) => state.setSettingsOpen)
  const isSettingsOpen = useStore((state) => state.isSettingsOpen)
  const setSessionPickerOpen = useStore((state) => state.setSessionPickerOpen)
  const isSessionPickerOpen = useStore((state) => state.isSessionPickerOpen)
  const setAgentOpen = useStore((state) => state.setAgentOpen)
  const isAgentOpen = useStore((state) => state.isAgentOpen)
  const setResearchOpen = useStore((state) => state.setResearchOpen)
  const isResearchOpen = useStore((state) => state.isResearchOpen)

  // Search in Explorer
  const [filterQuery, setFilterQuery] = useState("")

  // Folder collapse states
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    clusters: true,
    elements: false,
    unclustered: true,
  })

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Grouping nodes
  const nodes = graphData.nodes || []
  
  // Clusters
  const clusters = nodes.filter(n => n.type === "cluster")
  
  // Elements
  const elements = nodes.filter(n => n.type === "element")
  
  // Materials
  const materials = nodes.filter(n => n.type === "material")

  // Filter function
  const matchesFilter = (name: string, id: string) => {
    const q = filterQuery.toLowerCase()
    return name.toLowerCase().includes(q) || id.toLowerCase().includes(q)
  }

  return (
    <div className="h-full flex flex-shrink-0 z-20 relative select-none">
      {/* 1. Obsidian-style Ribbon (Far Left) */}
      <div className="w-12 h-full bg-surface-0 border-r border-border-default flex flex-col justify-between items-center py-3">
        <div className="flex flex-col items-center w-full gap-4">
          {/* File Explorer Toggle */}
          <button 
            onClick={() => setFileExplorerOpen(!isFileExplorerOpen)}
            className={cn(
              "w-8 h-8 rounded flex items-center justify-center transition-colors relative group",
              isFileExplorerOpen ? "text-text-primary bg-surface-2" : "text-text-tertiary hover:text-text-primary hover:bg-surface-1"
            )}
            title="Files"
          >
            {isFileExplorerOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
            <span className="absolute left-14 bg-surface-3 text-[10px] text-text-primary px-1.5 py-0.5 rounded border border-border-default opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
              Toggle Side Pane
            </span>
          </button>

          {/* Active View / Graph Icon */}
          <button 
            className="w-8 h-8 rounded flex items-center justify-center text-text-primary bg-surface-2 relative group"
            title="Graph view"
          >
            <Network className="w-4 h-4 text-node-element" />
            <span className="absolute left-14 bg-surface-3 text-[10px] text-text-primary px-1.5 py-0.5 rounded border border-border-default opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
              Graph View (Active)
            </span>
          </button>

          {/* Explore Icon */}
          <button 
            className="w-8 h-8 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-1 relative group"
            title="Discover"
          >
            <Compass className="w-4 h-4" />
          </button>

          {/* Database Icon */}
          <button 
            className="w-8 h-8 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-1 relative group"
            title="Datasets"
          >
            <Database className="w-4 h-4" />
          </button>
        </div>

        {/* Ribbon Footer */}
        <div className="flex flex-col items-center w-full gap-4">
          {/* Session picker */}
          <button
            onClick={() => setSessionPickerOpen(!isSessionPickerOpen)}
            className={cn(
              "w-8 h-8 rounded flex items-center justify-center transition-colors relative group",
              isSessionPickerOpen ? "text-accent bg-surface-2" : "text-text-tertiary hover:text-text-primary hover:bg-surface-1"
            )}
            title="Sessions"
          >
            <History className="w-4 h-4" />
          </button>

          {/* Research */}
          <button
            onClick={() => setResearchOpen(!isResearchOpen)}
            className={cn(
              "w-8 h-8 rounded flex items-center justify-center transition-colors relative group",
              isResearchOpen ? "text-status-info bg-surface-2" : "text-text-tertiary hover:text-text-primary hover:bg-surface-1"
            )}
            title="Research mode"
          >
            <FlaskConical className="w-4 h-4" />
          </button>

          {/* Agent */}
          <button
            onClick={() => setAgentOpen(!isAgentOpen)}
            className={cn(
              "w-8 h-8 rounded flex items-center justify-center transition-colors relative group",
              isAgentOpen ? "text-accent bg-surface-2" : "text-text-tertiary hover:text-text-primary hover:bg-surface-1"
            )}
            title="Open agent"
          >
            <Bot className="w-4 h-4" />
            {isAgentOpen && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />}
          </button>

          {/* API Status Indicator */}
          <div className="relative group cursor-pointer">
            <Server className={cn("w-4 h-4", apiAvailable ? "text-status-success" : "text-status-error animate-pulse")} />
            <span className="absolute left-14 bg-surface-3 text-[10px] text-text-primary px-2 py-1 rounded border border-border-default opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
              {apiAvailable ? "API Connected" : "API Offline"}
            </span>
          </div>

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(!isSettingsOpen)}
            className={cn(
              "w-8 h-8 rounded flex items-center justify-center transition-colors",
              isSettingsOpen ? "text-accent bg-surface-2" : "text-text-tertiary hover:text-text-primary hover:bg-surface-1"
            )}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Obsidian-style File Explorer Side Pane */}
      <div 
        className={cn(
          "h-full bg-surface-1 border-r border-border-default transition-all duration-200 overflow-hidden flex flex-col",
          isFileExplorerOpen ? "w-60" : "w-0 border-r-0"
        )}
      >
        <div className="p-3 border-b border-border-default flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-text-tertiary uppercase">Workspace Explorer</span>
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <button className="hover:text-text-primary" title="Collapse Folders"><List className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          {/* Search bar inside Sidebar Explorer */}
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-text-tertiary/65 absolute left-2 pointer-events-none" />
            <input 
              type="text"
              placeholder="Search materials..."
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              className="w-full bg-surface-0 border border-border-default rounded px-2 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-quaternary focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 text-xs text-text-secondary flex flex-col gap-1">
          {isLoading && nodes.length === 0 ? (
            <div className="text-text-tertiary/50 text-[11px] p-2 text-center">Loading workspace nodes...</div>
          ) : (
            <>
              {/* Folder: Clusters */}
              <div>
                <button 
                  onClick={() => toggleFolder('clusters')}
                  className="w-full flex items-center gap-1 py-1 px-1.5 hover:bg-surface-2 rounded text-text-secondary text-left font-medium"
                >
                  {expandedFolders.clusters ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="truncate text-text-primary font-medium">Clusters</span>
                  <span className="text-[9px] font-mono opacity-55 ml-auto">({clusters.length})</span>
                </button>
                {expandedFolders.clusters && (
                  <div className="pl-3 mt-0.5 border-l border-border-subtle ml-2 flex flex-col gap-0.5">
                    {clusters.map((cluster) => {
                      // Find materials in this cluster
                      const childMaterials = materials.filter(m => m.cluster === cluster.id)
                      const visibleChildren = childMaterials.filter(m => matchesFilter(m.name || "", m.id))
                      
                      return (
                        <div key={cluster.id}>
                          <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-surface-2 rounded text-text-secondary cursor-pointer">
                            <span className="w-1.5 h-1.5 rounded-full bg-node-cluster" />
                            <span className="truncate" title={cluster.name || cluster.id}>{cluster.name || cluster.id}</span>
                            <span className="text-[9px] font-mono opacity-40 ml-auto">({childMaterials.length})</span>
                          </div>
                          
                          {/* List materials inside this cluster folder */}
                          <div className="pl-3 border-l border-border-subtle ml-2 flex flex-col gap-0.5">
                            {visibleChildren.map((material) => (
                              <button
                                key={material.id}
                                onClick={() => setSelectedNodeId(material.id)}
                                className={cn(
                                  "w-full flex items-center gap-1.5 py-1 px-2 hover:bg-surface-2 rounded text-left truncate transition-colors",
                                  selectedNodeId === material.id ? "bg-accent-muted text-accent font-medium border-l-2 border-accent rounded-l-none" : "text-text-secondary"
                                )}
                              >
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{material.name || material.id}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Folder: Unclustered Materials */}
              <div>
                <button 
                  onClick={() => toggleFolder('unclustered')}
                  className="w-full flex items-center gap-1 py-1 px-1.5 hover:bg-surface-2 rounded text-text-secondary text-left font-medium"
                >
                  {expandedFolders.unclustered ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="truncate text-text-primary font-medium">Materials (Unclustered)</span>
                  <span className="text-[9px] font-mono opacity-55 ml-auto">
                    ({materials.filter(m => !m.cluster).length})
                  </span>
                </button>
                {expandedFolders.unclustered && (
                  <div className="pl-3 mt-0.5 border-l border-border-subtle ml-2 flex flex-col gap-0.5">
                    {materials
                      .filter(m => !m.cluster && matchesFilter(m.name || "", m.id))
                      .map((material) => (
                        <button
                          key={material.id}
                          onClick={() => setSelectedNodeId(material.id)}
                          className={cn(
                            "w-full flex items-center gap-1.5 py-1 px-2 hover:bg-surface-2 rounded text-left truncate transition-colors",
                            selectedNodeId === material.id ? "bg-accent-muted text-accent font-medium border-l-2 border-accent rounded-l-none" : "text-text-secondary"
                          )}
                        >
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{material.name || material.id}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Folder: Elements */}
              <div>
                <button 
                  onClick={() => toggleFolder('elements')}
                  className="w-full flex items-center gap-1 py-1 px-1.5 hover:bg-surface-2 rounded text-text-secondary text-left font-medium"
                >
                  {expandedFolders.elements ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="truncate text-text-primary font-medium">Elements</span>
                  <span className="text-[9px] font-mono opacity-55 ml-auto">({elements.length})</span>
                </button>
                {expandedFolders.elements && (
                  <div className="pl-3 mt-0.5 border-l border-border-subtle ml-2 flex flex-col gap-0.5">
                    {elements
                      .filter(element => matchesFilter(element.name || "", element.id))
                      .map((element) => (
                        <button
                          key={element.id}
                          onClick={() => setSelectedNodeId(element.id)}
                          className={cn(
                            "w-full flex items-center gap-1.5 py-1 px-2 hover:bg-surface-2 rounded text-left truncate transition-colors",
                            selectedNodeId === element.id ? "bg-accent-muted text-accent font-medium border-l-2 border-accent rounded-l-none" : "text-text-secondary"
                          )}
                        >
                          <Circle className="w-1.5 h-1.5 text-node-element fill-node-element flex-shrink-0" />
                          <span className="truncate">{element.name || element.id}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Obsidian Pane Collapse Trigger Line */}
      {isFileExplorerOpen && (
        <div 
          onClick={() => setFileExplorerOpen(false)}
          className="absolute right-0 top-0 bottom-0 w-0.5 hover:w-1 bg-transparent hover:bg-accent/40 cursor-col-resize transition-all z-30"
          title="Collapse Panel"
        />
      )}
    </div>
  )
}
