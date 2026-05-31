from __future__ import annotations

import json
import re
from typing import Any
from uuid import uuid4

from catalyst.agent_runtime import write_compiled_agent_context
from catalyst.providers.gemini import GeminiProviderError, generate_gemini_agent_turn
from catalyst.session_store import compact_session_context


TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {
        "name": "resolve_material",
        "description": "Resolve a formula, free-text material mention, or Materials Project id to a local Catalyst material id.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Formula, mp-id, or material mention."}},
            "required": ["query"],
        },
    },
    {
        "name": "search_materials",
        "description": "Search and filter the local Catalyst materials snapshot.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
                "elements": {"type": "array", "items": {"type": "string"}},
                "chemsys": {"type": "string"},
                "stable": {"type": "boolean"},
                "metal": {"type": "boolean"},
                "magnetic": {"type": "boolean"},
                "band_gap_min": {"type": "number"},
                "band_gap_max": {"type": "number"},
                "density_min": {"type": "number"},
                "density_max": {"type": "number"},
            },
        },
    },
    {
        "name": "get_material_workspace",
        "description": "Load grounded properties, evidence, and graph context for one material id or resolvable formula.",
        "parameters": {
            "type": "object",
            "properties": {"material_id": {"type": "string", "description": "Local material id, mp-id, or formula."}},
            "required": ["material_id"],
        },
    },
    {
        "name": "get_neighborhood",
        "description": "Load directly connected graph neighbors for one material id or formula.",
        "parameters": {
            "type": "object",
            "properties": {"material_id": {"type": "string", "description": "Local material id, mp-id, or formula."}},
            "required": ["material_id"],
        },
    },
    {
        "name": "inspect_edge",
        "description": "Inspect one graph edge by id and return its grounded relation/evidence detail.",
        "parameters": {
            "type": "object",
            "properties": {"edge_id": {"type": "string", "description": "Graph edge id."}},
            "required": ["edge_id"],
        },
    },
    {
        "name": "screen_candidates",
        "description": "Rank candidate materials for a natural-language requirement. Use for find/recommend/good/best candidate requests.",
        "parameters": {
            "type": "object",
            "properties": {
                "requirement": {"type": "string"},
                "limit": {"type": "integer"},
                "include_research_candidates": {"type": "boolean"},
            },
            "required": ["requirement"],
        },
    },
    {
        "name": "compare_materials",
        "description": "Compare two or more local material ids.",
        "parameters": {
            "type": "object",
            "properties": {
                "material_ids": {"type": "array", "items": {"type": "string"}},
                "include_evidence": {"type": "boolean"},
                "include_edges": {"type": "boolean"},
            },
            "required": ["material_ids"],
        },
    },
    {
        "name": "select_material",
        "description": "Ask the UI to select, highlight, zoom to, and optionally open the inspector for a material.",
        "parameters": {
            "type": "object",
            "properties": {
                "material_id": {"type": "string", "description": "Local material id, mp-id, or formula."},
                "open_inspector": {"type": "boolean"},
            },
            "required": ["material_id"],
        },
    },
    {
        "name": "export_subgraph",
        "description": "Export a grounded subgraph for selected material ids.",
        "parameters": {
            "type": "object",
            "properties": {
                "material_ids": {"type": "array", "items": {"type": "string"}},
                "include_evidence": {"type": "boolean"},
                "include_edge_details": {"type": "boolean"},
            },
            "required": ["material_ids"],
        },
    },
    {
        "name": "start_research",
        "description": "Start literature/research mode when local data is insufficient.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "sources": {"type": "array", "items": {"type": "string"}},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "ingest_url",
        "description": "Ingest a URL into local research mode when enabled.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "purpose": {"type": "string"},
            },
            "required": ["url"],
        },
    },
]


def run_llm_agent_loop(
    controller: Any,
    *,
    session_id: str,
    message: str,
    current_workspace: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if controller.settings.providers.active_provider != "gemini":
        return None

    session = controller.sessions.get_session(session_id)
    if not session:
        return None

    dynamic = _dynamic_context(session, current_workspace)
    compiled = write_compiled_agent_context(controller.repo_root, dynamic)
    model = controller.settings.providers.models.get("gemini") or "gemini-2.5-flash"
    use_native_tools = not model.removeprefix("models/").startswith("gemma-")

    try:
        if use_native_tools:
            return _run_native_gemini_loop(
                controller,
                session_id=session_id,
                system_instruction=compiled["markdown"],
                current_workspace=current_workspace,
            )
        return _run_json_tool_loop(
            controller,
            session_id=session_id,
            message=message,
            system_instruction=compiled["markdown"],
            current_workspace=current_workspace,
        )
    except GeminiProviderError:
        return None
    except (OSError, TimeoutError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None


def _run_native_gemini_loop(
    controller: Any,
    *,
    session_id: str,
    system_instruction: str,
    current_workspace: dict[str, Any] | None,
) -> dict[str, Any] | None:
    contents = _session_contents(controller.sessions.get_session(session_id))
    tools = [{"functionDeclarations": TOOL_DECLARATIONS}]
    aggregate = _empty_aggregate()
    model_content: dict[str, Any] | None = None

    max_turns = int(controller.agent_runtime.get("context", {}).get("runtime", {}).get("max_tool_iterations") or 4)
    for _ in range(max(1, max_turns)):
        turn = generate_gemini_agent_turn(
            controller.settings,
            contents=contents,
            system_instruction=system_instruction,
            tools=tools,
            temperature=0.2,
            max_output_tokens=1024,
        )
        model_content = turn.get("content")
        calls = turn.get("function_calls") or []
        if not calls:
            return _assistant_response(
                controller,
                session_id=session_id,
                text=turn.get("text") or "I could not produce a grounded answer from the current context.",
                aggregate=aggregate,
                current_workspace=current_workspace,
                confidence="grounded" if aggregate["tool_calls"] else "partial",
                provider={"provider": "gemini", "model": turn.get("model"), "usage": turn.get("usage") or {}},
            )
        if model_content:
            contents.append(model_content)
        response_parts = []
        for call in calls:
            result = _execute_tool(controller, session_id, call.get("name"), call.get("args") or {}, aggregate)
            response = {"result": _compact_tool_result(result)}
            function_response = {"name": call.get("name"), "response": response}
            if call.get("id"):
                function_response["id"] = call["id"]
            response_parts.append({"functionResponse": function_response})
        contents.append({"role": "user", "parts": response_parts})

    if model_content:
        text = _extract_text_from_content(model_content)
        if text:
            return _assistant_response(
                controller,
                session_id=session_id,
                text=text,
                aggregate=aggregate,
                current_workspace=current_workspace,
                confidence="grounded" if aggregate["tool_calls"] else "partial",
            )
    return None


def _run_json_tool_loop(
    controller: Any,
    *,
    session_id: str,
    message: str,
    system_instruction: str,
    current_workspace: dict[str, Any] | None,
) -> dict[str, Any] | None:
    session = controller.sessions.get_session(session_id)
    aggregate = _empty_aggregate()
    plan_prompt = (
        f"{system_instruction}\n\n"
        "You are the Catalyst LLM agent. Decide what tools to call before answering. "
        "Return ONLY JSON with this shape:\n"
        '{"tool_calls":[{"name":"screen_candidates","args":{"requirement":"..."}}],'
        '"respond_directly":{"text":"...","confidence":"partial"}}\n'
        "Use tool_calls for all material properties, graph, search, screening, selection, comparison, export, or research. "
        "Use respond_directly only for brief Catalyst-scoped clarification or greeting.\n\n"
        f"Recent session:\n{_recent_session_text(session, limit=16)}\n\n"
        f"Current user message: {message}"
    )
    plan_turn = generate_gemini_agent_turn(
        controller.settings,
        contents=[{"role": "user", "parts": [{"text": plan_prompt}]}],
        system_instruction=system_instruction,
        temperature=0.1,
        max_output_tokens=768,
    )
    plan = _parse_json_object(plan_turn.get("text") or "")
    for call in plan.get("tool_calls") or []:
        if not isinstance(call, dict):
            continue
        _execute_tool(controller, session_id, call.get("name"), call.get("args") or {}, aggregate)

    if not aggregate["tool_calls"]:
        if _message_requires_tool(message, current_workspace):
            return None
        direct = plan.get("respond_directly") or {}
        text = direct.get("text") if isinstance(direct, dict) else None
        if text:
            return _assistant_response(
                controller,
                session_id=session_id,
                text=str(text),
                aggregate=aggregate,
                current_workspace=current_workspace,
                confidence="partial",
                provider={"provider": "gemini", "model": plan_turn.get("model"), "usage": plan_turn.get("usage") or {}},
            )
        return None

    final_prompt = (
        f"{system_instruction}\n\n"
        "You called tools. Now write the final Catalyst answer. "
        "Return ONLY JSON with this shape:\n"
        '{"text":"markdown answer","confidence":"grounded|partial|research_required"}\n'
        "The answer must be concise, acknowledge corrections plainly, and cite only tool-grounded facts.\n\n"
        f"User message: {message}\n\nTool results:\n{json.dumps(aggregate['tool_results'], indent=2, sort_keys=True)}"
    )
    final_turn = generate_gemini_agent_turn(
        controller.settings,
        contents=[{"role": "user", "parts": [{"text": final_prompt}]}],
        system_instruction=system_instruction,
        temperature=0.2,
        max_output_tokens=1024,
    )
    final = _parse_json_object(final_turn.get("text") or "")
    text = final.get("text") or final_turn.get("text")
    if not text:
        return None
    confidence = final.get("confidence") or "grounded"
    return _assistant_response(
        controller,
        session_id=session_id,
        text=str(text),
        aggregate=aggregate,
        current_workspace=current_workspace,
        confidence=str(confidence),
        provider={"provider": "gemini", "model": final_turn.get("model"), "usage": final_turn.get("usage") or {}},
    )


def _execute_tool(controller: Any, session_id: str, name: str | None, args: dict[str, Any], aggregate: dict[str, Any]) -> dict[str, Any]:
    if not name:
        return {"ok": False, "error": "missing tool name"}
    args = args or {}
    result: dict[str, Any]
    if name == "resolve_material":
        query = str(args.get("query") or args.get("material_id") or "")
        material_id = controller._resolve_material_reference(query)
        result = {"ok": bool(material_id), "material_id": material_id, "query": query}
    elif name == "search_materials":
        result = controller.search_materials(args)
        results = result.get("results") or []
        if results:
            aggregate["candidate_results"] = results
            aggregate["actions"].append(
                {
                    "id": "show_search_results",
                    "type": "show_candidates",
                    "label": "Show matching materials",
                    "payload": {"candidates": results},
                }
            )
    elif name == "get_material_workspace":
        material_id = _resolve_arg_material(controller, args.get("material_id"))
        workspace = controller.store.workspace(material_id) if material_id else None
        result = {"workspace": workspace}
        if workspace:
            _capture_material_result(controller, session_id, workspace, aggregate)
    elif name == "get_neighborhood":
        material_id = _resolve_arg_material(controller, args.get("material_id"))
        result = controller.get_neighborhood({"material_id": material_id}) if material_id else {"nodes": [], "edges": []}
        if material_id:
            aggregate["citations"].append({"type": "local_graph", "material_id": material_id})
            _update_material_context(controller, session_id, material_id, "graph_neighborhood")
    elif name == "inspect_edge":
        result = controller.inspect_edge({"edge_id": str(args.get("edge_id") or "")})
        if result.get("edge"):
            aggregate["citations"].append({"type": "local_graph_edge", "edge_id": args.get("edge_id")})
    elif name == "screen_candidates":
        requirement = str(args.get("requirement") or "")
        result = controller.screen_candidates(
            {
                "requirement": requirement,
                "limit": int(args.get("limit") or 8),
                "include_research_candidates": bool(args.get("include_research_candidates", False)),
            }
        )
        candidates = result.get("candidates") or []
        aggregate["candidate_results"] = candidates
        if candidates:
            aggregate["actions"].append(
                {
                    "id": "show_screened_candidates",
                    "type": "show_candidates",
                    "label": "Show ranked candidates",
                    "payload": {"candidates": candidates},
                }
            )
            aggregate["context_updates"]["last_candidate_material_ids"] = [item.get("material_id") for item in candidates[:8]]
            aggregate["context_updates"]["last_screen_requirement"] = requirement
    elif name == "compare_materials":
        material_ids = [_resolve_arg_material(controller, item) or str(item) for item in args.get("material_ids") or []]
        result = controller.compare_materials(
            {
                "material_ids": material_ids,
                "include_evidence": bool(args.get("include_evidence", True)),
                "include_edges": bool(args.get("include_edges", True)),
            }
        )
    elif name == "select_material":
        material_id = _resolve_arg_material(controller, args.get("material_id"))
        workspace = controller.store.workspace(material_id) if material_id else None
        open_inspector = bool(args.get("open_inspector", True))
        result = {"workspace": workspace, "selected_material_id": material_id}
        if workspace and material_id:
            summary = workspace.get("summary") or {}
            title = summary.get("formula_pretty") or material_id
            aggregate["citations"].append({"type": "local_material", "material_id": workspace["resolved_material_id"]})
            aggregate["actions"].append(_open_material_action(workspace["resolved_material_id"], f"Open {title}"))
            aggregate["ui_actions"].extend(_material_focus_ui_actions(workspace["resolved_material_id"], open_inspector=open_inspector))
            _update_material_context(controller, session_id, workspace["resolved_material_id"], "material_workspace")
    elif name == "export_subgraph":
        material_ids = [_resolve_arg_material(controller, item) or str(item) for item in args.get("material_ids") or []]
        result = controller.export_subgraph(
            {
                "material_ids": material_ids,
                "include_evidence": bool(args.get("include_evidence", True)),
                "include_edge_details": bool(args.get("include_edge_details", True)),
            }
        )
        aggregate["actions"].append({"id": "export_subgraph", "type": "export", "label": "Open export", "payload": result})
    elif name == "start_research":
        payload = dict(args)
        payload["session_id"] = session_id
        result = controller.start_research(payload)
        aggregate["actions"].append(
            {
                "id": "start_research",
                "type": "start_research",
                "label": "Open research run",
                "payload": result,
            }
        )
    elif name == "ingest_url":
        payload = dict(args)
        payload["session_id"] = session_id
        result = controller.ingest_url(payload)
    else:
        result = {"ok": False, "error": f"Unknown tool: {name}"}

    trace = {
        "id": f"tool_{uuid4().hex[:16]}",
        "tool": name,
        "args": args,
        "summary": _tool_summary(name, result),
    }
    aggregate["tool_calls"].append({"name": name, "args": args})
    aggregate["tool_results"].append({"tool": name, "result": _compact_tool_result(result)})
    controller.sessions.append_tool_trace(session_id, trace)
    return result


def _assistant_response(
    controller: Any,
    *,
    session_id: str,
    text: str,
    aggregate: dict[str, Any],
    current_workspace: dict[str, Any] | None,
    confidence: str,
    provider: dict[str, Any] | None = None,
) -> dict[str, Any]:
    citations = _dedupe_dicts(aggregate["citations"])
    actions = _dedupe_actions(aggregate["actions"])
    ui_actions = _dedupe_dicts(aggregate["ui_actions"])
    if provider:
        citations.append({"type": "llm_provider", "provider": provider.get("provider"), "model": provider.get("model")})
    if aggregate["context_updates"]:
        controller.sessions.update_session(session_id, {"context": aggregate["context_updates"]})
    assistant = controller.sessions.append_message(
        session_id,
        "assistant",
        text,
        {
            "citations": citations,
            "actions": actions,
            "ui_actions": ui_actions,
            "tool_calls": aggregate["tool_calls"],
        },
    )
    return {
        "session_id": session_id,
        "assistant_message": {
            "id": assistant["id"],
            "text": text,
            "citations": citations,
            "actions": actions,
            "ui_actions": ui_actions,
            "confidence": confidence if confidence in {"grounded", "partial", "research_required"} else "partial",
        },
        "actions": actions,
        "ui_actions": ui_actions,
        "candidate_results": aggregate["candidate_results"],
        "updated_context": compact_session_context(controller.sessions.get_session(session_id)),
    }


def run_local_agent_fallback(
    controller: Any,
    *,
    session_id: str,
    message: str,
    current_workspace: dict[str, Any] | None,
) -> dict[str, Any] | None:
    text = message.strip()
    lowered = text.lower()
    if not _message_requires_tool(text, current_workspace):
        return None

    aggregate = _empty_aggregate()
    wants_select = any(term in lowered for term in {"select", "open", "show", "highlight", "locate", "zoom"})
    wants_find = any(term in lowered for term in {"find", "screen", "recommend", "rank", "candidate", "material"})
    explicit_material = controller._resolve_material_reference(text)

    if explicit_material and not wants_find:
        _execute_tool(
            controller,
            session_id,
            "select_material" if wants_select else "get_material_workspace",
            {"material_id": explicit_material, "open_inspector": True},
            aggregate,
        )
        workspace = (aggregate["tool_results"][0]["result"].get("workspace") if aggregate["tool_results"] else None) or {}
        summary = workspace.get("summary") or {}
        formula = summary.get("formula_pretty") or explicit_material
        return _assistant_response(
            controller,
            session_id=session_id,
            text=f"Loaded **{formula}** (`{explicit_material}`) from the local snapshot.",
            aggregate=aggregate,
            current_workspace=current_workspace,
            confidence="grounded",
        )

    if wants_find:
        requirement = _fallback_requirement(text)
        _execute_tool(
            controller,
            session_id,
            "screen_candidates",
            {"requirement": requirement, "limit": 8, "include_research_candidates": False},
            aggregate,
        )
        candidates = aggregate["candidate_results"] or []
        selected = candidates[0] if candidates else None
        if selected and wants_select:
            _execute_tool(
                controller,
                session_id,
                "select_material",
                {"material_id": selected.get("material_id"), "open_inspector": True},
                aggregate,
            )
        return _assistant_response(
            controller,
            session_id=session_id,
            text=_fallback_screen_text(text, selected, selected_is_open=bool(selected and wants_select)),
            aggregate=aggregate,
            current_workspace=current_workspace,
            confidence="grounded" if selected else "partial",
        )

    if current_workspace and any(term in lowered.split() for term in {"it", "this", "that", "current", "selected"}):
        material_id = current_workspace.get("material_id") or current_workspace.get("resolved_material_id")
        if material_id:
            _execute_tool(
                controller,
                session_id,
                "get_material_workspace",
                {"material_id": material_id},
                aggregate,
            )
            return _assistant_response(
                controller,
                session_id=session_id,
                text=f"Loaded the current material workspace for `{material_id}` from local data.",
                aggregate=aggregate,
                current_workspace=current_workspace,
                confidence="grounded",
            )

    return None


def should_use_local_agent_fast_path(message: str) -> bool:
    text = message.lower()
    application_terms = {"spacecraft", "space craft", "aerospace", "thermal protection"}
    action_terms = {"find", "screen", "recommend", "select", "open", "show", "highlight", "locate"}
    return any(term in text for term in application_terms) and any(term in text for term in action_terms)


def _dynamic_context(session: dict[str, Any], current_workspace: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "current_workspace": current_workspace or {},
        "session": compact_session_context(session),
        "recent_messages": session.get("messages", [])[-12:],
        "tool_traces": session.get("tool_traces", [])[-12:],
    }


def _session_contents(session: dict[str, Any] | None, *, limit: int = 20) -> list[dict[str, Any]]:
    if not session:
        return []
    contents: list[dict[str, Any]] = []
    summary = str(session.get("summary") or "").strip()
    if summary:
        contents.append({"role": "user", "parts": [{"text": f"Prior session summary:\n{summary}"}]})
    for message in session.get("messages", [])[-limit:]:
        role = "model" if message.get("role") == "assistant" else "user"
        text = str(message.get("content") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})
    return contents


def _recent_session_text(session: dict[str, Any] | None, *, limit: int = 12) -> str:
    if not session:
        return ""
    lines = []
    if session.get("summary"):
        lines.append(f"summary: {session['summary']}")
    for message in session.get("messages", [])[-limit:]:
        lines.append(f"{message.get('role')}: {str(message.get('content') or '')[:800]}")
    return "\n".join(lines)


def _resolve_arg_material(controller: Any, value: Any) -> str | None:
    if value is None:
        return None
    text = str(value)
    workspace = controller.store.workspace(text)
    if workspace:
        return workspace.get("resolved_material_id") or text
    return controller._resolve_material_reference(text) or text


def _capture_material_result(controller: Any, session_id: str, workspace: dict[str, Any], aggregate: dict[str, Any]) -> None:
    material_id = workspace.get("resolved_material_id") or workspace.get("material_id")
    if material_id:
        aggregate["citations"].append({"type": "local_material", "material_id": material_id})
        _update_material_context(controller, session_id, material_id, "material_workspace")


def _update_material_context(controller: Any, session_id: str, material_id: str, mode: str) -> None:
    controller.sessions.update_session(
        session_id,
        {
            "context": {
                "last_focus_material_id": material_id,
                "last_referenced_material_id": material_id,
                "current_material_id": material_id,
                "last_focus_mode": mode,
            }
        },
    )


def _material_focus_ui_actions(material_id: str, *, open_inspector: bool = True) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = [
        {"type": "select_node", "material_id": material_id},
        {"type": "highlight_node", "material_id": material_id, "duration_ms": 6500},
        {"type": "zoom_to_node", "material_id": material_id, "scale": 2.6},
    ]
    if open_inspector:
        actions.append({"type": "open_inspector", "material_id": material_id})
    return actions


def _open_material_action(material_id: str, label: str) -> dict[str, Any]:
    return {"id": "open_material", "type": "open_material", "label": label, "payload": {"material_id": material_id}}


def _empty_aggregate() -> dict[str, Any]:
    return {
        "actions": [],
        "ui_actions": [],
        "citations": [],
        "candidate_results": None,
        "tool_calls": [],
        "tool_results": [],
        "context_updates": {},
    }


def _compact_tool_result(result: Any) -> Any:
    if isinstance(result, dict):
        compact = {key: value for key, value in result.items() if key not in {"material", "graph"}}
        if "workspace" in compact and isinstance(compact["workspace"], dict):
            workspace = compact["workspace"]
            compact["workspace"] = {
                "material_id": workspace.get("material_id"),
                "resolved_material_id": workspace.get("resolved_material_id"),
                "summary": workspace.get("summary"),
                "relation_count": workspace.get("relation_count"),
            }
        if "candidates" in compact and isinstance(compact["candidates"], list):
            compact["candidates"] = [
                {
                    "material_id": item.get("material_id"),
                    "formula_pretty": item.get("formula_pretty"),
                    "score": item.get("score"),
                    "matched": item.get("matched"),
                    "missing": item.get("missing"),
                    "penalties": item.get("penalties"),
                    "reason_summary": item.get("reason_summary"),
                    "is_metal": (item.get("material") or {}).get("is_metal"),
                }
                for item in compact["candidates"][:8]
                if isinstance(item, dict)
            ]
        return compact
    return result


def _tool_summary(name: str, result: Any) -> str:
    if isinstance(result, dict):
        if name == "screen_candidates":
            return f"{len(result.get('candidates') or [])} candidates"
        if result.get("workspace"):
            summary = result["workspace"].get("summary") or {}
            return f"workspace {summary.get('formula_pretty') or result['workspace'].get('resolved_material_id')}"
        if "nodes" in result and "edges" in result:
            return f"{len(result.get('nodes') or [])} nodes, {len(result.get('edges') or [])} edges"
    return name


def _extract_text_from_content(content: dict[str, Any]) -> str:
    parts = []
    for part in content.get("parts") or []:
        if isinstance(part.get("text"), str):
            parts.append(part["text"].strip())
    return "\n".join(part for part in parts if part)


def _parse_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            return {}
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}


def _message_requires_tool(message: str, current_workspace: dict[str, Any] | None) -> bool:
    text = message.lower()
    if re.search(r"\bmp-[a-z0-9-]+\b", text):
        return True
    material_terms = {
        "material",
        "candidate",
        "find",
        "screen",
        "recommend",
        "rank",
        "compare",
        "graph",
        "neighbor",
        "neighbour",
        "relation",
        "edge",
        "export",
        "stable",
        "stability",
        "metal",
        "nonmetal",
        "oxide",
        "nitride",
        "band gap",
        "density",
        "chemsys",
        "formula",
        "workspace",
        "spacecraft",
        "aerospace",
        "thermal protection",
        "refractory",
    }
    if any(term in text for term in material_terms):
        return True
    return bool(current_workspace and any(term in text.split() for term in {"it", "this", "that", "current", "selected"}))


def _fallback_requirement(message: str) -> str:
    text = message.lower()
    if any(term in text for term in {"spacecraft", "space craft", "aerospace", "thermal protection"}):
        return f"{message} stable lightweight wide band aerospace high temperature ceramic material"
    if any(term in text for term in {"high temp", "high-temperature", "refractory", "melts", "melting"}):
        return f"{message} stable high temperature refractory material"
    return message


def _fallback_screen_text(message: str, selected: dict[str, Any] | None, *, selected_is_open: bool) -> str:
    if not selected:
        return "I could not find a matching local material candidate for that request."
    material = selected.get("material") or {}
    material_id = selected.get("material_id") or material.get("material_id")
    formula = selected.get("formula_pretty") or material.get("formula_pretty") or material_id
    density = material.get("density")
    band_gap = material.get("band_gap")
    stable = material.get("is_stable")
    facts = []
    if stable is not None:
        facts.append("stable in the local snapshot" if stable else "not marked stable in the local snapshot")
    if density is not None:
        facts.append(f"density {float(density):.2f} g/cm3")
    if band_gap is not None:
        facts.append(f"band gap {float(band_gap):.2f} eV")
    basis = "; ".join(facts) if facts else selected.get("reason_summary") or "ranked by local screening"
    prefix = "Selected" if selected_is_open else "Top local candidate"
    return (
        f"{prefix}: **{formula}** (`{material_id}`).\n\n"
        f"Why: {basis}.\n\n"
        f"Local screening note: application-specific claims from '{message}' still need literature evidence, "
        "but this is the best local-data pick for the demo."
    )


def _dedupe_dicts(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for item in items:
        key = json.dumps(item, sort_keys=True, default=str)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _dedupe_actions(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    result = []
    for item in items:
        key = (item.get("type"), json.dumps(item.get("payload"), sort_keys=True, default=str))
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
