from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from catalyst.settings import ensure_local_dirs, local_root, utc_now


class CandidateSetStore:
    def __init__(self, repo_root: Path) -> None:
        ensure_local_dirs(repo_root)
        self.root = local_root(repo_root) / "candidate_sets"

    def _path(self, candidate_set_id: str) -> Path:
        return self.root / f"{candidate_set_id}.json"

    def create_set(
        self,
        *,
        session_id: str | None = None,
        title: str | None = None,
        candidates: list[dict[str, Any]] | None = None,
        requirement: str | None = None,
    ) -> dict[str, Any]:
        now = utc_now()
        candidate_set_id = f"cand_{uuid4().hex[:16]}"
        candidate_set = {
            "candidate_set_id": candidate_set_id,
            "session_id": session_id,
            "title": title or "Candidate set",
            "requirement": requirement,
            "created_at": now,
            "updated_at": now,
            "candidates": candidates or [],
        }
        self.save(candidate_set)
        return candidate_set

    def get_set(self, candidate_set_id: str) -> dict[str, Any] | None:
        path = self._path(candidate_set_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def save(self, candidate_set: dict[str, Any]) -> dict[str, Any]:
        candidate_set["updated_at"] = utc_now()
        self._path(candidate_set["candidate_set_id"]).write_text(
            json.dumps(candidate_set, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return candidate_set

    def update_set(self, candidate_set_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        candidate_set = self.get_set(candidate_set_id)
        if not candidate_set:
            return None
        for key in ("title", "requirement", "session_id"):
            if key in patch:
                candidate_set[key] = patch[key]
        if "candidates" in patch:
            candidate_set["candidates"] = patch["candidates"] or []
        return self.save(candidate_set)

    def list_sets(self, session_id: str | None = None) -> list[dict[str, Any]]:
        sets = []
        for path in sorted(self.root.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if session_id and data.get("session_id") != session_id:
                continue
            sets.append(
                {
                    "candidate_set_id": data.get("candidate_set_id"),
                    "session_id": data.get("session_id"),
                    "title": data.get("title"),
                    "requirement": data.get("requirement"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "candidate_count": len(data.get("candidates", [])),
                }
            )
        return sets

