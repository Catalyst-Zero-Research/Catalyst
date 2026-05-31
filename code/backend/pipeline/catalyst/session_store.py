from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from catalyst.settings import ensure_local_dirs, local_root, utc_now


class SessionStore:
    def __init__(self, repo_root: Path) -> None:
        ensure_local_dirs(repo_root)
        self.root = local_root(repo_root) / "sessions"

    def _path(self, session_id: str) -> Path:
        return self.root / f"{session_id}.json"

    def list_sessions(self) -> list[dict[str, Any]]:
        sessions = []
        for path in sorted(self.root.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            sessions.append(
                {
                    "session_id": data.get("session_id"),
                    "title": data.get("title"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "current_material_id": data.get("context", {}).get("current_material_id"),
                    "candidate_set_id": data.get("context", {}).get("candidate_set_id"),
                    "message_count": len(data.get("messages", [])),
                }
            )
        return sessions

    def create_session(self, title: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        now = utc_now()
        session_id = f"ses_{uuid4().hex[:16]}"
        session = {
            "session_id": session_id,
            "title": title or "Catalyst session",
            "created_at": now,
            "updated_at": now,
            "context": context or {},
            "messages": [],
            "tool_traces": [],
            "summary": "",
        }
        self.save(session)
        return session

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        path = self._path(session_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def save(self, session: dict[str, Any]) -> dict[str, Any]:
        session["updated_at"] = utc_now()
        self._path(session["session_id"]).write_text(
            json.dumps(session, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return session

    def update_session(self, session_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        session = self.get_session(session_id)
        if not session:
            return None
        if "title" in patch:
            session["title"] = patch["title"]
        if "context" in patch:
            session.setdefault("context", {}).update(patch["context"] or {})
        if "summary" in patch:
            session["summary"] = patch["summary"]
        return self.save(session)

    def append_message(self, session_id: str, role: str, content: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        session = self.get_session(session_id) or self.create_session()
        message = {
            "id": f"msg_{uuid4().hex[:16]}",
            "role": role,
            "content": content,
            "created_at": utc_now(),
            **(extra or {}),
        }
        session.setdefault("messages", []).append(message)
        self.save(session)
        return message

    def append_tool_trace(self, session_id: str, trace: dict[str, Any]) -> None:
        session = self.get_session(session_id)
        if not session:
            return
        compact = {
            "id": trace.get("id") or f"tool_{uuid4().hex[:16]}",
            "tool": trace.get("tool"),
            "created_at": utc_now(),
            "summary": trace.get("summary"),
            "payload_ref": trace.get("payload_ref"),
        }
        session.setdefault("tool_traces", []).append(compact)
        self.save(session)


def compact_session_context(session: dict[str, Any] | None) -> dict[str, Any]:
    if not session:
        return {"session_id": None, "recent_summary": ""}
    messages = session.get("messages", [])[-6:]
    recent = []
    for message in messages:
        text = str(message.get("content", ""))
        recent.append(f"{message.get('role')}: {text[:240]}")
    return {
        "session_id": session.get("session_id"),
        "title": session.get("title"),
        "recent_summary": session.get("summary") or "\n".join(recent),
        "context": session.get("context", {}),
    }

