from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from catalyst.agent_loop import run_local_agent_fallback, run_llm_agent_loop, should_use_local_agent_fast_path
from catalyst.agent_runtime import ensure_agent_runtime_files
from catalyst.candidate_sets import CandidateSetStore
from catalyst.providers import provider_status
from catalyst.research_adapters import search_research_sources
from catalyst.research_mode import ResearchStore
from catalyst.research_sources import research_sources_payload
from catalyst.screening import screen_candidates
from catalyst.session_store import SessionStore, compact_session_context
from catalyst.settings import CatalystSettings, research_source_status

ELEMENT_SYMBOLS = {
    "H",
    "He",
    "Li",
    "Be",
    "B",
    "C",
    "N",
    "O",
    "F",
    "Ne",
    "Na",
    "Mg",
    "Al",
    "Si",
    "P",
    "S",
    "Cl",
    "Ar",
    "K",
    "Ca",
    "Sc",
    "Ti",
    "V",
    "Cr",
    "Mn",
    "Fe",
    "Co",
    "Ni",
    "Cu",
    "Zn",
    "Ga",
    "Ge",
    "As",
    "Se",
    "Br",
    "Kr",
    "Rb",
    "Sr",
    "Y",
    "Zr",
    "Nb",
    "Mo",
    "Tc",
    "Ru",
    "Rh",
    "Pd",
    "Ag",
    "Cd",
    "In",
    "Sn",
    "Sb",
    "Te",
    "I",
    "Xe",
    "Cs",
    "Ba",
    "La",
    "Ce",
    "Pr",
    "Nd",
    "Pm",
    "Sm",
    "Eu",
    "Gd",
    "Tb",
    "Dy",
    "Ho",
    "Er",
    "Tm",
    "Yb",
    "Lu",
    "Hf",
    "Ta",
    "W",
    "Re",
    "Os",
    "Ir",
    "Pt",
    "Au",
    "Hg",
    "Tl",
    "Pb",
    "Bi",
    "Po",
    "At",
    "Rn",
    "Fr",
    "Ra",
    "Ac",
    "Th",
    "Pa",
    "U",
    "Np",
    "Pu",
    "Am",
    "Cm",
    "Bk",
    "Cf",
    "Es",
    "Fm",
    "Md",
    "No",
    "Lr",
}


def tool_catalog(settings: CatalystSettings) -> dict[str, Any]:
    status = provider_status(settings)
    # Tool names are intentionally mirrored in data/local/agent/tool_registry.json.
    # The JSON file is the modifiable agent contract; these names remain the
    # backend capability list for the API contract.
    return {
        "agent_available": True,
        "llm_configured": status["llm_configured"],
        "active_provider": status["active_provider"],
        "mode": "llm_first_tool_loop",
        "provider_configured": status["llm_configured"],
        "tools": [
            "search_materials",
            "get_material_workspace",
            "get_neighborhood",
            "inspect_edge",
            "screen_candidates",
            "compare_materials",
            "export_subgraph",
            "start_research",
            "ingest_url",
        ],
        "providers": status["providers"],
        "research": research_sources_payload(settings),
        "research_sources": research_source_status(settings),
    }


class CatalystAgentTools:
    def __init__(self, repo_root: Path, store: Any, settings: CatalystSettings) -> None:
        self.repo_root = repo_root
        self.store = store
        self.settings = settings
        self.sessions = SessionStore(repo_root)
        self.candidate_sets = CandidateSetStore(repo_root)
        self.research = ResearchStore(repo_root)
        self.agent_runtime = ensure_agent_runtime_files(repo_root)

    def search_materials(self, payload: dict[str, Any]) -> dict[str, Any]:
        results = self.store.search(
            payload.get("query", ""),
            limit=int(payload.get("limit") or 20),
            elements=payload.get("elements") or [],
            chemsys=payload.get("chemsys"),
            stable=payload.get("stable"),
            metal=payload.get("metal"),
            magnetic=payload.get("magnetic"),
            band_gap_min=payload.get("band_gap_min"),
            band_gap_max=payload.get("band_gap_max"),
            density_min=payload.get("density_min"),
            density_max=payload.get("density_max"),
            evidence=payload.get("evidence"),
        )
        return {"results": results}

    def get_material_workspace(self, payload: dict[str, Any]) -> dict[str, Any]:
        material_id = str(payload["material_id"])
        workspace = self.store.workspace(material_id)
        return {"workspace": workspace}

    def get_neighborhood(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.store.neighborhood(str(payload["material_id"]))

    def inspect_edge(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {"edge": self.store.edge(str(payload["edge_id"]))}

    def ingest_url(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = str(payload.get("url") or "")
        session_id = payload.get("session_id")
        purpose = payload.get("purpose")
        if not self.settings.research.allow_url_ingest:
            return self.research.ingest_url_disabled(url, session_id, "URL ingest is disabled in this local build.")
        return self.research.ingest_url(url, session_id, purpose)

    def screen_candidates(self, payload: dict[str, Any]) -> dict[str, Any]:
        return screen_candidates(
            self.store,
            str(payload["requirement"]),
            limit=int(payload.get("limit") or 10),
            include_research_candidates=bool(payload.get("include_research_candidates", False)),
        )

    def compare_materials(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.store.compare_materials(
            [str(item) for item in payload.get("material_ids", [])],
            include_evidence=bool(payload.get("include_evidence", True)),
            include_edges=bool(payload.get("include_edges", True)),
        )

    def export_subgraph(self, payload: dict[str, Any]) -> dict[str, Any]:
        material_ids = [str(item) for item in payload.get("material_ids", [])]
        return self.store.export_subgraph(
            material_ids,
            include_evidence=bool(payload.get("include_evidence", True)),
            include_edge_details=bool(payload.get("include_edge_details", True)),
        )

    def start_research(self, payload: dict[str, Any]) -> dict[str, Any]:
        query = str(payload.get("query") or "")
        session_id = payload.get("session_id")
        if not self.settings.research.enabled:
            return self.research.create_disabled_run(
                query,
                "Research mode is not enabled in this local build.",
                session_id=session_id,
            )
        requested_sources = payload.get("sources") or self.settings.research.sources
        source_status = research_source_status(self.settings)
        available_sources = [source for source in requested_sources if source_status.get(source) == "available"]
        if not available_sources:
            return self.research.create_stub_run(
                query=query,
                session_id=session_id,
                sources=requested_sources,
                message="Research mode is enabled, but no requested sources are currently configured.",
            )
        searched = search_research_sources(query, available_sources, limit=int(payload.get("limit") or 5))
        return self.research.create_completed_run(
            query=query,
            session_id=session_id,
            sources=available_sources,
            hits=searched["hits"],
            errors=searched["errors"],
        )

    def local_chat(
        self,
        *,
        session_id: str,
        message: str,
        current_workspace: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        session = self.sessions.get_session(session_id) or self.sessions.create_session(context=current_workspace or {})
        if session["session_id"] != session_id:
            session_id = session["session_id"]
        if current_workspace:
            workspace_context = dict(session.get("context") or {})
            workspace_context.update(dict(current_workspace))
            if current_workspace.get("material_id"):
                workspace_context["current_material_id"] = current_workspace["material_id"]
            self.sessions.update_session(session_id, {"context": workspace_context})
            session = self.sessions.get_session(session_id) or session
        self.sessions.append_message(session_id, "user", message)

        if should_use_local_agent_fast_path(message):
            fallback_response = run_local_agent_fallback(
                self,
                session_id=session_id,
                message=message,
                current_workspace=current_workspace,
            )
            if fallback_response:
                return fallback_response

        llm_response = run_llm_agent_loop(
            self,
            session_id=session_id,
            message=message,
            current_workspace=current_workspace,
        )
        if llm_response:
            return llm_response

        fallback_response = run_local_agent_fallback(
            self,
            session_id=session_id,
            message=message,
            current_workspace=current_workspace,
        )
        if fallback_response:
            return fallback_response

        response_text = (
            "The Catalyst LLM/tool loop is unavailable, so no answer was generated. "
            "Check provider configuration or retry with another configured provider."
        )
        assistant = self.sessions.append_message(
            session_id,
            "assistant",
            response_text,
            {"citations": [], "actions": [], "ui_actions": [], "agent_error": "llm_tool_loop_unavailable"},
        )
        return {
            "session_id": session_id,
            "assistant_message": {
                "id": assistant["id"],
                "text": response_text,
                "citations": [],
                "actions": [],
                "ui_actions": [],
                "confidence": "partial",
            },
            "actions": [],
            "ui_actions": [],
            "candidate_results": None,
            "updated_context": compact_session_context(self.sessions.get_session(session_id)),
        }

    def _resolve_material_reference(self, message: str) -> str | None:
        explicit = _extract_material_id(message)
        if explicit:
            return explicit
        for token in _extract_formula_like_tokens(message):
            results = self.store.search(token, limit=3)
            for result in results:
                if str(result.get("formula_pretty") or "").lower() == token.lower():
                    return str(result["material_id"])
        return None

def _extract_material_id(text: str) -> str | None:
    match = re.search(r"\bmp-[a-z0-9-]+\b", text, re.IGNORECASE)
    return match.group(0) if match else None


def _extract_formula_like_tokens(text: str) -> list[str]:
    raw_tokens = re.findall(r"\b[A-Za-z][A-Za-z0-9]{1,31}\b", text)
    candidates: list[str] = []
    for token in raw_tokens:
        if _is_formula_like_token(token):
            candidates.append(token)
    return candidates


def _is_formula_like_token(token: str) -> bool:
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,31}", token):
        return False
    index = 0
    groups = 0
    has_digit = any(char.isdigit() for char in token)
    while index < len(token):
        if not token[index].isalpha():
            return False
        matched = None
        for width in (2, 1):
            part = token[index : index + width]
            if len(part) != width or not part.isalpha():
                continue
            symbol = part[0].upper() + part[1:].lower()
            if symbol in ELEMENT_SYMBOLS:
                matched = symbol
                index += width
                break
        if not matched:
            return False
        while index < len(token) and token[index].isdigit():
            index += 1
        groups += 1
    return groups >= 2 or has_digit
