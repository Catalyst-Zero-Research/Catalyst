import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forceX, forceY, forceCollide, forceManyBody } from 'd3-force'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useCatalystGraph, useCatalystLayout, useCatalystStatus, useCommandExecutor, useCatalystCandidates } from '@/catalyst/bridge/hooks'
import type { GraphEdgeVM, GraphNodeVM, GraphGroupVM, GraphSettingsVM } from '@/catalyst/bridge/viewModels'

type RenderNode = GraphNodeVM & {
  x?: number
  y?: number
  val?: number
}

type RenderLink = Omit<GraphEdgeVM, 'source' | 'target'> & {
  source: string | RenderNode
  target: string | RenderNode
}

type ForceNode = NodeObject<RenderNode>
type ForceLink = LinkObject<RenderNode, RenderLink>
type GraphMethods = ForceGraphMethods<ForceNode, ForceLink>
type GraphCanvasProps = {
  graphOverride?: {
    nodes: GraphNodeVM[]
    edges: GraphEdgeVM[]
    selectedNodeId?: string | null
  }
}

function idOf(value: unknown): string {
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: string }).id)
  return String(value)
}

function nodeMatches(node: GraphNodeVM, search: string): boolean {
  if (!search.trim()) return true
  const haystack = [
    node.id,
    node.name,
    node.formula_pretty,
    node.chemsys,
    node.representative_material_id,
    node.elements?.join(' '),
  ].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(search.trim().toLowerCase())
}

function matchesGroup(node: GraphNodeVM, query: string): boolean {
  if (!query.trim()) return false;
  const q = query.trim().toLowerCase();
  
  if (q.startsWith('type:')) {
    return node.type === q.split(':')[1];
  }
  if (q.startsWith('stable:')) {
    const val = q.split(':')[1] === 'true';
    return node.is_stable === val;
  }
  if (q.startsWith('metal:')) {
    const val = q.split(':')[1] === 'true';
    return node.is_metal === val;
  }
  if (q.startsWith('chemsys:')) {
    return (node.chemsys || '').toLowerCase().includes(q.split(':')[1]);
  }
  if (q.startsWith('element:')) {
    return (node.elements || []).map(e => e.toLowerCase()).includes(q.split(':')[1]);
  }
  if (q.startsWith('namespace:')) {
    return (node.namespace || '').toLowerCase() === q.split(':')[1];
  }
  if (q.startsWith('band_gap:>')) {
    const val = parseFloat(q.split('>')[1]);
    return node.band_gap !== undefined && node.band_gap > val;
  }
  if (q.startsWith('energy_above_hull:<')) {
    const val = parseFloat(q.split('<')[1]);
    return node.energy_above_hull !== undefined && node.energy_above_hull < val;
  }
  return false;
}

const GRAPH_COLORS = {
  cluster: '#8b78d9',
  material: '#d8a15f',
  element: '#7e9bc8',
  external: '#d6c878',
  stable: '#7fc99b',
  metastable: '#d8b45f',
  unstable: '#d87575',
  metal: '#c8a0e8',
  semiconductor: '#7db6ff',
  unknown: '#b6b6ba',
}

const GET_IT_GRAPH = {
  bg: '#fbfaf8',
  bgDark: '#121214',
  edge: '#d8d6d2',
  edgeDark: 'rgba(205,205,210,0.22)',
  focus: '#4f5ae0',
  ink: '#1a1a1d',
  inkMuted: '#6f7078',
  white: '#ffffff',
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

function getNodeRadius(node: GraphNodeVM, degreeMap: Map<string, number>, settings: GraphSettingsVM) {
  const degree = degreeMap.get(node.id) || 0
  let base = 3
  if (node.type === 'cluster') {
    base = 3.8 + Math.log10((node.material_count || degree || 1) + 1) * 1.8
  } else if (node.type === 'material') {
    base = 4.2 + Math.sqrt(degree) * 0.62
  } else if (node.type === 'element') {
    base = 3.0 + Math.sqrt(degree) * 0.35
  }
  return clamp(base * settings.nodeSize, 3.2, 14)
}

function getNodeRepelStrength(node: GraphNodeVM, degreeMap: Map<string, number>, settings: GraphSettingsVM) {
  const degree = degreeMap.get(node.id) || 0
  const base = settings.repelForce
  const localBoost = 1 + Math.min(Math.sqrt(degree) / 6, settings.localRepelBoost)
  const clusterBoost = node.type === 'cluster' ? settings.clusterSpread : 1
  return base * localBoost * clusterBoost
}

function getLinkDistance(link: RenderLink, settings: GraphSettingsVM) {
  if (link.type === 'CONTAINS_ELEMENT') return settings.linkDistance * 0.82
  if (link.type === 'SHARED_DOMINANT_ELEMENT') return settings.linkDistance * 1.35
  if (link.type === 'BELONGS_TO_CLUSTER') return settings.linkDistance * 1.55
  return settings.linkDistance
}

function getLinkStrength(link: RenderLink, settings: GraphSettingsVM) {
  if (link.type === 'BELONGS_TO_CLUSTER') return Math.min(settings.linkForce * 0.18, 0.08)
  if (link.type === 'CONTAINS_ELEMENT') return Math.min(settings.linkForce * 0.55, 0.25)
  return settings.linkForce
}

function nodeColor(node: GraphNodeVM, groups: GraphGroupVM[], colorMode: string): string {
  for (const group of groups) {
    if (matchesGroup(node, group.query)) return group.color;
  }
  if (node.namespace === 'external_research') return GRAPH_COLORS.external;
  if (colorMode === 'stability') {
    if (node.is_stable === true) return GRAPH_COLORS.stable;
    if (node.is_stable === false) {
       if (node.energy_above_hull && node.energy_above_hull > 0.1) return GRAPH_COLORS.unstable;
       return GRAPH_COLORS.metastable;
    }
  } else if (colorMode === 'band_gap') {
    if (node.is_metal) return GRAPH_COLORS.metal;
    if (node.band_gap !== undefined && node.band_gap > 0) return GRAPH_COLORS.semiconductor;
  } else if (colorMode === 'element') {
    if (node.type === 'element') return GRAPH_COLORS.element;
    return GRAPH_COLORS.unknown;
  } else if (colorMode === 'namespace') {
    return GRAPH_COLORS.cluster;
  }
  if (node.type === 'cluster') return GRAPH_COLORS.cluster;
  if (node.type === 'material') return GRAPH_COLORS.material;
  if (node.type === 'element') return GRAPH_COLORS.element;
  return GRAPH_COLORS.unknown;
}

function wrapLabel(label: string, maxChars = 18, maxLines = 2): string[] {
  const clean = label.replace(/\s+/g, ' ').trim()
  if (!clean) return ['']
  const words = clean.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length === maxLines - 1) break
  }
  if (current && lines.length < maxLines) lines.push(current)
  const joinedLength = lines.join(' ').length
  if (joinedLength < clean.length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[. ]+$/, '')}...`
  }
  return lines
}

function nodeTier(node: GraphNodeVM, degreeMap: Map<string, number>): 0 | 1 | 2 {
  const degree = degreeMap.get(node.id) || 0
  if (node.type === 'cluster' || degree >= 10) return 0
  if (node.type === 'material' || degree >= 4) return 1
  return 2
}

export function GraphCanvas({ graphOverride }: GraphCanvasProps = {}) {
  const fgRef = useRef<GraphMethods | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 800, height: 600 })
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: RenderNode } | null>(null)

  const executeCommand = useCommandExecutor()
  const { addCandidateRaw } = useCatalystCandidates()
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    graphSettings,
    colorMode,
    selectGraphNode,
    selectEdge,
    isLoading,
    error,
  } = useCatalystGraph()
  const { isOffline, retry } = useCatalystStatus()
  const { openSheet, theme } = useCatalystLayout()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const resize = () => setDims({ width: el.offsetWidth, height: el.offsetHeight })
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    return () => ro.disconnect()
  }, [])

  const dataNodes = graphOverride?.nodes ?? nodes
  const dataEdges = graphOverride?.edges ?? edges
  const activeSelectedNodeId = graphOverride?.selectedNodeId ?? selectedNodeId
  const activeSettings = useMemo(() => {
    if (!graphOverride) return graphSettings
    return {
      ...graphSettings,
      search: '',
      showClusters: false,
      showMaterials: true,
      showElements: true,
      showOrphans: true,
      edgeDensity: 'dense' as const,
      textFadeThreshold: Math.min(graphSettings.textFadeThreshold, 1.05),
    }
  }, [graphOverride, graphSettings])

  const visibleGraph = useMemo(() => {
    const visibleNodes = dataNodes.filter((node) => {
      if (node.type === 'cluster' && !activeSettings.showClusters) return false
      if (node.type === 'material' && !activeSettings.showMaterials) return false
      if (node.type === 'element' && !activeSettings.showElements) return false
      return nodeMatches(node, activeSettings.search)
    })
    const visibleIds = new Set(visibleNodes.map((node) => node.id))
    const visibleEdges = dataEdges.filter((edge) => visibleIds.has(idOf(edge.source)) && visibleIds.has(idOf(edge.target)))
    
    const degreeMap = new Map<string, number>()
    for (const edge of visibleEdges) {
      const s = idOf(edge.source)
      const t = idOf(edge.target)
      degreeMap.set(s, (degreeMap.get(s) || 0) + 1)
      degreeMap.set(t, (degreeMap.get(t) || 0) + 1)
    }

    let finalNodes = visibleNodes;
    if (!activeSettings.showOrphans) {
       finalNodes = visibleNodes.filter(n => (degreeMap.get(n.id) || 0) > 0)
    }

    let finalEdges = visibleEdges;
    const maxEdges = activeSettings.edgeDensity === 'sparse' ? 500 : activeSettings.edgeDensity === 'normal' ? 1200 : 3000;
    if (finalEdges.length > maxEdges) {
      // Prioritize structural edges, then highest value similarity edges
      const structural = finalEdges.filter(e => e.type === 'BELONGS_TO_CLUSTER' || e.type === 'CONTAINS_ELEMENT');
      const simEdges = finalEdges.filter(e => e.type !== 'BELONGS_TO_CLUSTER' && e.type !== 'CONTAINS_ELEMENT');
      simEdges.sort((a, b) => (b.value || 0) - (a.value || 0));
      const keepSim = simEdges.slice(0, Math.max(0, maxEdges - structural.length));
      finalEdges = [...structural, ...keepSim];
    }

    const renderNodes = finalNodes.map((node) => ({ ...node })) as RenderNode[]
    const renderEdges = finalEdges.map((edge) => ({
      ...edge,
      source: idOf(edge.source),
      target: idOf(edge.target),
    })) as RenderLink[]

    return { nodes: renderNodes, links: renderEdges, degreeMap }
  }, [
    activeSettings.search,
    activeSettings.showClusters,
    activeSettings.showElements,
    activeSettings.showMaterials,
    activeSettings.showOrphans,
    activeSettings.edgeDensity,
    dataEdges,
    dataNodes,
  ])

  const connectedIds = useMemo(() => {
    const anchor = hoverNodeId
    if (!anchor) return new Set<string>()
    const ids = new Set<string>([anchor])
    visibleGraph.links.forEach((edge: RenderLink) => {
      const source = idOf(edge.source)
      const target = idOf(edge.target)
      if (source === anchor) ids.add(target)
      if (target === anchor) ids.add(source)
    })
    return ids
  }, [hoverNodeId, visibleGraph.links])

  const fitGraphKey = `${visibleGraph.nodes.length}:${visibleGraph.links.length}`

  const nodeIndex = useMemo(() => {
    return new Map(visibleGraph.nodes.map((node) => [node.id, node]))
  }, [visibleGraph.nodes])

  useEffect(() => {
    if (visibleGraph.nodes.length === 0) return
    const timer = window.setTimeout(() => {
      fgRef.current?.zoomToFit?.(850, 72)
    }, 360)
    return () => window.clearTimeout(timer)
  }, [fitGraphKey, visibleGraph.nodes.length])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    
    const collide = forceCollide<RenderNode>()
      .radius((node) => getNodeRadius(node as GraphNodeVM, visibleGraph.degreeMap, activeSettings) + activeSettings.collisionPadding + 10)
      .strength(Math.max(activeSettings.collisionStrength, 0.72))
      .iterations(activeSettings.collisionIterations)

    const charge = forceManyBody<RenderNode>()
      .strength((node) => -getNodeRepelStrength(node as GraphNodeVM, visibleGraph.degreeMap, activeSettings) * 1.18)
      .distanceMin(activeSettings.chargeDistanceMin)
      .distanceMax(activeSettings.chargeDistanceMax)
      .theta(0.9)

    fg.d3Force('charge', charge)
    fg.d3Force('collide', collide)
    fg.d3Force('link')?.distance((link: unknown) => getLinkDistance(link as RenderLink, activeSettings))
    fg.d3Force('link')?.strength((link: unknown) => getLinkStrength(link as RenderLink, activeSettings))
    fg.d3Force('x', forceX(0).strength(activeSettings.centerForce * 0.026))
    fg.d3Force('y', forceY(0).strength(activeSettings.centerForce * 0.026))
    fg.d3ReheatSimulation?.()

    // Even in finite-layout mode the canvas needs an active render loop long
    // enough to draw the warmed positions. cooldownTicks stops it afterward.
    fg.resumeAnimation?.()
  }, [activeSettings, visibleGraph.nodes.length, visibleGraph.links.length, visibleGraph.degreeMap])

  useEffect(() => {
    const recenter = () => fgRef.current?.zoomToFit?.(650, 64)
    window.addEventListener('catalyst:graph-recenter', recenter)
    return () => window.removeEventListener('catalyst:graph-recenter', recenter)
  }, [])

  useEffect(() => {
    const focusNode = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      const nodeId = detail.nodeId || detail.materialId
      if (!nodeId) return
      const focus = () => {
        const node = nodeIndex.get(String(nodeId))
        if (!node || node.x === undefined || node.y === undefined) return false
        setHoverNodeId(node.id)
        fgRef.current?.centerAt?.(node.x, node.y, 600)
        fgRef.current?.zoom?.(Number(detail.scale || 2.65), 600)
        window.setTimeout(() => setHoverNodeId((current) => current === node.id ? null : current), Number(detail.durationMs || 6500))
        return true
      }
      if (!focus()) {
        window.setTimeout(focus, 180)
        window.setTimeout(focus, 520)
      }
    }
    window.addEventListener('catalyst:graph-focus-node', focusNode)
    return () => window.removeEventListener('catalyst:graph-focus-node', focusNode)
  }, [nodeIndex])
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const fg = fgRef.current;
      if (!fg) return;
      const step = e.shiftKey ? 40 : 10;
      if (e.key === 'Escape') {
         setContextMenu(null);
      } else if (e.key === '=' || e.key === '+') {
         const currentZoom = fg.zoom();
         fg.zoom(currentZoom * 1.2, 200);
      } else if (e.key === '-') {
         const currentZoom = fg.zoom();
         fg.zoom(currentZoom / 1.2, 200);
      } else if (e.key === '0') {
         fg.zoomToFit(400, 64);
      } else if (e.key === 'ArrowUp') {
         const { x, y } = fg.centerAt();
         fg.centerAt(x, y - step, 100);
      } else if (e.key === 'ArrowDown') {
         const { x, y } = fg.centerAt();
         fg.centerAt(x, y + step, 100);
      } else if (e.key === 'ArrowLeft') {
         const { x, y } = fg.centerAt();
         fg.centerAt(x - step, y, 100);
      } else if (e.key === 'ArrowRight') {
         const { x, y } = fg.centerAt();
         fg.centerAt(x + step, y, 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNodeClick = useCallback((node: RenderNode) => {
    setContextMenu(null);
    selectGraphNode(node.id)
    openSheet('inspector')
    fgRef.current?.centerAt?.(node.x ?? 0, node.y ?? 0, 550)
    fgRef.current?.zoom?.(2.4, 550)
  }, [openSheet, selectGraphNode])
  
  const handleNodeRightClick = useCallback((node: RenderNode, event: MouseEvent) => {
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const handleLinkClick = useCallback((link: RenderLink) => {
    setContextMenu(null);
    if (!link.id) return
    selectEdge(link.id)
    openSheet('edge')
  }, [openSheet, selectEdge])

  const paintNode = useCallback((node: RenderNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const graphNode = node as GraphNodeVM
    const isDark = theme === 'dark'
    const isSelected = graphNode.id === activeSelectedNodeId
    const isHovered = graphNode.id === hoverNodeId
    const isDimmed = connectedIds.size > 0 && !connectedIds.has(graphNode.id)
    const tier = nodeTier(graphNode, visibleGraph.degreeMap)
    
    let size = getNodeRadius(graphNode, visibleGraph.degreeMap, activeSettings);
    if (tier === 0) size += 3.5
    if (tier === 1) size += 1.5
    if (isSelected || isHovered) size += 2.25;
    
    const color = nodeColor(graphNode, activeSettings.groups || [], colorMode)
    const x = node.x ?? 0
    const y = node.y ?? 0

    if (isSelected || isHovered) {
      ctx.beginPath()
      ctx.arc(x, y, size + 18, 0, 2 * Math.PI)
      ctx.fillStyle = isDark ? 'rgba(143,188,255,0.14)' : `${color}2b`
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(x, y, size + 5, 0, 2 * Math.PI)
    ctx.fillStyle = isDark ? GET_IT_GRAPH.bgDark : GET_IT_GRAPH.white
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, size, 0, 2 * Math.PI)
    
    if (isDimmed) {
       ctx.fillStyle = isDark ? 'rgba(82,82,92,0.36)' : 'rgba(182,182,186,0.48)'
    } else {
       ctx.fillStyle = color;
    }
    ctx.fill()

    if (isSelected || isHovered) {
      ctx.beginPath()
      ctx.arc(x, y, size + 4, 0, 2 * Math.PI)
      ctx.strokeStyle = GET_IT_GRAPH.focus
      ctx.lineWidth = 2 / globalScale
      ctx.stroke()
    }

    if (!activeSettings.showLabels) return
    
    const degree = visibleGraph.degreeMap.get(graphNode.id) || 0;
    let labelPriority = 0;
    if (isSelected) labelPriority = 100;
    else if (isHovered) labelPriority = 95;
    else if (degree >= 8) labelPriority = 70;
    else if (graphNode.type === 'cluster' && activeSettings.showClusters) labelPriority = 74;
    else if (graphNode.type === 'material' && connectedIds.has(graphNode.id)) labelPriority = 50;
    
    const shouldLabel = labelPriority >= 50 || globalScale >= activeSettings.textFadeThreshold * 0.82;
    if (!shouldLabel) return;

    const label = graphNode.name || graphNode.id
    const labelLines = wrapLabel(label, tier === 0 ? 15 : tier === 1 ? 18 : 22, 2)
    const fontSize = Math.max(5.2, (tier === 0 ? 12.8 : tier === 1 ? 10.8 : 9.2) / globalScale)
    const labelY = y + size + 5
    ctx.font = `${tier === 0 ? 700 : tier === 1 ? 600 : 500} ${fontSize}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = isDimmed
      ? isDark ? 'rgba(190,190,190,0.26)' : 'rgba(76,76,82,0.28)'
      : isDark ? 'rgba(242,242,243,0.88)' : GET_IT_GRAPH.ink
    labelLines.forEach((line, index) => {
      ctx.fillText(line, x, labelY + index * fontSize * 1.12)
    })
  }, [activeSelectedNodeId, activeSettings, connectedIds, hoverNodeId, theme, visibleGraph.degreeMap, colorMode])

  const paintLinkLabel = useCallback((link: RenderLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!activeSettings.showEdgeLabels && link.id !== hoverEdgeId && link.id !== selectedEdgeId) return
    const source = link.source
    const target = link.target
    if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return
    const label = String(link.type || 'relation').replaceAll('_', ' ').toLowerCase()
    const x = ((source.x ?? 0) + (target.x ?? 0)) / 2
    const y = ((source.y ?? 0) + (target.y ?? 0)) / 2
    const fs = Math.max(4, 8 / globalScale)
    ctx.font = `500 ${fs}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(26,26,29,0.52)'
    ctx.fillText(label, x, y)
  }, [activeSettings.showEdgeLabels, hoverEdgeId, selectedEdgeId])

  const activeLoading = graphOverride ? false : isLoading
  const activeError = graphOverride ? null : error

  if (isOffline) {
    return (
      <div className="absolute inset-0 z-0 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex max-w-xs flex-col items-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border" style={{ background: 'rgba(238,123,123,0.08)', borderColor: 'rgba(238,123,123,0.2)' }}>
            <WifiOff className="h-8 w-8" style={{ color: 'var(--danger)', opacity: 0.7 }} />
          </div>
          <div>
            <p className="mb-1 text-base font-semibold" style={{ color: 'var(--danger)' }}>Backend offline</p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Cannot reach <span className="font-mono" style={{ color: 'var(--text-2)' }}>Catalyst API</span>
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-4)' }}>Run <span className="font-mono">catalyst</span> to start</p>
          </div>
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-95"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 graph-canvas-bg"
      style={{ background: theme === 'dark' ? GET_IT_GRAPH.bgDark : GET_IT_GRAPH.bg }}
    >
      {activeLoading && dataNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border" style={{ background: theme === 'dark' ? 'rgba(143,188,255,0.10)' : '#fff', borderColor: theme === 'dark' ? 'rgba(143,188,255,0.24)' : '#dedbd6' }}>
              <div className="h-4 w-4 rounded-full border-2 spinner" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
            <span className="text-sm" style={{ color: theme === 'dark' ? 'var(--text-3)' : GET_IT_GRAPH.inkMuted }}>Loading graph</span>
          </div>
        </div>
      )}

      {activeError && dataNodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{activeError}</p>
        </div>
      )}
      
      {contextMenu && (
        <div 
          className="absolute z-50 rounded-md border shadow-lg py-1 text-sm bg-[var(--surface-1)] text-[var(--text-1)]"
          style={{ top: contextMenu.y, left: contextMenu.x, minWidth: '160px', borderColor: 'var(--border)' }}
        >
          <button className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface-2)]" onClick={() => { selectGraphNode(contextMenu.node.id); openSheet('inspector'); setContextMenu(null); }}>Inspect {contextMenu.node.type}</button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface-2)]" onClick={() => { executeCommand({ type: 'expand_neighborhood', materialId: contextMenu.node.id }); setContextMenu(null); }}>Expand neighborhood</button>
          {contextMenu.node.type === 'material' && (
             <button className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface-2)]" onClick={() => { addCandidateRaw(contextMenu.node); setContextMenu(null); }}>Add to candidates</button>
          )}
          <button className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface-2)]" onClick={() => { executeCommand({ type: 'ask_agent', message: `Tell me about ${contextMenu.node.name || contextMenu.node.id}` }); setContextMenu(null); }}>Ask agent</button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface-2)]" onClick={() => { executeCommand({ type: 'export_subgraph', materialIds: [contextMenu.node.id] }); setContextMenu(null); }}>Export subgraph</button>
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        width={dims.width}
        height={dims.height}
        graphData={visibleGraph}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: RenderNode, color, ctx) => {
          const graphNode = node as GraphNodeVM
          const tier = nodeTier(graphNode, visibleGraph.degreeMap)
          const r = Math.max(getNodeRadius(graphNode, visibleGraph.degreeMap, activeSettings) + 16, tier === 0 ? 34 : tier === 1 ? 28 : 22)
          const x = node.x ?? 0
          const y = node.y ?? 0
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(x, y, r, 0, 2 * Math.PI)
          ctx.fill()
          if (activeSettings.showLabels) {
            const label = graphNode.name || graphNode.id
            const labelLines = wrapLabel(label, tier === 0 ? 15 : tier === 1 ? 18 : 22, 2)
            const widest = labelLines.reduce((max, line) => Math.max(max, line.length), 0)
            const w = Math.min(Math.max(widest * 7, 34), tier === 0 ? 150 : 120)
            const h = labelLines.length * 18
            ctx.fillRect(x - w / 2, y + r * 0.52, w, h)
          }
        }}
        nodeLabel={(node: RenderNode) => `${node.name || node.id}\n${node.chemsys || node.type || ''}`}
        nodeRelSize={1}
        linkHoverPrecision={8}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onBackgroundClick={() => setContextMenu(null)}
        onNodeHover={(node: RenderNode | null) => {
          if (node !== null && hoverNodeId !== node.id && activeSettings.motion !== 'still') {
            fgRef.current?.d3ReheatSimulation?.()
          }
          setHoverNodeId(node?.id || null);
          if (containerRef.current) {
            containerRef.current.style.cursor = node ? 'pointer' : 'default';
          }
        }}
        onLinkClick={handleLinkClick}
        onLinkHover={(link: RenderLink | null) => setHoverEdgeId(link?.id || null)}
        linkColor={(link: RenderLink) => {
          const isDark = theme === 'dark'
          const source = idOf(link.source)
          const target = idOf(link.target)
          const active = link.id === selectedEdgeId || link.id === hoverEdgeId || source === hoverNodeId || target === hoverNodeId
          if (active) return GET_IT_GRAPH.focus
          if (link.type === 'CONTAINS_ELEMENT') return isDark ? 'rgba(126,155,200,0.36)' : 'rgba(126,155,200,0.48)'
          if (link.type === 'BELONGS_TO_CLUSTER') return isDark ? 'rgba(205,205,210,0.08)' : 'rgba(216,214,210,0.42)'
          if (connectedIds.size > 0 && !connectedIds.has(source) && !connectedIds.has(target)) {
            return isDark ? 'rgba(82,82,92,0.06)' : 'rgba(216,214,210,0.12)'
          }
          return isDark ? GET_IT_GRAPH.edgeDark : GET_IT_GRAPH.edge
        }}
        linkWidth={(link: RenderLink) => {
          const selected = link.id === selectedEdgeId || link.id === hoverEdgeId
          const weight = link.value || 1;
          
          let baseWidth = 1.25;
          if (link.type === 'cluster' || link.type === 'BELONGS_TO_CLUSTER') baseWidth = 0.75;
          if (link.type === 'CONTAINS_ELEMENT') baseWidth = 0.9;
          
          const width = clamp(baseWidth + Math.log1p(weight) * 0.08, 0.65, 2.0) * activeSettings.linkThickness;
          
          return selected ? width + 1.4 : width;
        }}
        linkDirectionalArrowLength={activeSettings.showArrows ? 3.5 : 0}
        linkDirectionalArrowRelPos={0.66}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={paintLinkLabel}
        d3AlphaDecay={activeSettings.motion === 'still' ? 0.08 : (activeSettings.motion === 'subtle' ? 0.015 : 0.0228)}
        d3VelocityDecay={activeSettings.motion === 'still' ? 0.45 : (activeSettings.motion === 'subtle' ? 0.35 : 0.4)}
        warmupTicks={120}
        cooldownTicks={activeSettings.motion === 'still' ? 200 : (activeSettings.motion === 'subtle' ? 240 : Infinity)}
        enableNodeDrag={true}
        backgroundColor={theme === 'dark' ? GET_IT_GRAPH.bgDark : GET_IT_GRAPH.bg}
      />
    </div>
  )
}
