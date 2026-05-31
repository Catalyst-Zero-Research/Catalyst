# Catalyst API Contract

Status: implementation target

Base URL:

```text
http://127.0.0.1:8766
```

All endpoints return JSON. Errors use a stable shape:

```ts
{
  error: {
    code: string;
    message: string;
    details?: object;
  }
}
```

## Endpoint Groups

### System

```http
GET /health
GET /catalog
GET /settings
GET /settings/schema
PATCH /settings
GET /sessions
POST /sessions
GET /sessions/{session_id}
PATCH /sessions/{session_id}
```

### Materials And Graph

```http
GET /graph/overview
GET /materials/random
GET /materials/{material_id}
GET /materials/{material_id}/workspace
GET /materials/{material_id}/evidence
GET /materials/{material_id}/neighborhood
GET /edges/{edge_id}
GET /search
```

### Candidate And Export

```http
POST /screen
POST /compare
POST /candidate-sets
GET /candidate-sets/{candidate_set_id}
PATCH /candidate-sets/{candidate_set_id}
POST /export/subgraph
POST /export/candidates
```

### Agent

```http
GET /agent/tools
POST /agent/chat
POST /agent/actions/{action_id}/confirm
```

### Research Mode

```http
GET /research/status
POST /research/query
GET /research/runs/{run_id}
POST /research/ingest-url
POST /research/ingest-pdf
POST /research/candidates/{candidate_id}/promote
```

## GET /health

Purpose: quick backend liveness.

Response:

```ts
{
  status: "ok";
  backend: "local-files-duckdb";
  version: string;
}
```

## GET /catalog

Purpose: UI and agent discover dataset capabilities without hardcoded counts.

Response:

```ts
{
  product: "Catalyst";
  source: {
    name: "Materials Project";
    source_release: string;
    snapshot_label: string;
  };
  counts: {
    materials: number;
    elements: number;
    material_element_edges: number;
    material_material_edges: number;
    evidence_rows: number;
    overview_clusters: number;
    curated_start_materials: number;
    research_candidates: number;
  };
  capabilities: {
    local_search: true;
    graph_overview: true;
    material_workspace: true;
    candidate_compare: true;
    export_json: true;
    export_csv: true;
    agent: boolean;
    research_mode: boolean;
    pdf_ingest: boolean;
    url_ingest: boolean;
    multimodal_inputs: boolean;
  };
  provider_status: {
    llm_configured: boolean;
    active_provider: string | null;
    literature_sources: Record<string, "available" | "missing_key" | "disabled" | "not_configured">;
  };
}
```

## GET /settings

Purpose: let the UI read local runtime settings and provider/source readiness.

Response:

```ts
{
  settings: CatalystSettings;
  provider_status: ProviderStatus;
  research_sources: Record<string, "available" | "missing_key" | "disabled" | "not_configured">;
}
```

## PATCH /settings

Purpose: update non-secret local runtime settings under `data/local/settings.json`.

Request:

```ts
{
  runtime?: Partial<RuntimeSettings>;
  providers?: Partial<ProviderSettings>;
  research?: Partial<ResearchSettings>;
  sessions?: Partial<SessionSettings>;
}
```

Response: same shape as `GET /settings`.

API keys are read from environment variables for V1. The backend reports key
status but does not expose secret values.

## GET /graph/overview

Query:

```ts
{
  limit_clusters?: number; // 10..1000, default 250
}
```

Response remains compatible with `docs/frontend-backend-contract.md`.

## GET /materials/random

Query:

```ts
{
  mode?: "curated" | "any";
}
```

Response: `MaterialRecord`.

## GET /materials/{material_id}/workspace

Purpose: primary UI material payload.

Response:

```ts
{
  material_id: string;
  resolved_material_id: string;
  namespace: "materials_project_snapshot" | "materials_project_target_cache" | "external_research";
  material: MaterialRecord;
  workspace_index: WorkspaceIndex;
  summary: MaterialSummary;
  structure: MaterialStructureSummary;
  properties: {
    thermo: object;
    electronic: object;
    magnetism: object;
    mechanical: object;
    dielectric?: object;
    surfaces?: object;
  };
  evidence: EvidencePayload;
  graph: NeighborhoodGraph;
  relation_count: number;
  actions: WorkspaceAction[];
}
```

## GET /search

Query:

```ts
{
  query?: string;
  limit?: number;
  elements?: string;      // comma-separated, e.g. O,Fe
  chemsys?: string;       // e.g. Mn-O
  stable?: boolean;
  metal?: boolean;
  magnetic?: boolean;
  band_gap_min?: number;
  band_gap_max?: number;
  density_max?: number;
  density_min?: number;
  evidence?: string;
  include_research?: boolean;
}
```

Response:

```ts
{
  query: string;
  filters: object;
  results: SearchResult[];
}
```

## POST /screen

Purpose: deterministic candidate screening from a natural-language material
requirement. This can be called by the agent or UI directly.

Request:

```ts
{
  requirement: string;
  context?: {
    session_id?: string;
    current_material_id?: string;
    candidate_set_id?: string;
  };
  options?: {
    limit?: number;
    include_research_candidates?: boolean;
    strict_required_properties?: boolean;
  };
}
```

Response:

```ts
{
  requirement: string;
  parsed_requirements: ParsedRequirement[];
  candidates: CandidateRanking[];
  unsupported_requirements: UnsupportedRequirement[];
  research_suggestion?: ResearchSuggestion;
}
```

## POST /compare

Request:

```ts
{
  material_ids: string[];
  include_evidence?: boolean;
  include_edges?: boolean;
}
```

Response:

```ts
{
  materials: CandidateComparisonRow[];
  columns: ComparisonColumn[];
  evidence: Record<string, EvidencePayload>;
  relation_summaries: RelationSummary[];
}
```

## POST /export/subgraph

Request:

```ts
{
  material_ids: string[];
  include_evidence?: boolean;
  include_edge_details?: boolean;
  format?: "json";
}
```

Response:

```ts
{
  export_id: string;
  source_release: string;
  requested_material_ids: string[];
  nodes: NeighborhoodGraph["nodes"];
  edges: NeighborhoodGraph["edges"];
  evidence?: Record<string, EvidencePayload>;
  edge_details?: Record<string, EdgeDetail>;
}
```

## POST /export/candidates

Request:

```ts
{
  candidate_set_id?: string;
  material_ids?: string[];
  format: "json" | "csv";
}
```

Response:

```ts
{
  export_id: string;
  format: "json" | "csv";
  path: string;
  preview?: object;
}
```

## POST /agent/chat

Request:

```ts
{
  session_id: string;
  message: string;
  current_workspace?: {
    material_id?: string;
    selected_edge_id?: string;
    candidate_set_id?: string;
    visible_material_ids?: string[];
  };
  attachments?: AttachmentRef[];
  stream?: boolean;
}
```

Response:

```ts
{
  session_id: string;
  assistant_message: {
    id: string;
    text: string;
    citations: CitationRef[];
    confidence: "grounded" | "partial" | "research_required";
  };
  actions: AgentUIAction[];
  candidate_results?: CandidateRanking[];
  updated_context: SessionContextSummary;
}
```

Streaming may be added, but the non-streaming response is the required V1
contract.

`/agent/chat` is LLM-first when a working provider is configured: the backend
compiles the current agent JSON/context into Markdown, sends it with the session
messages and tool declarations, executes requested tool calls, then asks the LLM
for the final answer. If no provider key is available or the provider call
fails, the endpoint falls back to the local deterministic controller so the UI
does not break.

## POST /research/query

Request:

```ts
{
  session_id: string;
  query: string;
  context?: {
    current_material_id?: string;
    requirement?: string;
    missing_properties?: string[];
  };
  sources?: Array<"openalex" | "semantic_scholar" | "arxiv" | "crossref" | "pubmed" | "web">;
}
```

Response:

```ts
{
  run_id: string;
  status: "queued" | "running" | "completed" | "failed" | "disabled";
  message: string;
}
```

If research mode is disabled, return `status: "disabled"` with a clear
configuration message.

When research mode is enabled and at least one requested source is available,
the backend performs a lightweight source search, stores source hit records
under `data/local/research_sources/`, and the full run can be read from
`GET /research/runs/{run_id}`.

