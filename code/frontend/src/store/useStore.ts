import { create } from 'zustand'
import { api } from '@/lib/api'
import type { GraphData, MaterialData, EdgeData, CandidateMaterial } from '@/lib/types'

// ─────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Array<{ id: string; label: string; url?: string }>;
  confidence?: 'grounded' | 'partial' | 'research_required';
  actions?: AgentUIAction[];
  candidateResults?: any[];
  timestamp: number;
}

interface AgentUIAction {
  id: string;
  type: string;
  label: string;
  payload?: any;
}

interface ScreenResult {
  requirement: string;
  parsed_requirements: any[];
  candidates: any[];
  unsupported_requirements: any[];
  research_suggestion?: any;
}

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'info' | 'success' | 'warning';
}

interface AppState {
  // ── Graph ──────────────────────────────────────────────────────────────
  graphData: GraphData;
  setGraphData: (data: GraphData) => void;

  // ── Selection ──────────────────────────────────────────────────────────
  selectedNodeId: string | null;
  selectedMaterialData: MaterialData | null;
  selectedEdgeId: string | null;
  selectedEdgeData: EdgeData | null;

  // ── Search ─────────────────────────────────────────────────────────────
  searchResults: any[];
  searchFilters: Record<string, any>;
  setSearchFilters: (filters: Record<string, any>) => void;

  // ── Candidates & Compare ───────────────────────────────────────────────
  candidates: CandidateMaterial[];
  isCompareOpen: boolean;
  compareData: any | null;
  compareLoading: boolean;

  // ── Agent ──────────────────────────────────────────────────────────────
  chatMessages: ChatMessage[];
  isAgentOpen: boolean;
  agentLoading: boolean;
  agentTools: any[];

  // ── Screen ─────────────────────────────────────────────────────────────
  screenResult: ScreenResult | null;
  isScreenOpen: boolean;
  screenLoading: boolean;

  // ── Sessions ───────────────────────────────────────────────────────────
  sessions: any[];
  currentSessionId: string | null;
  isSessionPickerOpen: boolean;

  // ── Settings / System ──────────────────────────────────────────────────
  health: { status: string; backend: string; version: string } | null;
  catalog: any | null;
  settings: any | null;
  providerStatus: any | null;
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  isOffline: boolean;

  // ── Research ───────────────────────────────────────────────────────────
  researchStatus: any | null;
  researchRuns: Record<string, any>;
  isResearchOpen: boolean;

  // ── UI State ───────────────────────────────────────────────────────────
  isLoading: boolean;
  apiAvailable: boolean;
  error: string | null;
  toasts: Toast[];
  isFileExplorerOpen: boolean;
  setFileExplorerOpen: (open: boolean) => void;
  graphColorMode: 'type' | 'stability' | 'band_gap' | 'element';
  setGraphColorMode: (mode: 'type' | 'stability' | 'band_gap' | 'element') => void;

  // ── Actions ────────────────────────────────────────────────────────────
  initializeGraph: () => Promise<void>;
  setSelectedNodeId: (id: string | null) => Promise<void>;
  setSelectedEdgeId: (id: string | null) => Promise<void>;
  expandNeighborhood: (id: string) => Promise<void>;
  runSearch: (query: string, filters?: Record<string, any>) => Promise<any[]>;
  addCandidate: (material: MaterialData) => void;
  removeCandidate: (material_id: string) => void;
  clearCandidates: () => void;
  setCompareOpen: (open: boolean) => void;
  runCompare: () => Promise<void>;
  exportCandidates: (format?: 'json' | 'csv') => Promise<void>;

  sendAgentMessage: (text: string) => Promise<void>;
  setAgentOpen: (open: boolean) => void;
  executeAgentAction: (action: AgentUIAction) => Promise<void>;

  runScreen: (requirement: string) => Promise<void>;
  setScreenOpen: (open: boolean) => void;

  loadSessions: () => Promise<void>;
  createSession: () => Promise<string>;
  switchSession: (id: string) => void;
  setSessionPickerOpen: (open: boolean) => void;

  loadSettings: () => Promise<void>;
  updateSettings: (body: Record<string, unknown>) => Promise<void>;

  loadResearchStatus: () => Promise<void>;
  runResearch: (query: string, context?: any) => Promise<void>;
  setResearchOpen: (open: boolean) => void;

  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const mapApiNode = (n: any) => {
  let val: number;
  let color = '#fff';
  const type = n.type || (n.material_count !== undefined ? 'cluster' : 'material');

  if (type === 'cluster') {
    const mc = n.material_count || 1;
    val = Math.min(Math.max(4 + Math.sqrt(mc) * 0.56, 5), 15);
    color = '#8B5CF6';
  } else if (type === 'material') {
    val = n.demo_pack_only ? 8 : 6;
    color = '#E8915A';
  } else if (type === 'element') {
    val = 4.5;
    color = '#5B7BF7';
  } else if (n.namespace === 'external_research') {
    val = 5;
    color = '#F5A524';
  } else {
    val = n.val || 4;
    color = '#6E6E76';
  }

  return {
    ...n,
    id: n.id,
    name: n.label || n.formula_pretty || n.id,
    val,
    type,
    cluster: n.cluster_id || (n.chemsys ? `chemsys:${n.chemsys}` : undefined),
    color,
  };
};

const mapApiLink = (l: any) => ({
  ...l,
  id: l.id || l.edge_id || `${l.source}-${l.target}`,
  source: l.source,
  target: l.target,
  value: l.weight || 1,
  type: l.type,
});

const mergeGraphData = (base: GraphData, incoming: any): GraphData => {
  const nextNodes = [...base.nodes];
  const nextLinks = [...base.links];
  const incomingNodes = (incoming?.nodes || []).map(mapApiNode);
  const incomingLinks = (incoming?.edges || incoming?.links || []).map(mapApiLink);

  incomingNodes.forEach((node: any) => {
    const index = nextNodes.findIndex(existing => existing.id === node.id);
    if (index >= 0) {
      nextNodes[index] = { ...nextNodes[index], ...node };
    } else {
      nextNodes.push(node);
    }
  });

  incomingLinks.forEach((link: any) => {
    if (!nextLinks.find(existing => existing.id === link.id)) {
      nextLinks.push(link);
    }
  });

  return { nodes: nextNodes, links: nextLinks };
};

const workspaceFallback = (material: any, evidence: any): MaterialData => ({
  material_id: material.material_id,
  resolved_material_id: material.resolver?.resolved_material_id || material.material_id,
  material,
  workspace_index: {
    material_id: material.material_id,
    formula_pretty: material.formula_pretty,
    chemsys: material.chemsys,
    evidence_sections: evidence?.sections?.length || 0,
    evidence_records: (evidence?.sections || []).reduce((acc: number, sec: any) => acc + (sec.records || 0), 0),
    relation_count: 0,
  },
  summary: {
    formula_pretty: material.formula_pretty,
    chemsys: material.chemsys,
    is_stable: material.is_stable,
    energy_above_hull: material.energy_above_hull,
    formation_energy_per_atom: material.formation_energy_per_atom,
    band_gap: material.band_gap,
    is_metal: material.is_metal,
    is_magnetic: material.is_magnetic,
    ordering: material.ordering,
    source_release: material.source_release,
  },
  structure: {
    symmetry: material.symmetry,
    lattice: material.lattice_conventional || material.lattice,
    atomic_position_summary: material.atomic_position_summary || [],
    nsites: material.nsites,
    density: material.density,
    volume: material.volume,
  },
  properties: {
    thermo: {
      energy_above_hull: material.energy_above_hull,
      formation_energy_per_atom: material.formation_energy_per_atom,
      is_stable: material.is_stable,
      decomposes_to: material.decomposes_to,
    },
    electronic: {
      band_gap: material.band_gap,
      is_gap_direct: material.is_gap_direct,
      is_metal: material.is_metal,
      cbm: material.cbm,
      vbm: material.vbm,
      efermi: material.efermi,
    },
    magnetism: {
      is_magnetic: material.is_magnetic,
      ordering: material.ordering,
      total_magnetization_normalized_formula_units: material.total_magnetization_normalized_formula_units,
    },
    mechanical: {
      bulk_modulus_vrh: material.bulk_modulus_vrh,
      shear_modulus_vrh: material.shear_modulus_vrh,
      universal_anisotropy: material.universal_anisotropy,
      homogeneous_poisson: material.homogeneous_poisson,
    },
  },
  evidence,
  graph: {
    nodes: [
      {
        id: material.material_id,
        label: material.formula_pretty || material.material_id,
        type: 'material',
        material_id: material.material_id,
        formula_pretty: material.formula_pretty,
        chemsys: material.chemsys,
      },
      ...(material.elements || []).map((element: string) => ({
        id: element,
        label: element,
        type: 'element',
        symbol: element,
      })),
    ],
    edges: (material.elements || []).map((element: string) => ({
      source: material.material_id,
      target: element,
      type: 'CONTAINS_ELEMENT',
      weight: 1,
    })),
  },
  relation_count: 0,
  actions: [
    { id: 'expand_neighborhood', label: 'Expand graph neighborhood' },
    { id: 'export_subgraph', label: 'Export subgraph JSON' },
  ],
});

const candidateFromMaterial = (data: MaterialData): CandidateMaterial => {
  const summary = data.summary || {};
  const material = data.material || {};
  const structure = data.structure || {};
  const evidenceSections = data.evidence?.sections || [];
  const workspace = data.workspace_index || {};

  return {
    material_id: data.resolved_material_id || data.material_id,
    formula_pretty: summary.formula_pretty || material.formula_pretty || data.material_id,
    chemsys: summary.chemsys || material.chemsys || 'unknown',
    is_stable: summary.is_stable,
    formation_energy_per_atom: summary.formation_energy_per_atom,
    energy_above_hull: summary.energy_above_hull,
    band_gap: summary.band_gap,
    is_metal: summary.is_metal,
    is_magnetic: summary.is_magnetic,
    ordering: summary.ordering,
    density: structure.density,
    crystal_system: structure.symmetry?.crystal_system,
    space_group: structure.symmetry?.symbol || structure.symmetry?.number?.toString(),
    evidence_sections: workspace.evidence_sections ?? evidenceSections.length,
    evidence_records:
      workspace.evidence_records ?? evidenceSections.reduce((acc: number, sec: any) => acc + (sec.records || 0), 0),
    relation_count: data.relation_count ?? workspace.relation_count ?? 0,
    source_release: summary.source_release || material.source_release,
  };
};

let _toastSeq = 0;

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────

export const useStore = create<AppState>((set, get) => ({
  // ── Graph ──────────────────────────────────────────────────────────────
  graphData: { nodes: [], links: [] },
  setGraphData: (data) => set({ graphData: data }),

  // ── Selection ──────────────────────────────────────────────────────────
  selectedNodeId: null,
  selectedMaterialData: null,
  selectedEdgeId: null,
  selectedEdgeData: null,

  // ── Search ─────────────────────────────────────────────────────────────
  searchResults: [],
  searchFilters: {},
  setSearchFilters: (filters) => set({ searchFilters: filters }),

  // ── Candidates ─────────────────────────────────────────────────────────
  candidates: [],
  isCompareOpen: false,
  compareData: null,
  compareLoading: false,

  // ── Agent ──────────────────────────────────────────────────────────────
  chatMessages: [],
  isAgentOpen: false,
  agentLoading: false,
  agentTools: [],

  // ── Screen ─────────────────────────────────────────────────────────────
  screenResult: null,
  isScreenOpen: false,
  screenLoading: false,

  // ── Sessions ───────────────────────────────────────────────────────────
  sessions: [],
  currentSessionId: null,
  isSessionPickerOpen: false,

  // ── Settings ───────────────────────────────────────────────────────────
  health: null,
  catalog: null,
  settings: null,
  providerStatus: null,
  isSettingsOpen: false,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  isOffline: false,

  // ── Research ───────────────────────────────────────────────────────────
  researchStatus: null,
  researchRuns: {},
  isResearchOpen: false,

  // ── UI ─────────────────────────────────────────────────────────────────
  isLoading: false,
  apiAvailable: true,
  error: null,
  toasts: [],
  isFileExplorerOpen: true,
  setFileExplorerOpen: (open) => set({ isFileExplorerOpen: open }),
  graphColorMode: 'type',
  setGraphColorMode: (mode) => set({ graphColorMode: mode }),

  // ── Startup ────────────────────────────────────────────────────────────
  initializeGraph: async () => {
    set({ isLoading: true, error: null, isOffline: false });
    try {
      // Health check first
      const health = await api.getHealth();
      set({ health, apiAvailable: true, isOffline: false });

      // Parallel: catalog + settings
      const [catalog, settingsResponse] = await Promise.allSettled([
        api.getCatalog(),
        api.getSettings(),
      ]);
      if (catalog.status === 'fulfilled') set({ catalog: catalog.value });
      if (settingsResponse.status === 'fulfilled') {
        set({
          settings: settingsResponse.value.settings,
          providerStatus: settingsResponse.value.provider_status,
        });
      }

      // Sessions
      try {
        const sessionsData = await api.getSessions();
        const sessions = sessionsData?.sessions || [];
        set({ sessions });
        if (sessions.length === 0) {
          // Create an initial session
          const newSession = await api.createSession({ title: 'Session 1' });
          set({ sessions: [newSession], currentSessionId: newSession.session_id || newSession.id });
        } else {
          set({ currentSessionId: sessions[0].session_id || sessions[0].id });
        }
      } catch (e) {
        // Sessions not critical — generate a local UUID fallback
        const fallbackId = `local-${Date.now()}`;
        set({ currentSessionId: fallbackId });
      }

      // Graph overview
      const overview = await api.getOverview();
      const rawNodes = overview.nodes || [];
      const rawLinks = overview.edges || overview.links || [];
      set({
        graphData: {
          nodes: rawNodes.map(mapApiNode),
          links: rawLinks.map(mapApiLink),
        },
      });

      // Load a start material
      try {
        const random = await api.getRandomMaterial('curated');
        if (random?.material_id) {
          await get().setSelectedNodeId(random.material_id);
        }
      } catch {
        // Non-critical
      }

      // Load research status (non-critical)
      try {
        const researchStatus = await api.getResearchStatus();
        set({ researchStatus });
      } catch {/* ignore */}

      set({ isLoading: false });
    } catch (error) {
      console.error('Failed to initialize:', error);
      set({ apiAvailable: false, isOffline: true, isLoading: false, error: 'Backend offline' });
    }
  },

  // ── Material selection ────────────────────────────────────────────────
  setSelectedNodeId: async (id) => {
    if (!id) {
      set({ selectedNodeId: null, selectedMaterialData: null });
      return;
    }

    let currentGraph = get().graphData;
    if (currentGraph.nodes.length === 0) {
      try {
        const overview = await api.getOverview();
        const nodes = (overview.nodes || []).map(mapApiNode);
        const links = (overview.edges || overview.links || []).map(mapApiLink);
        currentGraph = { nodes, links };
        set({ graphData: currentGraph });
      } catch {/* ignore */}
    }

    const node = currentGraph.nodes.find((n: any) => n.id === id);
    let targetId = id;
    let isClusterNoRep = false;

    if (node && (node.type === 'cluster' || node.material_count !== undefined)) {
      if (node.representative_material_id) {
        targetId = node.representative_material_id;
      } else {
        isClusterNoRep = true;
      }
    }

    set({ selectedNodeId: id, isLoading: true, error: null, selectedEdgeId: null, selectedEdgeData: null });

    if (isClusterNoRep) {
      set({ isLoading: false, selectedMaterialData: null });
      return;
    }

    try {
      const data = await api.getWorkspace(targetId);
      const nextGraph = data?.graph ? mergeGraphData(get().graphData, data.graph) : get().graphData;
      set({ selectedMaterialData: data, graphData: nextGraph, apiAvailable: true, isLoading: false });
    } catch {
      try {
        const [material, evidence] = await Promise.all([
          api.getMaterial(targetId),
          api.getEvidence(targetId),
        ]);
        const fallback = workspaceFallback(material, evidence);
        const nextGraph = fallback.graph ? mergeGraphData(get().graphData, fallback.graph) : get().graphData;
        set({ selectedMaterialData: fallback, graphData: nextGraph, apiAvailable: true, isLoading: false, error: null });
      } catch (fallbackError) {
        console.error('Material fetch failed:', fallbackError);
        set({ isLoading: false, error: 'Material data unavailable.' });
      }
    }
  },

  // ── Edge selection ────────────────────────────────────────────────────
  setSelectedEdgeId: async (id) => {
    if (!id) { set({ selectedEdgeId: null, selectedEdgeData: null }); return; }
    set({ selectedEdgeId: id, isLoading: true, error: null });
    try {
      const data = await api.getEdge(id);
      set({ selectedEdgeData: data, apiAvailable: true, isLoading: false });
    } catch (error) {
      console.error('Edge fetch failed:', error);
      get().addToast('Failed to load edge data', 'error');
      set({ isLoading: false });
    }
  },

  // ── Neighborhood ──────────────────────────────────────────────────────
  expandNeighborhood: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const neighborhood = await api.getNeighborhood(id);
      set({ graphData: mergeGraphData(get().graphData, neighborhood), apiAvailable: true, isLoading: false });
    } catch (error) {
      console.error('Neighborhood fetch failed:', error);
      get().addToast('Failed to expand neighborhood', 'error');
      set({ isLoading: false });
    }
  },

  // ── Search ────────────────────────────────────────────────────────────
  runSearch: async (query, filters = {}) => {
    if (!query.trim() && Object.keys(filters).length === 0) {
      set({ searchResults: [] });
      return [];
    }
    set({ isLoading: true, error: null });
    try {
      const data = await api.search(query, filters);
      const results = data.results || [];
      set({ searchResults: results, isLoading: false, apiAvailable: true });
      return results;
    } catch (error) {
      console.error('Search failed:', error);
      get().addToast('Search failed', 'error');
      set({ isLoading: false });
      return [];
    }
  },

  // ── Candidates ────────────────────────────────────────────────────────
  addCandidate: (material) => {
    const candidate = candidateFromMaterial(material);
    set((state) => {
      const exists = state.candidates.some((item) => item.material_id === candidate.material_id);
      if (exists) return { isCompareOpen: true };
      return { candidates: [...state.candidates, candidate], isCompareOpen: true };
    });
  },

  removeCandidate: (material_id) => {
    set((state) => {
      const candidates = state.candidates.filter((item) => item.material_id !== material_id);
      return { candidates, isCompareOpen: candidates.length > 0 ? state.isCompareOpen : false };
    });
  },

  clearCandidates: () => set({ candidates: [], isCompareOpen: false, compareData: null }),

  setCompareOpen: (open) => set({ isCompareOpen: open }),

  runCompare: async () => {
    const materialIds = get().candidates.map((c) => c.material_id);
    if (materialIds.length < 2) return;
    set({ compareLoading: true });
    try {
      const data = await api.compare({ material_ids: materialIds, include_evidence: true, include_edges: true });
      set({ compareData: data, compareLoading: false });
    } catch (error) {
      console.error('Compare failed:', error);
      get().addToast('Compare failed — using local data', 'warning');
      set({ compareLoading: false });
    }
  },

  exportCandidates: async (format = 'json') => {
    const materialIds = get().candidates.map((c) => c.material_id);
    if (materialIds.length === 0) return;
    set({ isLoading: true, error: null });
    try {
      const data = await api.exportSubgraph({ material_ids: materialIds, include_evidence: true });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `catalyst-candidates.${format}`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
      set({ isLoading: false });
      get().addToast('Export downloaded', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      get().addToast('Export failed', 'error');
      set({ isLoading: false });
    }
  },

  // ── Agent ─────────────────────────────────────────────────────────────
  setAgentOpen: (open) => set({ isAgentOpen: open }),

  sendAgentMessage: async (text) => {
    const sessionId = get().currentSessionId || 'default';
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    set((state) => ({ chatMessages: [...state.chatMessages, userMsg], agentLoading: true }));

    const material = get().selectedMaterialData;
    const currentWorkspace = material
      ? {
          material_id: material.resolved_material_id || material.material_id,
          visible_material_ids: get().graphData.nodes
            .filter((n: any) => n.type === 'material')
            .slice(0, 20)
            .map((n: any) => n.id),
        }
      : undefined;

    try {
      const response = await api.agentChat({
        session_id: sessionId,
        message: text,
        current_workspace: currentWorkspace,
      });

      const assistantMsg: ChatMessage = {
        id: response.assistant_message?.id || `a-${Date.now()}`,
        role: 'assistant',
        text: response.assistant_message?.text || '',
        citations: response.assistant_message?.citations || [],
        confidence: response.assistant_message?.confidence,
        actions: response.actions || [],
        candidateResults: response.candidate_results || [],
        timestamp: Date.now(),
      };

      set((state) => ({ chatMessages: [...state.chatMessages, assistantMsg], agentLoading: false }));

      // Auto-populate screen results if agent returned candidates
      if (response.candidate_results?.length) {
        set({
          screenResult: {
            requirement: text,
            parsed_requirements: [],
            candidates: response.candidate_results,
            unsupported_requirements: [],
          },
          isScreenOpen: true,
        });
      }
    } catch (error: any) {
      const errMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        text: `Error: ${error?.message || 'Agent unavailable'}`,
        timestamp: Date.now(),
      };
      set((state) => ({ chatMessages: [...state.chatMessages, errMsg], agentLoading: false }));
    }
  },

  executeAgentAction: async (action) => {
    const { type, payload } = action;
    switch (type) {
      case 'open_material':
        if (payload?.material_id) await get().setSelectedNodeId(payload.material_id);
        break;
      case 'show_candidates':
        if (payload?.candidates) {
          set({ screenResult: { requirement: '', parsed_requirements: [], candidates: payload.candidates, unsupported_requirements: [] }, isScreenOpen: true });
        }
        break;
      case 'compare_candidates':
        set({ isCompareOpen: true });
        await get().runCompare();
        break;
      case 'expand_neighborhood':
        if (payload?.material_id) await get().expandNeighborhood(payload.material_id);
        break;
      case 'inspect_edge':
        if (payload?.edge_id) await get().setSelectedEdgeId(payload.edge_id);
        break;
      case 'export':
        await get().exportCandidates();
        break;
      case 'start_research':
        set({ isResearchOpen: true });
        break;
    }
  },

  // ── Screening ─────────────────────────────────────────────────────────
  setScreenOpen: (open) => set({ isScreenOpen: open }),

  runScreen: async (requirement) => {
    set({ screenLoading: true, isScreenOpen: false });
    try {
      const data = await api.screen({
        requirement,
        context: { session_id: get().currentSessionId || undefined },
        options: { limit: 8 },
      });
      set({ screenResult: data, isScreenOpen: true, screenLoading: false });
    } catch (error: any) {
      get().addToast(`Screen failed: ${error?.message || 'Unknown error'}`, 'error');
      set({ screenLoading: false });
    }
  },

  // ── Sessions ──────────────────────────────────────────────────────────
  setSessionPickerOpen: (open) => set({ isSessionPickerOpen: open }),

  loadSessions: async () => {
    try {
      const data = await api.getSessions();
      set({ sessions: data?.sessions || [] });
    } catch {/* ignore */}
  },

  createSession: async () => {
    try {
      const newSession = await api.createSession({ title: `Session ${Date.now()}` });
      const id = newSession.session_id || newSession.id;
      set((state) => ({ sessions: [...state.sessions, newSession], currentSessionId: id, chatMessages: [] }));
      return id;
    } catch {
      const id = `local-${Date.now()}`;
      set({ currentSessionId: id, chatMessages: [] });
      return id;
    }
  },

  switchSession: (id) => {
    set({ currentSessionId: id, chatMessages: [], selectedMaterialData: null, selectedNodeId: null });
  },

  // ── Settings ──────────────────────────────────────────────────────────
  loadSettings: async () => {
    try {
      const data = await api.getSettings();
      set({ settings: data.settings, providerStatus: data.provider_status });
    } catch {/* ignore */}
  },

  updateSettings: async (body) => {
    try {
      const data = await api.patchSettings(body);
      set({ settings: data.settings, providerStatus: data.provider_status });
      get().addToast('Settings saved', 'success');
    } catch (error: any) {
      get().addToast(`Settings save failed: ${error?.message}`, 'error');
    }
  },

  // ── Research ──────────────────────────────────────────────────────────
  setResearchOpen: (open) => set({ isResearchOpen: open }),

  loadResearchStatus: async () => {
    try {
      const status = await api.getResearchStatus();
      set({ researchStatus: status });
    } catch {/* ignore */}
  },

  runResearch: async (query, context) => {
    const sessionId = get().currentSessionId || 'default';
    set({ isLoading: true });
    try {
      const data = await api.researchQuery({ session_id: sessionId, query, context });
      set((state) => ({
        researchRuns: { ...state.researchRuns, [data.run_id]: data },
        isLoading: false,
      }));
      get().addToast(`Research queued: ${data.status}`, 'info');
    } catch (error: any) {
      get().addToast(`Research failed: ${error?.message}`, 'error');
      set({ isLoading: false });
    }
  },

  // ── Toasts ────────────────────────────────────────────────────────────
  addToast: (message, type = 'info') => {
    const id = `toast-${++_toastSeq}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
