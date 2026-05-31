// ── Catalyst Bridge: Normalizers ─────────────────────────────────────────────
// Convert raw backend payloads to typed view models.
// No component should ever reach into raw backend shapes.

import type {
  GraphNodeVM,
  GraphEdgeVM,
  WorkspaceVM,
  EvidenceVM,
  EvidenceItemVM,
  MetricVM,
  StatusBadgeVM,
  StructureSummaryVM,
  AgentMessageVM,
  CandidateRowVM,
  CompareVM,
  EdgeVM,
  ResearchSourceVM,
  ResearchVM,
  CatalystCommand,
  SessionVM,
  SystemStatusVM,
} from './viewModels';

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeNum(v: unknown, decimals = 3): string | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return n.toFixed(decimals);
}

// ── Node palette (matches spec tokens) ───────────────────────────────────────

const NODE_COLORS = {
  cluster: '#c5a3ff',
  material: '#f0a36f',
  element: '#8fbcff',
  external: '#f0c36a',
  unknown: '#52525c',
} as const;

export function normalizeNode(n: any): GraphNodeVM {
  const type: GraphNodeVM['type'] =
    n.type === 'cluster' || n.material_count !== undefined
      ? 'cluster'
      : n.type === 'element'
        ? 'element'
        : n.type === 'material'
          ? 'material'
          : 'unknown';

  let val: number;
  let color: string;

  if (n.namespace === 'external_research') {
    val = 5;
    color = NODE_COLORS.external;
  } else if (type === 'cluster') {
    const mc = n.material_count || 1;
    val = Math.min(Math.max(4 + Math.sqrt(mc) * 0.56, 5), 15);
    color = NODE_COLORS.cluster;
  } else if (type === 'material') {
    val = 6;
    color = NODE_COLORS.material;
  } else if (type === 'element') {
    val = 4.5;
    color = NODE_COLORS.element;
  } else {
    val = n.val || 4;
    color = NODE_COLORS.unknown;
  }

  return {
    id: n.id,
    name: n.label || n.formula_pretty || n.id,
    type,
    val,
    color,
    cluster: n.cluster_id || (n.chemsys ? `chemsys:${n.chemsys}` : undefined),
    formula_pretty: n.formula_pretty,
    chemsys: n.chemsys,
    energy_above_hull: n.energy_above_hull,
    band_gap: n.band_gap,
    is_metal: n.is_metal,
    is_stable: n.is_stable,
    material_count: n.material_count,
    namespace: n.namespace,
    representative_material_id: n.representative_material_id,
    elements: n.elements,
  };
}

export function normalizeEdge(l: any): GraphEdgeVM {
  const source = typeof l.source === 'object' ? l.source.id : l.source;
  const target = typeof l.target === 'object' ? l.target.id : l.target;
  const type = l.type || l.edge_type;
  return {
    id: l.id || l.edge_id || (type === 'CONTAINS_ELEMENT' ? `element:${source}:${target}` : `${source}:${target}:${type || 'edge'}`),
    source,
    target,
    type,
    value: l.weight || 1,
    isInterCluster: l.isInterCluster ?? false,
    shared_elements: l.shared_elements,
    confidence: l.confidence,
    recipe_name: l.recipe_name,
    reason_summary: l.reason_summary,
  };
}

// ── Workspace / Material ──────────────────────────────────────────────────────

function normalizeNamespace(ns: string | undefined): WorkspaceVM['namespace'] {
  if (ns === 'materials_project_snapshot') return 'materials_project_snapshot';
  if (ns === 'materials_project_target_cache') return 'materials_project_target_cache';
  if (ns === 'external_research') return 'external_research';
  return 'unknown';
}

function makeStatusBadges(summary: any, material: any): StatusBadgeVM[] {
  const badges: StatusBadgeVM[] = [];
  const ns = material?.namespace;
  if (ns === 'external_research') {
    badges.push({ label: 'External research', variant: 'warning' });
  } else if (ns === 'materials_project_snapshot' || ns === 'materials_project_target_cache') {
    badges.push({ label: 'Materials Project', variant: 'info' });
  }
  if (summary?.is_stable === true) badges.push({ label: 'Stable', variant: 'success' });
  else if (summary?.is_stable === false) badges.push({ label: 'Metastable', variant: 'warning' });
  if (summary?.is_metal === true) badges.push({ label: 'Metal', variant: 'default' });
  else if (summary?.is_metal === false) badges.push({ label: 'Non-metal', variant: 'default' });
  return badges;
}

function makeMetrics(summary: any, structure: any, props: any): MetricVM[] {
  const metrics: MetricVM[] = [];

  const eah = summary?.energy_above_hull ?? summary?.formation_energy_per_atom;
  metrics.push({
    label: 'Formation energy',
    value: safeNum(summary?.formation_energy_per_atom),
    unit: 'eV/atom',
    status: summary?.is_stable === true ? 'Stable' : summary?.is_stable === false ? 'Metastable' : undefined,
    statusVariant: summary?.is_stable === true ? 'success' : summary?.is_stable === false ? 'warning' : undefined,
  });

  metrics.push({
    label: 'Hull energy',
    value: safeNum(summary?.energy_above_hull),
    unit: 'eV/atom',
    status: eah !== undefined && eah !== null ? (eah <= 0.025 ? 'On hull' : eah <= 0.1 ? 'Near hull' : 'Unstable') : undefined,
    statusVariant: eah !== undefined && eah !== null ? (eah <= 0.025 ? 'success' : eah <= 0.1 ? 'warning' : 'danger') : undefined,
  });

  metrics.push({
    label: 'Band gap',
    value: safeNum(summary?.band_gap),
    unit: 'eV',
    status: summary?.is_metal ? 'Metal' : summary?.is_metal === false ? 'Non-metal' : undefined,
    statusVariant: 'info',
  });

  metrics.push({
    label: 'Density',
    value: safeNum(structure?.density),
    unit: 'g/cm³',
  });

  metrics.push({
    label: 'Sites',
    value: structure?.nsites ?? null,
  });

  const bm = props?.mechanical?.bulk_modulus_vrh;
  if (bm !== undefined && bm !== null) {
    metrics.push({ label: 'Bulk modulus', value: safeNum(bm), unit: 'GPa' });
  }

  return metrics.filter((m) => m.value !== null && m.value !== 'N/A');
}

function makeStructure(structure: any): StructureSummaryVM {
  return {
    crystalSystem: structure?.symmetry?.crystal_system,
    spaceGroupSymbol: structure?.symmetry?.symbol,
    spaceGroupNumber: structure?.symmetry?.number,
    nsites: structure?.nsites,
    density: structure?.density,
    volume: structure?.volume,
    lattice: structure?.lattice_conventional || structure?.lattice,
    atomicPositionSummary: structure?.atomic_position_summary || [],
  };
}

function makeEvidence(evidenceSections: any[]): EvidenceVM {
  const sections: EvidenceItemVM[] = (evidenceSections || []).map((sec: any) => ({
    sectionName: sec.section || sec.name || 'Unknown',
    records: sec.records || 0,
    source: sec.source,
    file: sec.file,
    doi: sec.doi,
    url: sec.url,
  }));
  return {
    sections,
    totalSections: sections.length,
    totalRecords: sections.reduce((acc, s) => acc + s.records, 0),
  };
}

export function normalizeWorkspace(data: any, isFallback = false): WorkspaceVM {
  const summary = data.summary || {};
  const material = data.material || {};
  const structure = data.structure || {};
  const props = data.properties || {};
  const evidenceSections = data.evidence?.sections || [];
  const workspace_index = data.workspace_index || {};

  const matId = data.material_id || workspace_index.material_id;
  const resolvedId = data.resolved_material_id || workspace_index.resolved_material_id || matId;
  const formula = summary.formula_pretty || material.formula_pretty || workspace_index.formula_pretty || resolvedId;
  const chemsys = summary.chemsys || material.chemsys || workspace_index.chemsys || '';
  const ns = normalizeNamespace(material.namespace);

  const actions: CatalystCommand[] = [
    { type: 'expand_neighborhood', materialId: resolvedId },
    { type: 'export_subgraph', materialIds: [resolvedId], includeEvidence: true },
    { type: 'add_candidate', materialId: resolvedId },
    { type: 'ask_agent', message: `Tell me about ${formula}` },
  ];

  return {
    materialId: matId,
    resolvedMaterialId: resolvedId,
    namespace: ns,
    title: formula,
    subtitle: chemsys,
    isFallback,
    statusBadges: makeStatusBadges(summary, material),
    metrics: makeMetrics(summary, structure, props),
    structure: makeStructure(structure),
    evidence: makeEvidence(evidenceSections),
    relationCount: data.relation_count ?? workspace_index.relation_count ?? 0,
    actions,
    elements: material.elements || [],
    raw: data,
  };
}

export function normalizeFallbackWorkspace(material: any, evidence: any): WorkspaceVM {
  const evidenceSections = evidence?.sections || [];
  const fakeData = {
    material_id: material.material_id,
    resolved_material_id: material.material_id,
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
    },
    material: { ...material },
    structure: {
      symmetry: material.symmetry,
      lattice: material.lattice_conventional || material.lattice,
      atomic_position_summary: material.atomic_position_summary || [],
      nsites: material.nsites,
      density: material.density,
      volume: material.volume,
    },
    properties: {},
    evidence: { sections: evidenceSections },
    relation_count: 0,
  };
  return normalizeWorkspace(fakeData, true);
}

// ── Candidate ─────────────────────────────────────────────────────────────────

export function normalizeCandidateRow(data: WorkspaceVM): CandidateRowVM {
  return {
    material_id: data.resolvedMaterialId,
    formula_pretty: data.title,
    chemsys: data.subtitle,
    is_stable: (data.raw as any)?.summary?.is_stable,
    energy_above_hull: (data.raw as any)?.summary?.energy_above_hull,
    formation_energy_per_atom: (data.raw as any)?.summary?.formation_energy_per_atom,
    band_gap: (data.raw as any)?.summary?.band_gap,
    is_metal: (data.raw as any)?.summary?.is_metal,
    is_magnetic: (data.raw as any)?.summary?.is_magnetic,
    ordering: (data.raw as any)?.summary?.ordering,
    density: data.structure.density,
    crystal_system: data.structure.crystalSystem,
    space_group: data.structure.spaceGroupSymbol,
    evidence_sections: data.evidence.totalSections,
    evidence_records: data.evidence.totalRecords,
    relation_count: data.relationCount,
    source_release: (data.raw as any)?.summary?.source_release || (data.raw as any)?.material?.source_release,
  };
}

export function normalizeCandidateFromRaw(c: any): CandidateRowVM {
  return {
    material_id: c.material_id || c.resolved_material_id,
    formula_pretty: c.formula_pretty || c.material_id,
    chemsys: c.chemsys || 'unknown',
    is_stable: c.is_stable,
    energy_above_hull: c.energy_above_hull,
    formation_energy_per_atom: c.formation_energy_per_atom,
    band_gap: c.band_gap,
    is_metal: c.is_metal,
    is_magnetic: c.is_magnetic,
    ordering: c.ordering,
    density: c.density,
    crystal_system: c.crystal_system,
    space_group: c.space_group,
    evidence_sections: c.evidence_sections ?? 0,
    evidence_records: c.evidence_records ?? 0,
    relation_count: c.relation_count ?? 0,
    source_release: c.source_release,
    property_groups: c.property_groups,
  };
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export function normalizeAgentMessage(msg: any, role: 'user' | 'assistant' | 'error'): AgentMessageVM {
  return {
    id: msg.id || `msg-${Date.now()}-${Math.random()}`,
    role,
    text: msg.text || msg.content || '',
    citations: msg.citations || [],
    confidence: msg.confidence,
    actions: msg.actions || [],
    uiActions: msg.ui_actions || msg.uiActions || [],
    candidateResults: (msg.candidateResults || []).map(normalizeCandidateFromRaw),
    timestamp: msg.timestamp || Date.now(),
  };
}

// ── Edge ──────────────────────────────────────────────────────────────────────

export function normalizeEdgeDetail(data: any): EdgeVM {
  let featureDeltas: unknown = undefined;
  try {
    if (typeof data.feature_delta === 'string') featureDeltas = JSON.parse(data.feature_delta);
    else if (data.feature_delta && typeof data.feature_delta === 'object') featureDeltas = data.feature_delta;
    else if (typeof data.feature_deltas_json === 'string') featureDeltas = JSON.parse(data.feature_deltas_json);
    else if (data.feature_deltas_json && typeof data.feature_deltas_json === 'object') featureDeltas = data.feature_deltas_json;
  } catch {
    // malformed JSON — hide it
  }

  return {
    edgeId: data.edge_id || data.id,
    type: data.type || data.edge_type,
    source: data.source || data.source_id,
    target: data.target || data.target_id,
    recipe: data.recipe || data.recipe_name,
    weight: data.weight,
    confidence: data.confidence,
    reasonSummary: data.reason_summary || data.reason,
    featureDeltas,
    raw: data,
  };
}

// ── Research ──────────────────────────────────────────────────────────────────

function sourceLabel(key: string): string {
  const map: Record<string, string> = {
    semantic_scholar: 'Semantic Scholar',
    crossref: 'Crossref',
    arxiv: 'arXiv',
    materials_project: 'Materials Project API',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
  };
  return map[key] || key;
}

export function normalizeResearch(status: any): ResearchVM {
  const sources: ResearchSourceVM[] = Object.entries(status?.sources || {}).map(([key, val]: [string, any]) => ({
    key,
    label: sourceLabel(key),
    status: (val?.status || val || 'not_configured') as ResearchSourceVM['status'],
  }));

  const missingKeys = sources.filter((s) => s.status === 'missing_key').map((s) => s.key);
  const isEnabled = sources.some((s) => s.status === 'available');

  return {
    isEnabled,
    missingKeys,
    sources,
    activeRunId: status?.active_run_id,
    runStatus: status?.run_status,
  };
}

// ── System Status ─────────────────────────────────────────────────────────────

export function normalizeSystemStatus(health: any, catalog: any, settings: any): SystemStatusVM {
  const providerStatus = settings?.provider_status || {};
  const researchSources: Record<string, SystemStatusVM['provider']['researchSources'][string]> = {};
  const catalogCounts = catalog?.counts || {};
  const catalogSource = catalog?.source || {};

  for (const [k, v] of Object.entries(providerStatus?.research_sources || {})) {
    researchSources[k] = ((v as any)?.status || v || 'not_configured') as SystemStatusVM['provider']['researchSources'][string];
  }

  return {
    api: health ? 'online' : 'offline',
    backendLabel: health?.backend || 'Catalyst backend',
    version: health?.version,
    catalog: catalog
      ? {
          materials: catalog.materials ?? catalogCounts.materials ?? 0,
          evidenceRows: catalog.evidence_rows ?? catalogCounts.evidence_rows ?? 0,
          clusters: catalog.clusters ?? catalogCounts.overview_clusters ?? catalogCounts.clusters ?? 0,
          sourceRelease: catalog.source_release ?? catalogSource.source_release ?? '',
        }
      : undefined,
    provider: {
      llmConfigured: providerStatus?.llm_configured ?? false,
      activeProvider: providerStatus?.active_provider || null,
      researchSources,
    },
  };
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function normalizeSession(s: any): SessionVM {
  return {
    id: s.session_id || s.id,
    title: s.title || s.session_id || s.id,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

// ── Compare ──────────────────────────────────────────────────────────────────

export function normalizeCompare(data: any): CompareVM {
  return {
    materials: data.materials || [],
    groups: data.groups || [],
    columns: data.columns || [],
    comparison_table: data.comparison_table,
    shared_elements: data.shared_elements,
    common_properties: data.common_properties,
    evidence: data.evidence,
    relation_summaries: data.relation_summaries,
  };
}
