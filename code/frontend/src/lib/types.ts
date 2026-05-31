export interface GraphNode {
  id: string;
  name: string;
  type?: string;
  cluster?: string;
  color?: string;
  val?: number;
  isCenter?: boolean;
  material_count?: number;
  representative_material_id?: string;
  fx?: number;
  fy?: number;
  // react-force-graph injected
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  index?: number;
}

export interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  value?: number;
  isInterCluster?: boolean;
  type?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface MaterialData {
  material_id: string;
  resolved_material_id?: string;
  material?: any;
  workspace_index?: any;
  summary?: any;
  structure?: any;
  properties?: any;
  evidence?: {
    material_id?: string;
    resolved_material_id?: string;
    sections?: any[];
  };
  graph?: any;
  relation_count?: number;
  actions?: any[];
}

export interface CandidateMaterial {
  material_id: string;
  formula_pretty: string;
  chemsys: string;
  is_stable?: boolean | null;
  formation_energy_per_atom?: number | null;
  energy_above_hull?: number | null;
  band_gap?: number | null;
  is_metal?: boolean | null;
  is_magnetic?: boolean | null;
  ordering?: string | null;
  density?: number | null;
  crystal_system?: string | null;
  space_group?: string | null;
  evidence_sections: number;
  evidence_records: number;
  relation_count: number;
  source_release?: string | null;
}

export interface EdgeData {
  edge_id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  weight: number;
  confidence?: number;
  recipe_name?: string;
  reason_summary?: string;
  feature_deltas_json?: string;
}
