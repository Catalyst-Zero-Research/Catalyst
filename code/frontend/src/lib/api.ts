const defaultApiBase = window.location.port === '5173' ? 'http://127.0.0.1:8766' : '';
export const API_BASE = import.meta.env.VITE_CATALYST_API_BASE || defaultApiBase;

// ─── typed fetch helper ────────────────────────────────────────────────────
async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail || body?.error?.message || detail;
    } catch {/* ignore */}
    throw Object.assign(new Error(detail), { status: res.status });
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const jsonPatch = (body: unknown) => ({
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ─── System ────────────────────────────────────────────────────────────────
export const api = {
  // Startup health check
  getHealth: () =>
    apiFetch('/health'),

  // Dataset capabilities / counts
  getCatalog: () =>
    apiFetch('/catalog'),

  // Runtime settings + provider / research source status
  getSettings: () =>
    apiFetch('/settings'),

  getSettingsSchema: () =>
    apiFetch('/settings/schema'),

  patchSettings: (body: Record<string, unknown>) =>
    apiFetch('/settings', jsonPatch(body)),

  // ─── Graph ──────────────────────────────────────────────────────────────
  getOverview: (limit_clusters = 250) =>
    apiFetch(`/graph/overview?limit_clusters=${limit_clusters}`),

  getGraphView: (limit_nodes = 500, mode = 'overview', include_elements = false, include_clusters = false) => {
    const params = new URLSearchParams({
      mode,
      limit_nodes: String(limit_nodes),
      include_elements: String(include_elements),
      include_clusters: String(include_clusters),
    });
    return apiFetch(`/graph/view?${params}`);
  },

  getMaterialGraph: (limit_materials = 10000, include_elements = true, include_clusters = true) => {
    const params = new URLSearchParams({
      limit_materials: String(limit_materials),
      include_elements: String(include_elements),
      include_clusters: String(include_clusters),
    });
    return apiFetch(`/graph/materials?${params}`);
  },
    
  getGraphNode: (node_id: string) =>
    apiFetch(`/graph/nodes/${encodeURIComponent(node_id)}`),

  getRandomMaterial: (mode: 'curated' | 'any' = 'curated') =>
    apiFetch(`/materials/random?mode=${mode}`),

  getMaterial: (material_id: string) =>
    apiFetch(`/materials/${encodeURIComponent(material_id)}`),

  getWorkspace: (material_id: string) =>
    apiFetch(`/materials/${encodeURIComponent(material_id)}/workspace`),

  getEvidence: (material_id: string) =>
    apiFetch(`/materials/${encodeURIComponent(material_id)}/evidence`),

  getNeighborhood: (material_id: string, depth = 1, limit_nodes = 80) => {
    const params = new URLSearchParams({
      depth: String(depth),
      limit_nodes: String(limit_nodes),
    });
    return apiFetch(`/materials/${encodeURIComponent(material_id)}/neighborhood?${params}`);
  },

  getStructure: (material_id: string) =>
    apiFetch(`/materials/${encodeURIComponent(material_id)}/structure`),

  getMaterialDetails: (
    material_id: string,
    options: { sections?: string[]; limit?: number; downsample?: boolean } = {},
  ) => {
    const params = new URLSearchParams();
    if (options.sections?.length) params.set('sections', options.sections.join(','));
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.downsample !== undefined) params.set('downsample', String(options.downsample));
    const query = params.toString();
    return apiFetch(`/materials/${encodeURIComponent(material_id)}/details${query ? `?${query}` : ''}`);
  },

  // Edge IDs can contain ':' — backend uses :path param so encode carefully
  getEdge: (edge_id: string) =>
    apiFetch(`/edges/${encodeURIComponent(edge_id)}`),

  // ─── Search ─────────────────────────────────────────────────────────────
  search: (query: string, filters: Record<string, unknown> = {}) => {
    const params = new URLSearchParams({ limit: '20' });
    if (query) params.set('query', query);
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params.set(k, String(v));
    });
    return apiFetch(`/search?${params}`);
  },

  // ─── Screening & Compare ────────────────────────────────────────────────
  screen: (body: {
    requirement: string;
    context?: { session_id?: string; current_material_id?: string; candidate_set_id?: string };
    options?: { limit?: number; include_research_candidates?: boolean; strict_required_properties?: boolean };
  }) => apiFetch('/screen', json(body)),

  compare: (body: { material_ids: string[]; include_evidence?: boolean; include_edges?: boolean }) =>
    apiFetch('/compare', json(body)),

  // ─── Candidate Sets ─────────────────────────────────────────────────────
  createCandidateSet: (body: { session_id: string; title: string; requirement?: string; candidates?: unknown[] }) =>
    apiFetch('/candidate-sets', json(body)),

  getCandidateSet: (id: string) =>
    apiFetch(`/candidate-sets/${id}`),

  patchCandidateSet: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/candidate-sets/${id}`, jsonPatch(body)),

  // ─── Export ─────────────────────────────────────────────────────────────
  exportSubgraph: (body: { material_ids: string[]; include_evidence?: boolean; include_edge_details?: boolean; format?: 'json' }) =>
    apiFetch('/export/subgraph', json(body)),

  exportCandidates: (body: { candidate_set_id?: string; material_ids?: string[]; format: 'json' | 'csv' }) =>
    apiFetch('/export/candidates', json(body)),

  // ─── Agent ──────────────────────────────────────────────────────────────
  getAgentTools: () =>
    apiFetch('/agent/tools'),

  agentChat: (body: {
    session_id: string;
    message: string;
    current_workspace?: { material_id?: string; selected_edge_id?: string; candidate_set_id?: string; visible_material_ids?: string[] };
    attachments?: unknown[];
    stream?: boolean;
  }) => apiFetch('/agent/chat', json(body)),

  confirmAction: (action_id: string) =>
    apiFetch(`/agent/actions/${action_id}/confirm`, json({})),

  // ─── Sessions ───────────────────────────────────────────────────────────
  getSessions: () =>
    apiFetch('/sessions'),

  createSession: (body: Record<string, unknown> = {}) =>
    apiFetch('/sessions', json(body)),

  getSession: (id: string) =>
    apiFetch(`/sessions/${id}`),

  patchSession: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/sessions/${id}`, jsonPatch(body)),

  // ─── Research ───────────────────────────────────────────────────────────
  getResearchStatus: () =>
    apiFetch('/research/status'),

  researchQuery: (body: {
    session_id: string;
    query: string;
    context?: { current_material_id?: string; requirement?: string; missing_properties?: string[] };
    sources?: string[];
  }) => apiFetch('/research/query', json(body)),

  getResearchRun: (run_id: string) =>
    apiFetch(`/research/runs/${run_id}`),
};
