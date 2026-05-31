// ── Catalyst Bridge View Models ──────────────────────────────────────────────
// All visual components consume these shapes, never raw backend payloads.

export type SystemStatusVM = {
  api: 'online' | 'offline' | 'checking';
  backendLabel: string;
  version?: string;
  catalog?: {
    materials: number;
    evidenceRows: number;
    clusters: number;
    sourceRelease: string;
  };
  provider: {
    llmConfigured: boolean;
    activeProvider: string | null;
    researchSources: Record<string, 'available' | 'missing_key' | 'disabled' | 'not_configured'>;
  };
};

export type GraphNodeVM = {
  id: string;
  name: string;
  type: 'material' | 'cluster' | 'element' | 'unknown';
  val: number;
  color: string;
  cluster?: string;
  // raw fields for tooltip
  formula_pretty?: string;
  chemsys?: string;
  energy_above_hull?: number;
  band_gap?: number;
  is_metal?: boolean;
  is_stable?: boolean;
  material_count?: number;
  namespace?: string;
  representative_material_id?: string;
  elements?: string[];
};

export type GraphNodeDetail = {
  id: string
  node_id: string
  type: 'material' | 'cluster' | 'element'
  label: string
  title: string
  subtitle?: string
  source_release?: string
  summary: Record<string, unknown>
  metrics?: Record<string, unknown>
  elements?: unknown[]
  examples?: unknown[]
  actions?: { id: string; label: string }[]
}

export type GraphEdgeVM = {
  id: string;
  source: string;
  target: string;
  type?: string;
  value: number;
  isInterCluster?: boolean;
  shared_elements?: string[];
  confidence?: number;
  recipe_name?: string;
  reason_summary?: string;
};

export type GraphGroupVM = {
  id: string;
  name: string;
  query: string;
  color: string;
};

export type GraphSettingsVM = {
  search: string;
  showClusters: boolean;
  showMaterials: boolean;
  showElements: boolean;
  showOrphans: boolean;
  showLabels: boolean;
  showArrows: boolean;
  showEdgeLabels: boolean;
  nodeSize: number;
  linkThickness: number;
  textFadeThreshold: number;
  collisionPadding: number;
  collisionStrength: number;
  collisionIterations: number;
  chargeDistanceMin: number;
  chargeDistanceMax: number;
  localRepelBoost: number;
  clusterSpread: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  motion: 'still' | 'subtle' | 'active';
  edgeDensity: 'sparse' | 'normal' | 'dense';
  localDepth: number;
  groups: GraphGroupVM[];
};

export type GraphVM = {
  nodes: GraphNodeVM[];
  edges: GraphEdgeVM[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  colorMode: 'type' | 'stability' | 'band_gap' | 'element';
  settings: GraphSettingsVM;
  counts: {
    clusters: number;
    materials: number;
    elements: number;
    edges: number;
  };
};

export type StatusBadgeVM = {
  label: string;
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info';
};

export type MetricVM = {
  label: string;
  value: string | number | null;
  unit?: string;
  status?: string;
  statusVariant?: 'success' | 'warning' | 'danger' | 'info' | 'muted';
};

export type StructureSummaryVM = {
  crystalSystem?: string;
  spaceGroupSymbol?: string;
  spaceGroupNumber?: number;
  nsites?: number;
  density?: number;
  volume?: number;
  lattice?: unknown;
  atomicPositionSummary?: unknown[];
};

export type StructureSiteVM = {
  index: number;
  label: string;
  element?: string;
  abc?: number[];
  xyz?: number[];
  species?: unknown;
};

export type Structure3DVM = {
  material_id: string;
  resolved_material_id: string;
  formula_pretty?: string;
  chemsys?: string;
  source_release?: string;
  symmetry?: Record<string, unknown> | null;
  lattice?: Record<string, unknown>;
  sites: StructureSiteVM[];
  nsites?: number;
  density?: number;
  volume?: number;
  structure?: Record<string, unknown> | null;
  has_full_structure: boolean;
  message?: string | null;
};

export type EvidenceItemVM = {
  sectionName: string;
  records: number;
  source?: string;
  file?: string;
  doi?: string;
  url?: string;
};

export type EvidenceVM = {
  sections: EvidenceItemVM[];
  totalSections: number;
  totalRecords: number;
};

export type CatalystCommand =
  | { type: 'open_material'; materialId: string }
  | { type: 'expand_neighborhood'; materialId: string }
  | { type: 'inspect_edge'; edgeId: string }
  | { type: 'screen_candidates'; requirement: string }
  | { type: 'show_candidates'; candidates: unknown[] }
  | { type: 'compare_candidates'; materialIds?: string[] }
  | { type: 'add_candidate'; materialId: string }
  | { type: 'remove_candidate'; materialId: string }
  | { type: 'export_subgraph'; materialIds?: string[]; includeEvidence?: boolean }
  | { type: 'start_research'; query: string; context?: unknown }
  | { type: 'open_settings' }
  | { type: 'open_session'; sessionId: string }
  | { type: 'ask_agent'; message: string };

export type WorkspaceVM = {
  materialId: string;
  resolvedMaterialId: string;
  namespace: 'materials_project_snapshot' | 'materials_project_target_cache' | 'external_research' | 'unknown';
  title: string;
  subtitle: string;
  isFallback: boolean;
  statusBadges: StatusBadgeVM[];
  metrics: MetricVM[];
  structure: StructureSummaryVM;
  evidence: EvidenceVM;
  relationCount: number;
  actions: CatalystCommand[];
  elements: string[];
  raw?: unknown;
};

export type AgentMessageVM = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  citations?: Array<{ id: string; label: string; url?: string }>;
  confidence?: 'grounded' | 'partial' | 'research_required';
  actions?: Array<{ id: string; type: string; label: string; payload?: unknown }>;
  uiActions?: Array<{ type: string; material_id?: string; edge_id?: string; duration_ms?: number; scale?: number }>;
  candidateResults?: CandidateRowVM[];
  timestamp: number;
};

export type AgentVM = {
  sessionId: string | null;
  mode: 'deterministic_tool_agent' | 'provider_backed' | 'unknown';
  messages: AgentMessageVM[];
  isRunning: boolean;
  context: {
    materialId?: string;
    selectedEdgeId?: string;
    candidateSetId?: string;
    visibleMaterialIds: string[];
  };
};

export type CandidateRowVM = {
  material_id: string;
  formula_pretty: string;
  chemsys: string;
  is_stable?: boolean;
  energy_above_hull?: number;
  formation_energy_per_atom?: number;
  band_gap?: number;
  is_metal?: boolean;
  is_magnetic?: boolean;
  ordering?: string;
  density?: number;
  crystal_system?: string;
  space_group?: string;
  evidence_sections: number;
  evidence_records: number;
  relation_count: number;
  source_release?: string;
  property_groups?: PropertyGroupVM[];
};

export type PropertyMetricVM = {
  label: string;
  value: unknown;
  unit?: string | null;
  source?: string;
  available?: boolean;
};

export type PropertyGroupVM = {
  key: string;
  label: string;
  items: PropertyMetricVM[];
  available_count?: number;
  total_count?: number;
  availability?: number;
};

export type CompareVM = {
  materials: unknown[];
  groups?: Array<{ key: string; label: string }>;
  columns?: Array<{ key: string; label: string }>;
  comparison_table?: unknown[];
  shared_elements?: string[];
  common_properties?: unknown;
  evidence?: Record<string, unknown>;
  relation_summaries?: unknown[];
};

export type CandidateSetVM = {
  id?: string;
  title: string;
  candidates: CandidateRowVM[];
  compare?: CompareVM;
  canCompare: boolean;
  canExport: boolean;
};

export type EdgeVM = {
  edgeId: string;
  type?: string;
  source: string;
  target: string;
  recipe?: string;
  weight?: number;
  confidence?: number;
  reasonSummary?: string;
  featureDeltas?: unknown;
  raw?: unknown;
};

export type ResearchSourceVM = {
  key: string;
  status: 'available' | 'missing_key' | 'disabled' | 'not_configured';
  label: string;
};

export type ResearchVM = {
  isEnabled: boolean;
  missingKeys: string[];
  sources: ResearchSourceVM[];
  activeRunId?: string;
  runStatus?: 'pending' | 'running' | 'completed' | 'failed';
  runResults?: unknown;
};

export type SessionVM = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SettingsVM = {
  backendStatus: 'online' | 'offline' | 'checking';
  version?: string;
  catalog?: { materials: number; clusters: number; evidenceRows: number };
  provider: {
    llmConfigured: boolean;
    activeProvider: string | null;
  };
  researchSources: ResearchSourceVM[];
  rawSettings?: Record<string, unknown>;
};
