from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class FlexibleResponse(BaseModel):
    model_config = ConfigDict(extra="allow")


class HealthResponse(BaseModel):
    status: str
    backend: str
    version: str


class CatalogResponse(BaseModel):
    product: str
    source: dict[str, Any]
    counts: dict[str, int]
    capabilities: dict[str, bool]
    provider_status: dict[str, Any] | None = None


class SettingsResponse(BaseModel):
    settings: dict[str, Any]
    provider_status: dict[str, Any]
    research_sources: dict[str, str]


class SearchResponse(BaseModel):
    query: str
    filters: dict[str, Any]
    results: list[dict[str, Any]]


class ScreenResponse(BaseModel):
    requirement: str
    parsed_requirements: list[dict[str, Any]]
    candidates: list[dict[str, Any]]
    unsupported_requirements: list[dict[str, Any]]
    research_suggestion: dict[str, Any] | None = None
    include_research_candidates: bool


class CompareResponse(BaseModel):
    materials: list[dict[str, Any]]
    columns: list[dict[str, Any]]
    groups: list[dict[str, Any]] = Field(default_factory=list)
    evidence: dict[str, Any]
    relation_summaries: list[dict[str, Any]]


class SessionListResponse(BaseModel):
    sessions: list[dict[str, Any]]


class AgentToolCatalogResponse(BaseModel):
    agent_available: bool
    llm_configured: bool
    active_provider: str | None = None
    mode: str
    provider_configured: bool
    tools: list[str]
    providers: dict[str, Any]
    research: dict[str, Any]
    research_sources: dict[str, str]


class AgentChatResponse(BaseModel):
    session_id: str
    assistant_message: dict[str, Any]
    actions: list[dict[str, Any]]
    ui_actions: list[dict[str, Any]] = []
    candidate_results: list[dict[str, Any]] | None = None
    updated_context: dict[str, Any]


class ResearchStatusResponse(BaseModel):
    enabled: bool
    sources: dict[str, str]
    url_ingest: bool
    pdf_ingest: bool


class ResearchQueryResponse(BaseModel):
    run_id: str
    status: str
    message: str


class CandidateExportResponse(BaseModel):
    export_id: str
    format: str
    path: str
    preview: dict[str, Any] | None = None
