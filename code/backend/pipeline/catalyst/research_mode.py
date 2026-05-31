from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from catalyst.settings import (
    CatalystSettings,
    ensure_local_dirs,
    local_root,
    research_source_status,
    utc_now,
)


def research_status(settings: CatalystSettings) -> dict[str, Any]:
    sources = research_source_status(settings)
    return {
        "enabled": settings.research.enabled,
        "sources": sources,
        "url_ingest": settings.research.enabled and settings.research.allow_url_ingest,
        "pdf_ingest": settings.research.enabled and settings.research.allow_pdf_ingest,
    }


class ResearchStore:
    def __init__(self, repo_root: Path) -> None:
        ensure_local_dirs(repo_root)
        self.root = local_root(repo_root)
        self.runs = self.root / "research_runs"
        self.candidates = self.root / "research_candidates"
        self.sources = self.root / "research_sources"

    def create_disabled_run(self, query: str, message: str, session_id: str | None = None) -> dict[str, Any]:
        run = {
            "run_id": f"run_{uuid4().hex[:16]}",
            "session_id": session_id,
            "query": query,
            "status": "disabled",
            "message": message,
            "created_at": utc_now(),
            "updated_at": utc_now(),
            "sources": [],
            "candidate_ids": [],
        }
        self._write(self.runs / f"{run['run_id']}.json", run)
        return run

    def create_stub_run(
        self,
        *,
        query: str,
        session_id: str | None,
        sources: list[str],
        message: str = "Research run created. Source adapters are configured for implementation.",
    ) -> dict[str, Any]:
        run = {
            "run_id": f"run_{uuid4().hex[:16]}",
            "session_id": session_id,
            "query": query,
            "status": "queued",
            "message": message,
            "created_at": utc_now(),
            "updated_at": utc_now(),
            "sources": sources,
            "candidate_ids": [],
        }
        self._write(self.runs / f"{run['run_id']}.json", run)
        return run

    def create_completed_run(
        self,
        *,
        query: str,
        session_id: str | None,
        sources: list[str],
        hits: list[dict[str, Any]],
        errors: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        source_records = [self.create_source_hit(hit, session_id=session_id) for hit in hits]
        run = {
            "run_id": f"run_{uuid4().hex[:16]}",
            "session_id": session_id,
            "query": query,
            "status": "completed",
            "message": f"Research mode searched {len(sources)} sources and stored {len(source_records)} source hits.",
            "created_at": utc_now(),
            "updated_at": utc_now(),
            "sources": sources,
            "hits": source_records,
            "errors": errors or [],
            "candidate_ids": [],
        }
        self._write(self.runs / f"{run['run_id']}.json", run)
        return run

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        path = self.runs / f"{run_id}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def create_research_candidate(
        self,
        *,
        session_id: str | None,
        material_name: str,
        formula: str | None = None,
        properties: dict[str, Any] | None = None,
        source_refs: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        candidate = {
            "candidate_id": f"research_{uuid4().hex[:16]}",
            "namespace": "external_research",
            "session_id": session_id,
            "material_name": material_name,
            "formula": formula,
            "properties": properties or {},
            "extracted_claims": [],
            "source_refs": source_refs or [],
            "confidence": "low",
            "created_at": utc_now(),
        }
        self._write(self.candidates / f"{candidate['candidate_id']}.json", candidate)
        return candidate

    def create_source_hit(self, hit: dict[str, Any], session_id: str | None) -> dict[str, Any]:
        source = {
            "source_id": f"src_{uuid4().hex[:16]}",
            "type": "literature_hit",
            "session_id": session_id,
            "status": "stored",
            "created_at": utc_now(),
            "source": hit.get("source"),
            "external_id": hit.get("external_id"),
            "title": hit.get("title"),
            "abstract": hit.get("abstract"),
            "year": hit.get("year"),
            "url": hit.get("url"),
            "doi": hit.get("doi"),
            "authors": hit.get("authors") or [],
            "metadata": {key: value for key, value in hit.items() if key not in _SOURCE_FIELDS},
        }
        self._write(self.sources / f"{source['source_id']}.json", source)
        return source

    def get_candidate(self, candidate_id: str) -> dict[str, Any] | None:
        path = self.candidates / f"{candidate_id}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def ingest_url_disabled(self, url: str, session_id: str | None, reason: str) -> dict[str, Any]:
        source = {
            "source_id": f"src_{uuid4().hex[:16]}",
            "type": "url",
            "url": url,
            "session_id": session_id,
            "status": "disabled",
            "message": reason,
            "created_at": utc_now(),
        }
        self._write(self.sources / f"{source['source_id']}.json", source)
        return source

    def ingest_url(self, url: str, session_id: str | None, purpose: str | None = None) -> dict[str, Any]:
        source = {
            "source_id": f"src_{uuid4().hex[:16]}",
            "type": "url",
            "url": url,
            "session_id": session_id,
            "purpose": purpose,
            "status": "stored",
            "message": "URL content stored for research-mode context.",
            "created_at": utc_now(),
            "text_preview": None,
        }
        try:
            request = Request(url, headers={"User-Agent": "Catalyst/0.1 local research mode"})
            with urlopen(request, timeout=12) as response:
                content_type = response.headers.get("content-type", "")
                raw = response.read(500_000).decode("utf-8", errors="replace")
            source["content_type"] = content_type
            source["text_preview"] = _html_to_text_preview(raw)
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            source["status"] = "failed"
            source["message"] = str(exc)
        self._write(self.sources / f"{source['source_id']}.json", source)
        return source

    @staticmethod
    def _write(path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


_SOURCE_FIELDS = {
    "source",
    "external_id",
    "title",
    "abstract",
    "year",
    "url",
    "doi",
    "authors",
}


def _html_to_text_preview(raw: str, limit: int = 8000) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]
