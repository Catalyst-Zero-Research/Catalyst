from __future__ import annotations

import json
from pathlib import Path
from typing import Any


AGENT_DIR = Path("data/local/agent")
CONTEXT_FILE = "agent_context.json"
TOOL_REGISTRY_FILE = "tool_registry.json"
COMPILED_CONTEXT_JSON = "compiled_context.json"
COMPILED_CONTEXT_MARKDOWN = "compiled_context.md"


DEFAULT_AGENT_CONTEXT: dict[str, Any] = {
    "product": {
        "name": "Catalyst",
        "pitch": "AI Native Materials Discovery Workspace",
        "data_boundary": "Use local Catalyst snapshot data and tool results for material claims.",
    },
    "persona": {
        "voice": "scientific, direct, concise, and normal-chat capable",
        "rules": [
            "Answer normal conversational messages normally.",
            "Do not invent material properties, IDs, citations, or validated claims.",
            "When a material/tool result is available, ground the answer in that result.",
            "When the user asks to locate, select, show, highlight, or zoom to a material, return UI actions.",
        ],
    },
    "runtime": {
        "reasoning_mode": "medium",
        "max_tool_iterations": 4,
        "hydrate_tool_traces_into_context": False,
    },
    "agent_contract": {
        "mode": "llm_first_tool_loop",
        "rules": [
            "Every assistant reply must be produced by the LLM.",
            "Use tools for local material IDs, properties, graph relations, screening, comparison, export, and UI actions.",
            "Never guess a material property when a local tool can answer it.",
            "If the LLM or tool loop fails, report that failure instead of using deterministic intent matching.",
            "If the user asks for something outside Catalyst materials discovery, redirect briefly to Catalyst capabilities.",
            "When correcting a previous mistake, say the correction plainly and use the right tool next.",
        ],
    },
}


DEFAULT_TOOL_REGISTRY: dict[str, Any] = {
    "tools": [
        {
            "name": "resolve_material",
            "description": "Resolve a formula or Materials Project id to a Catalyst material id.",
            "parameters": {"query": "string: formula, mp-id, or free-text material mention"},
            "returns": "material_id or null",
            "ui_safe": False,
        },
        {
            "name": "search_materials",
            "description": "Search and filter the local Catalyst materials snapshot.",
            "parameters": {
                "query": "string",
                "limit": "integer",
                "elements": "string[]",
                "chemsys": "string",
                "stable": "boolean",
                "metal": "boolean",
                "magnetic": "boolean",
                "band_gap_min": "number",
                "band_gap_max": "number",
            },
            "returns": "ranked local material search results",
            "ui_safe": False,
        },
        {
            "name": "get_material_workspace",
            "description": "Load grounded properties, evidence, and graph context for one material.",
            "parameters": {"material_id": "string: local material id, mp-id, or formula"},
            "returns": "workspace summary, evidence, properties, and graph slice",
            "ui_safe": False,
        },
        {
            "name": "get_neighborhood",
            "description": "Load directly connected graph neighbors for one material.",
            "parameters": {"material_id": "string: local material id, mp-id, or formula"},
            "returns": "neighbor nodes and edges",
            "ui_safe": False,
        },
        {
            "name": "inspect_edge",
            "description": "Inspect one graph edge by id.",
            "parameters": {"edge_id": "string"},
            "returns": "grounded edge detail",
            "ui_safe": False,
        },
        {
            "name": "screen_candidates",
            "description": "Rank candidate materials for a natural-language requirement.",
            "parameters": {
                "requirement": "string",
                "limit": "integer",
                "include_research_candidates": "boolean",
            },
            "returns": "parsed requirements and ranked candidates",
            "ui_safe": False,
        },
        {
            "name": "compare_materials",
            "description": "Compare two or more local material ids.",
            "parameters": {"material_ids": "string[]", "include_evidence": "boolean", "include_edges": "boolean"},
            "returns": "comparison table data and evidence",
            "ui_safe": False,
        },
        {
            "name": "select_material",
            "description": "Ask the UI to select, highlight, zoom to, and inspect one material.",
            "parameters": {"material_id": "string: local material id, mp-id, or formula", "open_inspector": "boolean"},
            "returns": "ui_actions for graph/workspace focus",
            "ui_safe": True,
        },
        {
            "name": "export_subgraph",
            "description": "Export a grounded subgraph for selected material ids.",
            "parameters": {"material_ids": "string[]", "include_evidence": "boolean", "include_edge_details": "boolean"},
            "returns": "export payload",
            "ui_safe": True,
        },
        {
            "name": "start_research",
            "description": "Start literature/research mode when local data is insufficient.",
            "parameters": {"query": "string", "sources": "string[]", "limit": "integer"},
            "returns": "research run status",
            "ui_safe": True,
        },
        {
            "name": "ingest_url",
            "description": "Ingest a URL into local research mode when enabled.",
            "parameters": {"url": "string", "purpose": "string"},
            "returns": "ingest status",
            "ui_safe": True,
        },
    ]
}


def ensure_agent_runtime_files(repo_root: Path) -> dict[str, Any]:
    agent_dir = repo_root / AGENT_DIR
    agent_dir.mkdir(parents=True, exist_ok=True)
    context_path = agent_dir / CONTEXT_FILE
    tools_path = agent_dir / TOOL_REGISTRY_FILE
    if not context_path.exists():
        context_path.write_text(json.dumps(DEFAULT_AGENT_CONTEXT, indent=2) + "\n", encoding="utf-8")
    if not tools_path.exists():
        tools_path.write_text(json.dumps(DEFAULT_TOOL_REGISTRY, indent=2) + "\n", encoding="utf-8")
    return {
        "context_path": str(context_path),
        "tool_registry_path": str(tools_path),
        "context": load_agent_context(repo_root),
        "tool_registry": load_tool_registry(repo_root),
    }


def load_agent_context(repo_root: Path) -> dict[str, Any]:
    path = repo_root / AGENT_DIR / CONTEXT_FILE
    if not path.exists():
        return DEFAULT_AGENT_CONTEXT
    return json.loads(path.read_text(encoding="utf-8"))


def load_tool_registry(repo_root: Path) -> dict[str, Any]:
    path = repo_root / AGENT_DIR / TOOL_REGISTRY_FILE
    if not path.exists():
        return DEFAULT_TOOL_REGISTRY
    return json.loads(path.read_text(encoding="utf-8"))


def render_developer_instructions(repo_root: Path, dynamic_context: dict[str, Any] | None = None) -> str:
    payload = build_agent_context_payload(repo_root, dynamic_context)
    return render_agent_context_markdown(payload)


def build_agent_context_payload(repo_root: Path, dynamic_context: dict[str, Any] | None = None) -> dict[str, Any]:
    config = load_agent_context(repo_root)
    registry = load_tool_registry(repo_root)
    return {
        "agent_context": config,
        "tool_registry": registry,
        "dynamic_context": dynamic_context or {},
    }


def write_compiled_agent_context(repo_root: Path, dynamic_context: dict[str, Any] | None = None) -> dict[str, Any]:
    agent_dir = repo_root / AGENT_DIR
    agent_dir.mkdir(parents=True, exist_ok=True)
    payload = build_agent_context_payload(repo_root, dynamic_context)
    markdown = render_agent_context_markdown(payload)
    json_path = agent_dir / COMPILED_CONTEXT_JSON
    markdown_path = agent_dir / COMPILED_CONTEXT_MARKDOWN
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(markdown + "\n", encoding="utf-8")
    return {
        "payload": payload,
        "markdown": markdown,
        "json_path": str(json_path),
        "markdown_path": str(markdown_path),
    }


def render_agent_context_markdown(payload: dict[str, Any]) -> str:
    config = payload.get("agent_context", {})
    registry = payload.get("tool_registry", {})
    dynamic_context = payload.get("dynamic_context", {})
    product = config.get("product", {})
    persona = config.get("persona", {})
    runtime = config.get("runtime", {})
    contract = config.get("agent_contract", {})
    rules = persona.get("rules") or []
    contract_rules = contract.get("rules") or []
    tools = registry.get("tools") or []
    lines = [
        f"# {product.get('name', 'Catalyst')} Agent Instructions",
        "",
        f"Pitch: {product.get('pitch', 'AI Native Materials Discovery Workspace')}",
        f"Data boundary: {product.get('data_boundary', 'Use tool-grounded data only.')}",
        f"Voice: {persona.get('voice', 'scientific and direct')}",
        f"Agent mode: {contract.get('mode', 'llm_first_tool_loop')}",
        f"Reasoning mode: {runtime.get('reasoning_mode', 'medium')}",
        f"Max tool iterations: {runtime.get('max_tool_iterations', 4)}",
        "",
        "## Rules",
    ]
    lines.extend(f"- {rule}" for rule in rules)
    lines.extend(f"- {rule}" for rule in contract_rules)
    if tools:
        lines.extend(["", "## Available Tools"])
        for tool in tools:
            ui_safe = "UI-safe" if tool.get("ui_safe") else "data/tool"
            lines.append(f"- `{tool.get('name')}` ({ui_safe}): {tool.get('description')}")
            if tool.get("parameters"):
                lines.append(f"  - parameters: `{json.dumps(tool.get('parameters'), sort_keys=True)}`")
            if tool.get("returns"):
                lines.append(f"  - returns: {tool.get('returns')}")
    lines.extend(["", "## Dynamic Catalyst Context", "```json"])
    lines.append(json.dumps(dynamic_context, indent=2, sort_keys=True))
    lines.append("```")
    return "\n".join(lines).strip()
