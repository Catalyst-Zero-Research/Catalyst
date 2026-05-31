from __future__ import annotations

import os
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from catalyst.agent_tools import CatalystAgentTools, tool_catalog
from catalyst.candidate_sets import CandidateSetStore
from catalyst.contracts import (
    AgentChatResponse,
    AgentToolCatalogResponse,
    CandidateExportResponse,
    CatalogResponse,
    CompareResponse,
    FlexibleResponse,
    HealthResponse,
    ResearchQueryResponse,
    ResearchStatusResponse,
    ScreenResponse,
    SearchResponse,
    SessionListResponse,
    SettingsResponse,
)
from catalyst.exporters import write_candidate_csv, write_json_export
from catalyst.local_store import LocalCatalystStore
from catalyst.research_mode import ResearchStore, research_status
from catalyst.screening import screen_candidates
from catalyst.session_store import SessionStore
from catalyst.settings import (
    CatalystSettings,
    configured_provider_status,
    load_settings,
    research_source_status,
    save_settings,
    settings_schema,
)
from catalyst.util import find_repo_root


def _repo_root() -> Path:
    configured = os.getenv("CATALYST_REPO_ROOT")
    if configured:
        return Path(configured)

    return find_repo_root(Path(__file__).resolve())


@lru_cache(maxsize=1)
def get_store() -> LocalCatalystStore:
    return LocalCatalystStore(_repo_root(), os.getenv("CATALYST_SOURCE_RELEASE", "v2025.09.25"))


@lru_cache(maxsize=1)
def cached_store_catalog() -> dict:
    return get_store().catalog()


@lru_cache(maxsize=64)
def cached_graph_overview(limit_clusters: int) -> dict:
    return get_store().graph_overview(limit_clusters=limit_clusters)


@lru_cache(maxsize=64)
def cached_graph_view(mode: str, limit_nodes: int, include_elements: bool, include_clusters: bool) -> dict:
    return get_store().graph_view(
        limit_nodes=limit_nodes,
        mode=mode,
        include_elements=include_elements,
        include_clusters=include_clusters,
    )


@lru_cache(maxsize=32)
def cached_graph_materials(limit_materials: int, include_elements: bool, include_clusters: bool) -> dict:
    return get_store().graph_materials(
        limit_materials=limit_materials,
        include_elements=include_elements,
        include_clusters=include_clusters,
    )


@lru_cache(maxsize=2048)
def cached_material(material_id: str) -> dict | None:
    return get_store().get_material(material_id)


@lru_cache(maxsize=1024)
def cached_evidence(material_id: str) -> dict:
    return get_store().evidence(material_id)


@lru_cache(maxsize=1024)
def cached_neighborhood(material_id: str, depth: int, limit_nodes: int) -> dict:
    return get_store().neighborhood(material_id, depth=depth, limit_nodes=limit_nodes)


@lru_cache(maxsize=1024)
def cached_structure(material_id: str) -> dict | None:
    return get_store().structure(material_id)


@lru_cache(maxsize=1024)
def cached_material_details(material_id: str, sections_key: str, limit: int, downsample: bool) -> dict | None:
    sections = _split_csv(sections_key) or None
    return get_store().material_details(material_id, sections=sections, limit=limit, downsample=downsample)


@lru_cache(maxsize=1024)
def cached_workspace(material_id: str) -> dict | None:
    return get_store().workspace(material_id)


@lru_cache(maxsize=2048)
def cached_edge(edge_id: str) -> dict | None:
    return get_store().edge(edge_id)


def clear_read_caches() -> None:
    cached_store_catalog.cache_clear()
    cached_graph_overview.cache_clear()
    cached_graph_view.cache_clear()
    cached_graph_materials.cache_clear()
    cached_material.cache_clear()
    cached_evidence.cache_clear()
    cached_neighborhood.cache_clear()
    cached_structure.cache_clear()
    cached_material_details.cache_clear()
    cached_workspace.cache_clear()
    cached_edge.cache_clear()


@lru_cache(maxsize=1)
def get_settings():
    return load_settings(_repo_root())


def get_sessions() -> SessionStore:
    return SessionStore(_repo_root())


def get_candidate_sets() -> CandidateSetStore:
    return CandidateSetStore(_repo_root())


def get_research_store() -> ResearchStore:
    return ResearchStore(_repo_root())


def get_agent_tools() -> CatalystAgentTools:
    return CatalystAgentTools(_repo_root(), get_store(), get_settings())


app = FastAPI(title="Catalyst Local API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _frontend_dist() -> Path:
    return _repo_root() / "code" / "frontend" / "dist"


def mount_frontend_if_present() -> None:
    dist = _frontend_dist()
    assets = dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="frontend-assets")


@app.exception_handler(HTTPException)
def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": f"http_{exc.status_code}", "message": str(exc.detail)}},
    )


@app.get("/health", response_model=HealthResponse)
def health() -> dict[str, str]:
    return {"status": "ok", "backend": "local-files-duckdb", "version": app.version}


@app.get("/catalog", response_model=CatalogResponse)
def catalog() -> dict:
    settings = get_settings()
    payload = deepcopy(cached_store_catalog())
    provider_status = configured_provider_status(settings)
    payload["provider_status"] = {
        "llm_configured": provider_status["llm_configured"],
        "active_provider": provider_status["active_provider"],
        "providers": provider_status["providers"],
        "literature_sources": research_source_status(settings),
    }
    payload["capabilities"]["agent"] = True
    payload["capabilities"]["research_mode"] = settings.research.enabled
    payload["capabilities"]["pdf_ingest"] = settings.research.enabled and settings.research.allow_pdf_ingest
    payload["capabilities"]["url_ingest"] = settings.research.enabled and settings.research.allow_url_ingest
    payload["capabilities"]["multimodal_inputs"] = False
    return payload


@app.get("/settings/schema")
def get_settings_schema() -> dict:
    return settings_schema()


@app.get("/settings", response_model=SettingsResponse)
def get_runtime_settings() -> dict:
    settings = get_settings()
    return {
        "settings": settings.model_dump(mode="json"),
        "provider_status": configured_provider_status(settings),
        "research_sources": research_source_status(settings),
    }


class SubgraphExportRequest(BaseModel):
    material_ids: list[str] = Field(default_factory=list)
    include_evidence: bool = True
    include_edge_details: bool = False
    format: str = "json"


class ScreenRequest(BaseModel):
    requirement: str
    context: dict[str, Any] | None = None
    options: dict[str, Any] = Field(default_factory=dict)


class CompareRequest(BaseModel):
    material_ids: list[str] = Field(default_factory=list)
    include_evidence: bool = True
    include_edges: bool = True


class CandidateSetCreateRequest(BaseModel):
    session_id: str | None = None
    title: str | None = None
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    requirement: str | None = None


class CandidateSetPatchRequest(BaseModel):
    title: str | None = None
    session_id: str | None = None
    candidates: list[dict[str, Any]] | None = None
    requirement: str | None = None


class CandidateExportRequest(BaseModel):
    candidate_set_id: str | None = None
    material_ids: list[str] | None = None
    format: str = Field("json", pattern="^(json|csv)$")


class SessionCreateRequest(BaseModel):
    title: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class SessionPatchRequest(BaseModel):
    title: str | None = None
    context: dict[str, Any] | None = None
    summary: str | None = None


class AgentChatRequest(BaseModel):
    session_id: str | None = None
    message: str
    current_workspace: dict[str, Any] | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    stream: bool = False


class SettingsPatchRequest(BaseModel):
    runtime: dict[str, Any] | None = None
    providers: dict[str, Any] | None = None
    research: dict[str, Any] | None = None
    sessions: dict[str, Any] | None = None


class ResearchQueryRequest(BaseModel):
    session_id: str | None = None
    query: str
    context: dict[str, Any] = Field(default_factory=dict)
    sources: list[str] | None = None


class IngestUrlRequest(BaseModel):
    session_id: str | None = None
    url: str
    purpose: str | None = None


class IngestPdfRequest(BaseModel):
    session_id: str | None = None
    file_ref: str
    purpose: str | None = None


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> None:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value


@app.get("/graph/overview", response_model=FlexibleResponse)
def graph_overview(limit_clusters: int = Query(250, ge=10, le=1000)) -> dict:
    return cached_graph_overview(limit_clusters)


@app.get("/graph/view", response_model=FlexibleResponse)
def graph_view(
    mode: str = Query("overview", pattern="^(overview|search|neighborhood|cluster)$"),
    limit_nodes: int = Query(500, ge=50, le=1500),
    include_elements: bool = Query(False),
    include_clusters: bool = Query(False),
) -> dict:
    return cached_graph_view(mode, limit_nodes, include_elements, include_clusters)


@app.get("/graph/materials", response_model=FlexibleResponse)
def graph_materials(
    limit_materials: int = Query(10_000, ge=1, le=10_000),
    include_elements: bool = Query(True),
    include_clusters: bool = Query(True),
) -> dict:
    return cached_graph_materials(limit_materials, include_elements, include_clusters)


@app.get("/graph/nodes/{node_id:path}", response_model=FlexibleResponse)
def graph_node(node_id: str) -> dict:
    node = get_store().graph_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Graph node not found: {node_id}")
    return node


@app.get("/materials/random", response_model=FlexibleResponse)
def random_material(mode: str = Query("curated", pattern="^(curated|any)$")) -> dict:
    store = get_store()
    if mode == "curated":
        material = store.curated_random_material()
    else:
        rows = store.query_df("SELECT material_id FROM materials ORDER BY random() LIMIT 1")
        material = store.get_material(str(rows.iloc[0]["material_id"])) if not rows.empty else None
    if not material:
        raise HTTPException(status_code=404, detail=f"No random material available for mode: {mode}")
    return material


@app.get("/materials/{material_id}", response_model=FlexibleResponse)
def get_material(material_id: str) -> dict:
    material = cached_material(material_id)
    if not material:
        raise HTTPException(status_code=404, detail=f"Material not found: {material_id}")
    return material


@app.get("/materials/{material_id}/evidence", response_model=FlexibleResponse)
def get_evidence(material_id: str) -> dict:
    material = cached_material(material_id)
    if not material:
        raise HTTPException(status_code=404, detail=f"Material not found: {material_id}")
    return cached_evidence(material_id)


@app.get("/materials/{material_id}/neighborhood", response_model=FlexibleResponse)
def get_neighborhood(
    material_id: str,
    depth: int = Query(1, ge=1, le=5),
    limit_nodes: int = Query(80, ge=10, le=250),
) -> dict:
    graph = cached_neighborhood(material_id, depth, limit_nodes)
    if not graph["nodes"]:
        raise HTTPException(status_code=404, detail=f"Material not found: {material_id}")
    return graph


@app.get("/materials/{material_id}/structure", response_model=FlexibleResponse)
def get_structure(material_id: str) -> dict:
    structure = cached_structure(material_id)
    if not structure:
        raise HTTPException(status_code=404, detail=f"Material not found: {material_id}")
    return structure


@app.get("/materials/{material_id}/details", response_model=FlexibleResponse)
def get_material_details(
    material_id: str,
    sections: str | None = None,
    limit: int = Query(25, ge=1, le=100),
    downsample: bool = True,
) -> dict:
    sections_key = ",".join(_split_csv(sections))
    payload = cached_material_details(material_id, sections_key, limit, downsample)
    if not payload:
        raise HTTPException(status_code=404, detail=f"Material not found: {material_id}")
    return payload


@app.get("/materials/{material_id}/workspace", response_model=FlexibleResponse)
def get_workspace(material_id: str) -> dict:
    workspace = cached_workspace(material_id)
    if not workspace:
        raise HTTPException(status_code=404, detail=f"Material not found: {material_id}")
    return workspace


@app.get("/edges/{edge_id:path}", response_model=FlexibleResponse)
def get_edge(edge_id: str) -> dict:
    edge = cached_edge(edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail=f"Edge not found: {edge_id}")
    return edge


@app.post("/export/subgraph", response_model=FlexibleResponse)
def export_subgraph(request: SubgraphExportRequest) -> dict:
    material_ids = [material_id for material_id in request.material_ids if material_id.strip()]
    if not material_ids:
        raise HTTPException(status_code=400, detail="material_ids must contain at least one material id")
    return get_store().export_subgraph(
        material_ids,
        include_evidence=request.include_evidence,
        include_edge_details=request.include_edge_details,
    )


@app.post("/export/candidates", response_model=CandidateExportResponse)
def export_candidates(request: CandidateExportRequest) -> dict:
    rows: list[dict[str, Any]] = []
    if request.candidate_set_id:
        candidate_set = get_candidate_sets().get_set(request.candidate_set_id)
        if not candidate_set:
            raise HTTPException(status_code=404, detail=f"Candidate set not found: {request.candidate_set_id}")
        rows = candidate_set.get("candidates", [])
    elif request.material_ids:
        compared = get_store().compare_materials(request.material_ids, include_evidence=False, include_edges=False)
        rows = compared["materials"]
    else:
        raise HTTPException(status_code=400, detail="candidate_set_id or material_ids is required")
    if request.format == "csv":
        return write_candidate_csv(_repo_root(), rows)
    return write_json_export(_repo_root(), {"candidates": rows}, prefix="catalyst-candidates")


@app.post("/screen", response_model=ScreenResponse)
def screen(request: ScreenRequest) -> dict:
    options = request.options or {}
    return screen_candidates(
        get_store(),
        request.requirement,
        limit=int(options.get("limit") or 10),
        include_research_candidates=bool(options.get("include_research_candidates", False)),
    )


@app.post("/compare", response_model=CompareResponse)
def compare(request: CompareRequest) -> dict:
    material_ids = [material_id for material_id in request.material_ids if material_id.strip()]
    if not material_ids:
        raise HTTPException(status_code=400, detail="material_ids must contain at least one material id")
    return get_store().compare_materials(
        material_ids,
        include_evidence=request.include_evidence,
        include_edges=request.include_edges,
    )


@app.get("/sessions", response_model=SessionListResponse)
def list_sessions() -> dict:
    return {"sessions": get_sessions().list_sessions()}


@app.post("/sessions")
def create_session(request: SessionCreateRequest) -> dict:
    return get_sessions().create_session(title=request.title, context=request.context)


@app.get("/sessions/{session_id}")
def get_session(session_id: str) -> dict:
    session = get_sessions().get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    return session


@app.patch("/sessions/{session_id}")
def patch_session(session_id: str, request: SessionPatchRequest) -> dict:
    patch = request.model_dump(exclude_none=True)
    session = get_sessions().update_session(session_id, patch)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    return session


@app.patch("/settings", response_model=SettingsResponse)
def patch_runtime_settings(request: SettingsPatchRequest) -> dict:
    current = get_settings().model_dump(mode="json")
    _deep_merge(current, request.model_dump(exclude_none=True))
    settings = CatalystSettings.model_validate(current)
    save_settings(_repo_root(), settings)
    get_settings.cache_clear()
    clear_read_caches()
    settings = get_settings()
    return {
        "settings": settings.model_dump(mode="json"),
        "provider_status": configured_provider_status(settings),
        "research_sources": research_source_status(settings),
    }


@app.post("/candidate-sets", response_model=FlexibleResponse)
def create_candidate_set(request: CandidateSetCreateRequest) -> dict:
    return get_candidate_sets().create_set(
        session_id=request.session_id,
        title=request.title,
        candidates=request.candidates,
        requirement=request.requirement,
    )


@app.get("/candidate-sets/{candidate_set_id}", response_model=FlexibleResponse)
def get_candidate_set(candidate_set_id: str) -> dict:
    candidate_set = get_candidate_sets().get_set(candidate_set_id)
    if not candidate_set:
        raise HTTPException(status_code=404, detail=f"Candidate set not found: {candidate_set_id}")
    return candidate_set


@app.patch("/candidate-sets/{candidate_set_id}", response_model=FlexibleResponse)
def patch_candidate_set(candidate_set_id: str, request: CandidateSetPatchRequest) -> dict:
    candidate_set = get_candidate_sets().update_set(candidate_set_id, request.model_dump(exclude_none=True))
    if not candidate_set:
        raise HTTPException(status_code=404, detail=f"Candidate set not found: {candidate_set_id}")
    return candidate_set


@app.get("/agent/tools", response_model=AgentToolCatalogResponse)
def get_agent_tool_catalog() -> dict:
    return tool_catalog(get_settings())


@app.post("/agent/chat", response_model=AgentChatResponse)
def agent_chat(request: AgentChatRequest) -> dict:
    session_id = request.session_id
    if not session_id:
        session_id = get_sessions().create_session(context=request.current_workspace or {})["session_id"]
    return get_agent_tools().local_chat(
        session_id=session_id,
        message=request.message,
        current_workspace=request.current_workspace,
    )


@app.post("/agent/actions/{action_id}/confirm")
def confirm_agent_action(action_id: str) -> dict:
    return {"action_id": action_id, "status": "acknowledged"}


@app.get("/research/status", response_model=ResearchStatusResponse)
def get_research_status() -> dict:
    return research_status(get_settings())


@app.post("/research/query", response_model=ResearchQueryResponse)
def research_query(request: ResearchQueryRequest) -> dict:
    tools = get_agent_tools()
    run = tools.start_research(
        {
            "query": request.query,
            "session_id": request.session_id,
            "sources": request.sources,
            **(request.context or {}),
        }
    )
    return {"run_id": run["run_id"], "status": run["status"], "message": run["message"]}


@app.get("/research/runs/{run_id}", response_model=FlexibleResponse)
def get_research_run(run_id: str) -> dict:
    run = get_research_store().get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Research run not found: {run_id}")
    return run


@app.post("/research/ingest-url", response_model=FlexibleResponse)
def ingest_url(request: IngestUrlRequest) -> dict:
    settings = get_settings()
    if not settings.research.enabled or not settings.research.allow_url_ingest:
        return get_research_store().ingest_url_disabled(
            request.url,
            request.session_id,
            "Research URL ingestion is not enabled in this local build.",
        )
    return get_research_store().ingest_url(request.url, request.session_id, request.purpose)


@app.post("/research/ingest-pdf", response_model=FlexibleResponse)
def ingest_pdf(request: IngestPdfRequest) -> dict:
    settings = get_settings()
    if not settings.research.enabled or not settings.research.allow_pdf_ingest:
        return {
            "file_ref": request.file_ref,
            "session_id": request.session_id,
            "status": "disabled",
            "message": "Research PDF ingestion is not enabled in this local build.",
        }
    return {
        "file_ref": request.file_ref,
        "session_id": request.session_id,
        "status": "queued",
        "message": "PDF ingestion scaffold is present; extraction implementation is pending.",
    }


@app.post("/research/candidates/{candidate_id}/promote", response_model=FlexibleResponse)
def promote_research_candidate(candidate_id: str) -> dict:
    candidate = get_research_store().get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail=f"Research candidate not found: {candidate_id}")
    return {
        "candidate_id": candidate_id,
        "status": "promoted",
        "namespace": "external_research",
        "node": {
            "id": candidate_id,
            "type": "material",
            "namespace": "external_research",
            "label": candidate.get("formula") or candidate.get("material_name"),
        },
    }


@app.get("/search", response_model=SearchResponse)
def search(
    query: str = Query("", max_length=100),
    limit: int = Query(25, ge=1, le=100),
    elements: Annotated[str | None, Query(description="Comma-separated element symbols")] = None,
    chemsys: str | None = None,
    stable: bool | None = None,
    metal: bool | None = None,
    magnetic: bool | None = None,
    band_gap_min: float | None = None,
    band_gap_max: float | None = None,
    density_min: float | None = None,
    density_max: float | None = None,
    evidence: str | None = None,
    include_research: bool = False,
) -> dict:
    return {
        "query": query,
        "filters": {
            "elements": _split_csv(elements),
            "chemsys": chemsys,
            "stable": stable,
            "metal": metal,
            "magnetic": magnetic,
            "band_gap_min": band_gap_min,
            "band_gap_max": band_gap_max,
            "density_min": density_min,
            "density_max": density_max,
            "evidence": evidence,
            "include_research": include_research,
        },
        "results": get_store().search(
            query,
            limit=limit,
            elements=_split_csv(elements),
            chemsys=chemsys,
            stable=stable,
            metal=metal,
            magnetic=magnetic,
            band_gap_min=band_gap_min,
            band_gap_max=band_gap_max,
            density_min=density_min,
            density_max=density_max,
            evidence=evidence,
        ),
    }


mount_frontend_if_present()


@app.get("/{path:path}", include_in_schema=False)
def frontend_app(path: str) -> FileResponse:
    dist = _frontend_dist()
    index = dist / "index.html"
    requested = (dist / path).resolve()
    try:
        requested.relative_to(dist.resolve())
    except ValueError:
        requested = index
    if requested.is_file():
        return FileResponse(requested)
    if index.exists():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Frontend build not found. Run npm run build --prefix code/frontend.")


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.getenv("CATALYST_API_PORT", "8766"))
    uvicorn.run("catalyst.local_api:app", host="127.0.0.1", port=port, reload=False)
