// ── Catalyst App Store ───────────────────────────────────────────────────────
// Module-level domain state: graph, workspace, agent, candidates, etc.
// Visual-only state lives in layoutStore.ts.

import { create } from 'zustand';
import { API_BASE, api } from '@/lib/api';
import { useLayoutStore } from './layoutStore';
import {
  normalizeNode,
  normalizeEdge,
  normalizeWorkspace,
  normalizeFallbackWorkspace,
  normalizeCandidateRow,
  normalizeCandidateFromRaw,
  normalizeAgentMessage,
  normalizeEdgeDetail,
  normalizeResearch,
  normalizeSystemStatus,
  normalizeSession,
  normalizeCompare,
} from '../bridge/normalizers';
import { toCatalystError } from '../bridge/errors';
import type {
  SystemStatusVM,
  GraphNodeVM,
  GraphNodeDetail,
  GraphEdgeVM,
  GraphSettingsVM,
  WorkspaceVM,
  AgentMessageVM,
  CandidateRowVM,
  EdgeVM,
  ResearchVM,
  SessionVM,
  CompareVM,
} from '../bridge/viewModels';

// ── Graph helpers ─────────────────────────────────────────────────────────────

function mergeGraphNodes(base: GraphNodeVM[], incoming: GraphNodeVM[]): GraphNodeVM[] {
  const next = [...base];
  incoming.forEach((node) => {
    const idx = next.findIndex((n) => n.id === node.id);
    if (idx >= 0) next[idx] = { ...next[idx], ...node };
    else next.push(node);
  });
  return next;
}

function mergeGraphEdges(base: GraphEdgeVM[], incoming: GraphEdgeVM[]): GraphEdgeVM[] {
  const next = [...base];
  incoming.forEach((edge) => {
    if (!next.find((e) => e.id === edge.id)) next.push(edge);
  });
  return next;
}

function materialIdFromUiAction(action: any): string | null {
  return action?.material_id || action?.materialId || action?.payload?.material_id || action?.payload?.materialId || null;
}

function dispatchGraphFocus(materialId: string, action: any) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('catalyst:graph-focus-node', {
    detail: {
      materialId,
      nodeId: materialId,
      scale: action?.scale,
      durationMs: action?.duration_ms || action?.durationMs,
    },
  }));
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export type Toast = { id: string; message: string; type: 'error' | 'info' | 'success' | 'warning' };
let _toastSeq = 0;

const DEFAULT_GRAPH_SETTINGS: GraphSettingsVM = {
  search: '',
  showClusters: false,
  showMaterials: true,
  showElements: true,
  showOrphans: true,
  showLabels: true,
  showArrows: false,
  showEdgeLabels: false,
  nodeSize: 1.0,
  linkThickness: 0.9,
  textFadeThreshold: 1.35,
  collisionPadding: 10,
  collisionStrength: 0.95,
  collisionIterations: 4,
  chargeDistanceMin: 24,
  chargeDistanceMax: 210,
  localRepelBoost: 2.15,
  clusterSpread: 1.75,
  centerForce: 0.34,
  repelForce: 58,
  linkForce: 0.42,
  linkDistance: 58,
  motion: 'subtle',
  edgeDensity: 'normal',
  localDepth: 1,
  groups: [],
};

// ── App State Interface ───────────────────────────────────────────────────────

export interface AppState {
  // ── System ─────────────────────────────────────────────────────────────────
  systemStatus: SystemStatusVM;
  isOffline: boolean;
  startupError: string | null;
  rawSettings: any;
  rawCatalog: any;
  rawHealth: any;

  // ── Graph ──────────────────────────────────────────────────────────────────
  graphNodes: GraphNodeVM[];
  graphEdges: GraphEdgeVM[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  graphColorMode: 'type' | 'stability' | 'band_gap' | 'element';
  graphSettings: GraphSettingsVM;
  graphLoading: boolean;
  graphError: string | null;
  selectedGraphNodeDetail: GraphNodeDetail | null;
  graphNodeDetailLoading: boolean;
  graphNodeDetailError: string | null;

  // ── Workspace ──────────────────────────────────────────────────────────────
  workspace: WorkspaceVM | null;
  workspaceLoading: boolean;
  workspaceError: string | null;
  structureById: Record<string, any>;
  detailsById: Record<string, any>;
  structureLoadingById: Record<string, boolean>;
  detailsLoadingById: Record<string, boolean>;
  structureErrorById: Record<string, string | null>;
  detailsErrorById: Record<string, string | null>;

  // ── Edge Detail ────────────────────────────────────────────────────────────
  edgeDetail: EdgeVM | null;
  edgeLoading: boolean;
  edgeError: string | null;

  // ── Search ─────────────────────────────────────────────────────────────────
  searchResults: CandidateRowVM[];
  searchLoading: boolean;
  searchError: string | null;
  searchFilters: Record<string, any>;

  // ── Screen ─────────────────────────────────────────────────────────────────
  screenResults: CandidateRowVM[];
  screenRequirement: string;
  screenLoading: boolean;
  screenError: string | null;

  // ── Agent ──────────────────────────────────────────────────────────────────
  agentMessages: AgentMessageVM[];
  agentLoading: boolean;
  agentError: string | null;

  // ── Candidates ─────────────────────────────────────────────────────────────
  candidates: CandidateRowVM[];
  compareData: CompareVM | null;
  compareLoading: boolean;
  compareError: string | null;

  // ── Research ───────────────────────────────────────────────────────────────
  research: ResearchVM | null;
  researchLoading: boolean;
  researchError: string | null;
  researchRuns: Record<string, any>;

  // ── Sessions ───────────────────────────────────────────────────────────────
  sessions: SessionVM[];
  currentSessionId: string | null;
  sessionsLoading: boolean;

  // ── Toasts ─────────────────────────────────────────────────────────────────
  toasts: Toast[];

  // ── Actions ────────────────────────────────────────────────────────────────
  initialize: () => Promise<void>;
  selectNode: (id: string | null) => Promise<void>;
  selectGraphNode: (id: string) => Promise<void>;
  selectEdge: (id: string | null) => Promise<void>;
  expandNeighborhood: (materialId: string, options?: { depth?: number; limit_nodes?: number }) => Promise<void>;
  loadMaterialStructure: (materialId: string, force?: boolean) => Promise<any>;
  loadMaterialDetails: (
    materialId: string,
    options?: { sections?: string[]; limit?: number; downsample?: boolean; force?: boolean },
  ) => Promise<any>;
  runSearch: (query: string, filters?: Record<string, any>) => Promise<CandidateRowVM[]>;
  clearSearch: () => void;
  runScreen: (requirement: string) => Promise<CandidateRowVM[]>;
  clearScreen: () => void;
  sendAgentMessage: (text: string) => Promise<void>;
  clearAgentMessages: () => void;
  addCandidate: (workspace: WorkspaceVM) => void;
  addCandidateRaw: (raw: any) => void;
  removeCandidate: (materialId: string) => void;
  clearCandidates: () => void;
  runCompare: () => Promise<void>;
  exportSubgraph: (materialIds?: string[]) => Promise<void>;
  exportCandidates: (format?: 'json' | 'csv') => Promise<void>;
  loadResearchStatus: () => Promise<void>;
  runResearch: (query: string, context?: any) => Promise<void>;
  loadSessions: () => Promise<void>;
  createSession: () => Promise<string>;
  switchSession: (id: string) => void;
  updateSettings: (body: Record<string, unknown>) => Promise<void>;
  setGraphColorMode: (mode: AppState['graphColorMode']) => void;
  setGraphSettings: (patch: Partial<GraphSettingsVM>) => void;
  resetGraphSettings: () => void;
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
  retryInit: () => Promise<void>;
}

// ── Default system status ─────────────────────────────────────────────────────

const DEFAULT_STATUS: SystemStatusVM = {
  api: 'checking',
  backendLabel: 'Catalyst backend',
  provider: { llmConfigured: false, activeProvider: null, researchSources: {} },
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // ── System ──────────────────────────────────────────────────────────────────
  systemStatus: DEFAULT_STATUS,
  isOffline: false,
  startupError: null,
  rawSettings: null,
  rawCatalog: null,
  rawHealth: null,

  // ── Graph ───────────────────────────────────────────────────────────────────
  graphNodes: [],
  graphEdges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  graphColorMode: 'stability',
  graphSettings: DEFAULT_GRAPH_SETTINGS,
  graphLoading: false,
  graphError: null,
  selectedGraphNodeDetail: null,
  graphNodeDetailLoading: false,
  graphNodeDetailError: null,

  // ── Workspace ───────────────────────────────────────────────────────────────
  workspace: null,
  workspaceLoading: false,
  workspaceError: null,
  structureById: {},
  detailsById: {},
  structureLoadingById: {},
  detailsLoadingById: {},
  structureErrorById: {},
  detailsErrorById: {},

  // ── Edge ────────────────────────────────────────────────────────────────────
  edgeDetail: null,
  edgeLoading: false,
  edgeError: null,

  // ── Search ──────────────────────────────────────────────────────────────────
  searchResults: [],
  searchLoading: false,
  searchError: null,
  searchFilters: {},

  // ── Screen ──────────────────────────────────────────────────────────────────
  screenResults: [],
  screenRequirement: '',
  screenLoading: false,
  screenError: null,

  // ── Agent ───────────────────────────────────────────────────────────────────
  agentMessages: [],
  agentLoading: false,
  agentError: null,

  // ── Candidates ──────────────────────────────────────────────────────────────
  candidates: [],
  compareData: null,
  compareLoading: false,
  compareError: null,

  // ── Research ────────────────────────────────────────────────────────────────
  research: null,
  researchLoading: false,
  researchError: null,
  researchRuns: {},

  // ── Sessions ────────────────────────────────────────────────────────────────
  sessions: [],
  currentSessionId: null,
  sessionsLoading: false,

  // ── Toasts ──────────────────────────────────────────────────────────────────
  toasts: [],

  // ── Initialize ──────────────────────────────────────────────────────────────
  initialize: async () => {
    set({ isOffline: false, startupError: null, systemStatus: { ...DEFAULT_STATUS, api: 'checking' }, graphLoading: true });

    // 1. Health check
    let health: any = null;
    try {
      health = await api.getHealth();
      set({ rawHealth: health });
    } catch {
      set({
        isOffline: true,
        startupError: `Cannot reach the Catalyst backend at ${API_BASE}`,
        systemStatus: { ...DEFAULT_STATUS, api: 'offline' },
        graphLoading: false,
      });
      return;
    }

    // 2. Parallel: catalog + settings
    const [catalogResult, settingsResult] = await Promise.allSettled([api.getCatalog(), api.getSettings()]);
    const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : null;
    const settingsResp = settingsResult.status === 'fulfilled' ? settingsResult.value : null;

    set({
      rawCatalog: catalog,
      rawSettings: settingsResp,
      systemStatus: normalizeSystemStatus(health, catalog, settingsResp),
    });

    // 3. Sessions
    try {
      const sessionsData = await api.getSessions();
      const sessions = (sessionsData?.sessions || []).map(normalizeSession);
      set({ sessions });
      if (sessions.length === 0) {
        const newSession = await api.createSession({ title: 'Session 1' });
        const ns = normalizeSession(newSession);
        set({ sessions: [ns], currentSessionId: ns.id });
      } else {
        set({ currentSessionId: sessions[0].id });
      }
    } catch {
      set({ currentSessionId: `local-${Date.now()}` });
    }

    // 4. UI-safe working graph slice
    try {
      const graph = await api.getGraphView(600, 'overview', true, true);
      const nodes = (graph.nodes || []).map(normalizeNode);
      const edges = (graph.edges || graph.links || []).map(normalizeEdge);
      set({ graphNodes: nodes, graphEdges: edges, graphLoading: false, graphError: null });
    } catch {
      try {
        const overview = await api.getOverview();
        const nodes = (overview.nodes || []).map(normalizeNode);
        const edges = (overview.edges || overview.links || []).map(normalizeEdge);
        set({ graphNodes: nodes, graphEdges: edges, graphLoading: false, graphError: null });
        get().addToast('Loaded cluster overview fallback; full material graph failed', 'warning');
      } catch {
        set({ graphLoading: false, graphError: 'Failed to load graph' });
        get().addToast('Failed to load graph', 'error');
      }
    }

    // 5. Initial material (non-critical)
    try {
      const random = await api.getRandomMaterial('curated');
      if (random?.material_id && !get().selectedNodeId && !get().workspace) {
        await get().selectNode(random.material_id);
      }
    } catch { /* non-critical */ }

    // 6. Research status (non-blocking)
    get().loadResearchStatus().catch(() => {});
  },

  retryInit: () => get().initialize(),

  // ── Node selection ──────────────────────────────────────────────────────────
  selectGraphNode: async (id) => {
    set({ selectedNodeId: id, workspace: null, edgeDetail: null, graphNodeDetailLoading: true, graphNodeDetailError: null });
    try {
      const nodeDetail = await api.getGraphNode(id);
      set({ selectedGraphNodeDetail: nodeDetail, graphNodeDetailLoading: false });
      if (nodeDetail.type === 'material') {
        get().selectNode(id);
      }
    } catch (err) {
      set({ graphNodeDetailLoading: false, graphNodeDetailError: 'Failed to load node details' });
    }
  },

  selectNode: async (id) => {
    if (!id) {
      set({ selectedNodeId: null, workspace: null, edgeDetail: null, selectedEdgeId: null, selectedGraphNodeDetail: null });
      return;
    }

    const nodes = get().graphNodes;
    const node = nodes.find((n) => n.id === id);
    let targetId = id;

    // Cluster with representative — navigate to it
    if (node?.type === 'cluster') {
      if (node.representative_material_id) {
        targetId = node.representative_material_id;
      } else {
        set({ selectedNodeId: id, workspace: null, workspaceError: null });
        return;
      }
    }

    set({ selectedNodeId: id, workspaceLoading: true, workspaceError: null, selectedEdgeId: null, edgeDetail: null });

    try {
      const data = await api.getWorkspace(targetId);
      const vm = normalizeWorkspace(data, false);
      // Merge workspace graph
      if (data?.graph) {
        const inNodes = (data.graph.nodes || []).map(normalizeNode);
        const inEdges = (data.graph.edges || data.graph.links || []).map(normalizeEdge);
        set((s) => ({
          graphNodes: mergeGraphNodes(s.graphNodes, inNodes),
          graphEdges: mergeGraphEdges(s.graphEdges, inEdges),
        }));
      }
      set({ workspace: vm, workspaceLoading: false });
    } catch (err) {
      const ce = toCatalystError('material', err);
      if (ce.status === 404 || true) {
        // Fallback
        try {
          const [mat, ev] = await Promise.all([api.getMaterial(targetId), api.getEvidence(targetId)]);
          const vm = normalizeFallbackWorkspace(mat, ev);
          if (vm.elements?.length) {
            const fallbackNodes = [
              normalizeNode({ id: targetId, label: mat.formula_pretty, type: 'material', ...mat }),
              ...vm.elements.map((el: string) => normalizeNode({ id: el, label: el, type: 'element', symbol: el })),
            ];
            const fallbackEdges = vm.elements.map((el: string) =>
              normalizeEdge({ source: targetId, target: el, type: 'CONTAINS_ELEMENT', weight: 1 }),
            );
            set((s) => ({
              graphNodes: mergeGraphNodes(s.graphNodes, fallbackNodes),
              graphEdges: mergeGraphEdges(s.graphEdges, fallbackEdges),
            }));
          }
          set({ workspace: vm, workspaceLoading: false });
        } catch (fbErr) {
          set({ workspaceLoading: false, workspaceError: 'Material data unavailable' });
          get().addToast('Failed to load material', 'error');
        }
      }
    }
  },

  // ── Edge selection ──────────────────────────────────────────────────────────
  loadMaterialStructure: async (materialId, force = false) => {
    const id = String(materialId || '').trim();
    if (!id) return null;
    if (!force && get().structureById[id]) return get().structureById[id];

    set((s) => ({
      structureLoadingById: { ...s.structureLoadingById, [id]: true },
      structureErrorById: { ...s.structureErrorById, [id]: null },
    }));

    try {
      const data = await api.getStructure(id);
      set((s) => ({
        structureById: { ...s.structureById, [id]: data },
        structureLoadingById: { ...s.structureLoadingById, [id]: false },
      }));
      return data;
    } catch {
      set((s) => ({
        structureLoadingById: { ...s.structureLoadingById, [id]: false },
        structureErrorById: { ...s.structureErrorById, [id]: 'Failed to load structure' },
      }));
      return null;
    }
  },

  loadMaterialDetails: async (materialId, options = {}) => {
    const id = String(materialId || '').trim();
    if (!id) return null;
    const cacheKey = `${id}::${(options.sections || []).join(',')}::${options.limit ?? ''}::${options.downsample ?? ''}`;
    if (!options.force && get().detailsById[cacheKey]) return get().detailsById[cacheKey];

    set((s) => ({
      detailsLoadingById: { ...s.detailsLoadingById, [cacheKey]: true },
      detailsErrorById: { ...s.detailsErrorById, [cacheKey]: null },
    }));

    try {
      const data = await api.getMaterialDetails(id, {
        sections: options.sections,
        limit: options.limit,
        downsample: options.downsample,
      });
      set((s) => ({
        detailsById: { ...s.detailsById, [cacheKey]: data },
        detailsLoadingById: { ...s.detailsLoadingById, [cacheKey]: false },
      }));
      return data;
    } catch {
      set((s) => ({
        detailsLoadingById: { ...s.detailsLoadingById, [cacheKey]: false },
        detailsErrorById: { ...s.detailsErrorById, [cacheKey]: 'Failed to load details' },
      }));
      return null;
    }
  },

  selectEdge: async (id) => {
    if (!id) { set({ selectedEdgeId: null, edgeDetail: null }); return; }
    set({ selectedEdgeId: id, edgeLoading: true, edgeError: null });
    try {
      const data = await api.getEdge(id);
      set({ edgeDetail: normalizeEdgeDetail(data), edgeLoading: false });
    } catch (err) {
      set({ edgeLoading: false, edgeError: 'Failed to load edge' });
      get().addToast('Failed to load edge data', 'error');
    }
  },

  // ── Neighborhood ────────────────────────────────────────────────────────────
  expandNeighborhood: async (materialId, options = {}) => {
    const depth = Math.max(1, Math.min(5, Number(options.depth ?? get().graphSettings.localDepth ?? 1)));
    const limit_nodes = Math.max(10, Math.min(250, Number(options.limit_nodes ?? 120)));
    try {
      const data = await api.getNeighborhood(materialId, depth, limit_nodes);
      const inNodes = (data.nodes || []).map(normalizeNode);
      const inEdges = (data.edges || data.links || []).map(normalizeEdge);
      set((s) => ({
        graphNodes: mergeGraphNodes(s.graphNodes, inNodes),
        graphEdges: mergeGraphEdges(s.graphEdges, inEdges),
      }));
      get().addToast('Neighborhood expanded', 'success');
    } catch {
      get().addToast('Failed to expand neighborhood', 'error');
    }
  },

  // ── Search ──────────────────────────────────────────────────────────────────
  runSearch: async (query, filters = {}) => {
    if (!query.trim() && Object.keys(filters).length === 0) {
      set({ searchResults: [] });
      return [];
    }
    set({ searchLoading: true, searchError: null, searchFilters: filters });
    try {
      const data = await api.search(query, filters);
      const results = (data.results || []).map(normalizeCandidateFromRaw);
      set({ searchResults: results, searchLoading: false });
      return results;
    } catch (err) {
      set({ searchLoading: false, searchError: 'Search failed' });
      get().addToast('Search failed', 'error');
      return [];
    }
  },

  clearSearch: () => set({ searchResults: [], searchError: null, searchFilters: {} }),

  // ── Screen ──────────────────────────────────────────────────────────────────
  runScreen: async (requirement) => {
    set({ screenLoading: true, screenError: null, screenRequirement: requirement });
    try {
      const data = await api.screen({
        requirement,
        context: { session_id: get().currentSessionId || undefined },
        options: { limit: 8 },
      });
      const results = (data.candidates || []).map(normalizeCandidateFromRaw);
      set({ screenResults: results, screenLoading: false });
      return results;
    } catch (err) {
      set({ screenLoading: false, screenError: 'Screening failed' });
      get().addToast('Screening failed', 'error');
      return [];
    }
  },

  clearScreen: () => set({ screenResults: [], screenRequirement: '', screenError: null }),

  // ── Agent ────────────────────────────────────────────────────────────────────
  sendAgentMessage: async (text) => {
    const sessionId = get().currentSessionId || 'default';
    const userMsg = normalizeAgentMessage({ text, timestamp: Date.now() }, 'user');
    set((s) => ({ agentMessages: [...s.agentMessages, userMsg], agentLoading: true, agentError: null }));

    const ws = get().workspace;
    const currentWorkspace = ws
      ? {
          material_id: ws.resolvedMaterialId,
          formula_pretty: ws.title,
          chemsys: ws.subtitle,
          visible_material_ids: get().graphNodes
            .filter((n) => n.type === 'material')
            .slice(0, 20)
            .map((n) => n.id),
        }
      : undefined;

    try {
      const response = await api.agentChat({ session_id: sessionId, message: text, current_workspace: currentWorkspace });
      const rawMsg = response.assistant_message || {};
      const assistantMsg = normalizeAgentMessage(
        {
          ...rawMsg,
          candidateResults: response.candidate_results || rawMsg.candidateResults,
          actions: response.actions || rawMsg.actions,
          ui_actions: response.ui_actions || rawMsg.ui_actions,
        },
        'assistant',
      );
      set((s) => ({
        agentMessages: [...s.agentMessages, assistantMsg],
        agentLoading: false,
        currentSessionId: response.session_id || s.currentSessionId,
      }));

      // Auto-populate screen results from agent candidates
      if (response.candidate_results?.length) {
        set({
          screenResults: response.candidate_results.map(normalizeCandidateFromRaw),
          screenRequirement: text,
        });
      }

      for (const action of response.ui_actions || rawMsg.ui_actions || []) {
        const materialId = materialIdFromUiAction(action);
        if (!materialId) continue;
        if (action.type === 'select_node' || action.type === 'highlight_node' || action.type === 'zoom_to_node' || action.type === 'open_inspector') {
          set((s) => ({ graphSettings: { ...s.graphSettings, search: '' } }));
          if (action.type === 'select_node' || action.type === 'open_inspector') {
            await get().selectNode(materialId);
          }
          if (action.type === 'open_inspector') {
            useLayoutStore.getState().openSheet('inspector');
          }
          dispatchGraphFocus(materialId, action);
        }
      }
    } catch (err) {
      const errMsg = normalizeAgentMessage(
        { text: `Error: ${err instanceof Error ? err.message : 'Agent unavailable'}`, timestamp: Date.now() },
        'error',
      );
      set((s) => ({ agentMessages: [...s.agentMessages, errMsg], agentLoading: false }));
    }
  },

  clearAgentMessages: () => set({ agentMessages: [] }),

  // ── Candidates ──────────────────────────────────────────────────────────────
  addCandidate: (workspace) => {
    const row = normalizeCandidateRow(workspace);
    set((s) => {
      if (s.candidates.some((c) => c.material_id === row.material_id)) return {};
      return { candidates: [...s.candidates, row] };
    });
    get().addToast(`${workspace.title} added to candidates`, 'success');
  },

  addCandidateRaw: (raw) => {
    const row = normalizeCandidateFromRaw(raw);
    set((s) => {
      if (s.candidates.some((c) => c.material_id === row.material_id)) return {};
      return { candidates: [...s.candidates, row] };
    });
  },

  removeCandidate: (materialId) => {
    set((s) => ({ candidates: s.candidates.filter((c) => c.material_id !== materialId) }));
  },

  clearCandidates: () => set({ candidates: [], compareData: null }),

  // ── Compare ─────────────────────────────────────────────────────────────────
  runCompare: async () => {
    const ids = get().candidates.map((c) => c.material_id);
    if (ids.length < 2) { get().addToast('Select at least 2 candidates to compare', 'warning'); return; }
    set({ compareLoading: true, compareError: null });
    try {
      const data = await api.compare({ material_ids: ids, include_evidence: true, include_edges: true });
      set({ compareData: normalizeCompare(data), compareLoading: false });
    } catch {
      set({ compareLoading: false, compareError: 'Compare failed' });
      get().addToast('Compare failed', 'error');
    }
  },

  // ── Export ───────────────────────────────────────────────────────────────────
  exportSubgraph: async (materialIds) => {
    const ids = materialIds || get().candidates.map((c) => c.material_id);
    if (!ids.length) { get().addToast('No materials to export', 'warning'); return; }
    try {
      const data = await api.exportSubgraph({ material_ids: ids, include_evidence: true });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'catalyst-subgraph.json';
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); a.remove();
      get().addToast('Subgraph exported', 'success');
    } catch {
      get().addToast('Export failed', 'error');
    }
  },

  exportCandidates: async (format = 'json') => {
    const ids = get().candidates.map((c) => c.material_id);
    if (!ids.length) { get().addToast('No candidates to export', 'warning'); return; }
    try {
      const data = await api.exportCandidates({ material_ids: ids, format });
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], {
        type: format === 'csv' ? 'text/csv' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `catalyst-candidates.${format}`;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); a.remove();
      get().addToast('Candidates exported', 'success');
    } catch {
      get().addToast('Export failed', 'error');
    }
  },

  // ── Research ─────────────────────────────────────────────────────────────────
  loadResearchStatus: async () => {
    set({ researchLoading: true });
    try {
      const data = await api.getResearchStatus();
      set({ research: normalizeResearch(data), researchLoading: false });
    } catch {
      set({ researchLoading: false });
    }
  },

  runResearch: async (query, context) => {
    const sessionId = get().currentSessionId || 'default';
    set({ researchLoading: true, researchError: null });
    try {
      const data = await api.researchQuery({ session_id: sessionId, query, context });
      const runId = data.run_id;
      if (runId) {
        set((s) => ({ researchRuns: { ...s.researchRuns, [runId]: { status: 'pending' } } }));
      }
      set({ researchLoading: false });
      get().addToast('Research query submitted', 'info');
    } catch {
      set({ researchLoading: false, researchError: 'Research query failed' });
      get().addToast('Research failed', 'error');
    }
  },

  // ── Sessions ──────────────────────────────────────────────────────────────────
  loadSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const data = await api.getSessions();
      set({ sessions: (data?.sessions || []).map(normalizeSession), sessionsLoading: false });
    } catch {
      set({ sessionsLoading: false });
    }
  },

  createSession: async () => {
    try {
      const s = await api.createSession({ title: `Session ${Date.now()}` });
      const ns = normalizeSession(s);
      set((state) => ({ sessions: [...state.sessions, ns], currentSessionId: ns.id, agentMessages: [] }));
      return ns.id;
    } catch {
      const id = `local-${Date.now()}`;
      set({ currentSessionId: id, agentMessages: [] });
      return id;
    }
  },

  switchSession: (id) => {
    set({ currentSessionId: id, agentMessages: [], workspace: null, selectedNodeId: null });
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  updateSettings: async (body) => {
    try {
      const data = await api.patchSettings(body);
      set({
        rawSettings: data,
        systemStatus: normalizeSystemStatus(get().rawHealth, get().rawCatalog, data),
      });
      get().addToast('Settings saved', 'success');
    } catch (err) {
      get().addToast(`Settings save failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  },

  // ── UI helpers ────────────────────────────────────────────────────────────────
  setGraphColorMode: (mode) => set({ graphColorMode: mode }),
  setGraphSettings: (patch) => set((s) => ({ graphSettings: { ...s.graphSettings, ...patch } })),
  resetGraphSettings: () => set({ graphSettings: DEFAULT_GRAPH_SETTINGS, graphColorMode: 'stability' }),

  addToast: (message, type = 'info') => {
    const id = `toast-${++_toastSeq}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
