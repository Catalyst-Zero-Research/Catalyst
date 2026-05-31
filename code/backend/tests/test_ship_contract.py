from __future__ import annotations

import json
from pathlib import Path
from urllib import error

from fastapi.testclient import TestClient

from catalyst.agent_tools import CatalystAgentTools, tool_catalog
from catalyst.candidate_sets import CandidateSetStore
from catalyst.local_api import app
from catalyst.local_store import LocalCatalystStore
from catalyst.preflight import run_preflight
from catalyst.providers.gemini import generate_gemini_agent_turn
from catalyst.screening import parse_requirements, screen_candidates
from catalyst.session_store import SessionStore
from catalyst.settings import load_settings


REPO_ROOT = Path(__file__).resolve().parents[3]


def _install_fake_gemma_agent(monkeypatch, mapping: dict[str, dict]) -> None:
    def fake_turn(settings, *, contents, system_instruction=None, tools=None, temperature=0.2, max_output_tokens=1024):
        prompt = "\n".join(
            part.get("text", "")
            for content in contents
            for part in content.get("parts", [])
            if isinstance(part.get("text"), str)
        )
        for message, spec in mapping.items():
            if "Decide what tools to call" in prompt and f"Current user message: {message}" in prompt:
                plan = {"tool_calls": spec.get("tool_calls", [])}
                if spec.get("respond_directly"):
                    plan["respond_directly"] = spec["respond_directly"]
                return {
                    "provider": "gemini",
                    "model": "gemma-4-31b-it",
                    "text": json.dumps(plan),
                    "function_calls": [],
                    "content": {"role": "model", "parts": []},
                    "usage": {},
                }
            if "You called tools" in prompt and f"User message: {message}" in prompt:
                final = {
                    "text": spec.get("text", "I ran the requested Catalyst tool call."),
                    "confidence": spec.get("confidence", "grounded"),
                }
                return {
                    "provider": "gemini",
                    "model": "gemma-4-31b-it",
                    "text": json.dumps(final),
                    "function_calls": [],
                    "content": {"role": "model", "parts": []},
                    "usage": {},
                }
        return {
            "provider": "gemini",
            "model": "gemma-4-31b-it",
            "text": json.dumps({"respond_directly": {"text": "Fake LLM default.", "confidence": "partial"}}),
            "function_calls": [],
            "content": {"role": "model", "parts": []},
            "usage": {},
        }

    monkeypatch.setattr("catalyst.agent_loop.generate_gemini_agent_turn", fake_turn)


def test_catalog_settings_and_preflight_contract() -> None:
    client = TestClient(app)
    catalog = client.get("/catalog")
    assert catalog.status_code == 200
    body = catalog.json()
    assert body["product"] == "Catalyst"
    assert body["counts"]["materials"] >= 10000
    assert body["counts"]["material_material_edges"] > 0
    assert body["capabilities"]["agent"] is True

    schema = client.get("/settings/schema")
    assert schema.status_code == 200
    assert schema.json()["title"] == "CatalystSettings"

    settings = client.get("/settings")
    assert settings.status_code == 200
    assert "provider_status" in settings.json()
    unchanged_restore = settings.json()["settings"]["sessions"]["restore_last_session"]
    patched = client.patch("/settings", json={"sessions": {"restore_last_session": unchanged_restore}})
    assert patched.status_code == 200
    assert patched.json()["settings"]["sessions"]["restore_last_session"] == unchanged_restore

    preflight = run_preflight(REPO_ROOT, check_ports=False)
    assert preflight["status"] == "ok"


def test_openapi_contract_contains_ship_endpoints() -> None:
    client = TestClient(app)
    schema = client.get("/openapi.json")
    assert schema.status_code == 200
    paths = schema.json()["paths"]
    for path in (
        "/catalog",
        "/settings",
        "/graph/view",
        "/graph/materials",
        "/materials/{material_id}/structure",
        "/materials/{material_id}/details",
        "/screen",
        "/compare",
        "/sessions",
        "/agent/chat",
        "/research/query",
        "/research/ingest-url",
    ):
        assert path in paths


def test_screening_parser_and_candidate_ranking() -> None:
    parsed, unsupported = parse_requirements(
        "Find lightweight oxide semiconductor materials stable above 500 C with fatigue resistance"
    )
    parsed_ids = {item["id"] for item in parsed}
    assert {"lightweight", "contains_o", "semiconductor_gap", "stability"}.issubset(parsed_ids)
    assert unsupported

    store = LocalCatalystStore(REPO_ROOT)
    result = screen_candidates(store, "Find stable oxide semiconductor materials", limit=5)
    assert result["candidates"]
    top = result["candidates"][0]
    assert 0 <= top["score"] <= 100
    assert top["reason_summary"]
    assert top["evidence_refs"]


def test_sessions_candidate_sets_and_exports_persist() -> None:
    sessions = SessionStore(REPO_ROOT)
    session = sessions.create_session(title="Contract test", context={"current_material_id": "mp-ckgno"})
    assert sessions.get_session(session["session_id"])["context"]["current_material_id"] == "mp-ckgno"
    sessions.append_message(session["session_id"], "user", "find stable oxides")
    loaded = sessions.get_session(session["session_id"])
    assert loaded and loaded["messages"]

    candidate_sets = CandidateSetStore(REPO_ROOT)
    candidate_set = candidate_sets.create_set(
        session_id=session["session_id"],
        candidates=[{"material_id": "mp-ckgno", "score": 91}],
        requirement="stable oxide",
    )
    assert candidate_sets.get_set(candidate_set["candidate_set_id"])["candidates"][0]["material_id"] == "mp-ckgno"

    client = TestClient(app)
    exported = client.post(
        "/export/candidates",
        json={"candidate_set_id": candidate_set["candidate_set_id"], "format": "json"},
    )
    assert exported.status_code == 200
    assert exported.json()["format"] == "json"


def test_agent_uses_local_tool_fallback_when_llm_unavailable(monkeypatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    settings = load_settings(REPO_ROOT)
    catalog = tool_catalog(settings)
    assert "screen_candidates" in catalog["tools"]

    store = LocalCatalystStore(REPO_ROOT)
    agent = CatalystAgentTools(REPO_ROOT, store, settings)
    session = SessionStore(REPO_ROOT).create_session(title="Agent contract")
    response = agent.local_chat(
        session_id=session["session_id"],
        message="find me a spacecraft material in here and select it",
        current_workspace={},
    )
    assert response["assistant_message"]["text"]
    assert "LLM/tool loop is unavailable" not in response["assistant_message"]["text"]
    assert response["assistant_message"]["confidence"] == "grounded"
    assert response["candidate_results"]
    assert response["ui_actions"]
    assert any(action["type"] == "select_node" for action in response["ui_actions"])


def test_gemini_provider_retries_configured_fallback_model(monkeypatch) -> None:
    settings = load_settings(REPO_ROOT)
    settings.providers.models["gemini"] = "gemini-primary-broken"
    settings.providers.fallback_models["gemini"] = ["gemini-3.1-flash-lite"]
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    requested_urls: list[str] = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

        def read(self) -> bytes:
            return json.dumps(
                {
                    "candidates": [
                        {
                            "content": {
                                "role": "model",
                                "parts": [{"text": "Fallback model answered with full context."}],
                            }
                        }
                    ],
                    "usageMetadata": {"promptTokenCount": 11},
                }
            ).encode("utf-8")

    def fake_urlopen(req, timeout=30):
        requested_urls.append(req.full_url)
        if "gemini-primary-broken" in req.full_url:
            raise error.URLError("primary unavailable")
        return FakeResponse()

    monkeypatch.setattr("catalyst.providers.gemini.request.urlopen", fake_urlopen)

    turn = generate_gemini_agent_turn(
        settings,
        contents=[{"role": "user", "parts": [{"text": "use all context"}]}],
        system_instruction="full catalyst context",
        temperature=0.1,
        max_output_tokens=128,
    )

    assert turn["model"] == "gemini-3.1-flash-lite"
    assert "Fallback model answered" in turn["text"]
    assert any("gemini-primary-broken" in url for url in requested_urls)
    assert any("gemini-3.1-flash-lite" in url for url in requested_urls)


def test_agent_material_resolution_is_tool_executor_only(monkeypatch) -> None:
    settings = load_settings(REPO_ROOT)
    settings.providers.active_provider = "gemini"
    settings.providers.models["gemini"] = "gemma-4-31b-it"
    _install_fake_gemma_agent(
        monkeypatch,
        {
            "tell me about mgGa2": {
                "tool_calls": [{"name": "get_material_workspace", "args": {"material_id": "mgGa2"}}],
                "text": "MgGa2 came from the LLM-requested workspace tool.",
            },
            "tell me about mgga2": {
                "tool_calls": [{"name": "get_material_workspace", "args": {"material_id": "mgga2"}}],
                "text": "Compact MgGa2 came from the LLM-requested workspace tool.",
            },
        },
    )
    store = LocalCatalystStore(REPO_ROOT)
    agent = CatalystAgentTools(REPO_ROOT, store, settings)
    session = SessionStore(REPO_ROOT).create_session(title="Formula focus contract")

    lower_response = agent.local_chat(
        session_id=session["session_id"],
        message="tell me about mgGa2",
        current_workspace={"material_id": "mp-ckhif", "formula_pretty": "Mg5Ga", "chemsys": "Ga-Mg"},
    )
    assert "LLM-requested workspace tool" in lower_response["assistant_message"]["text"]
    assert "Mg5Ga is in the local Catalyst snapshot" not in lower_response["assistant_message"]["text"]
    assert lower_response["assistant_message"]["confidence"] == "grounded"

    compact_response = agent.local_chat(
        session_id=session["session_id"],
        message="tell me about mgga2",
        current_workspace={"material_id": "mp-ckhif", "formula_pretty": "Mg5Ga", "chemsys": "Ga-Mg"},
    )
    assert "Compact MgGa2" in compact_response["assistant_message"]["text"]


def test_agent_material_focus_commands_emit_ui_actions_and_resolve_pronouns(monkeypatch) -> None:
    settings = load_settings(REPO_ROOT)
    settings.providers.active_provider = "gemini"
    settings.providers.models["gemini"] = "gemma-4-31b-it"
    _install_fake_gemma_agent(
        monkeypatch,
        {
            "locate and highlight MnO2": {
                "tool_calls": [{"name": "select_material", "args": {"material_id": "MnO2", "open_inspector": True}}],
                "text": "Located MnO2 by LLM tool call.",
            },
            "select it and show me": {
                "tool_calls": [{"name": "select_material", "args": {"material_id": "MnO2", "open_inspector": True}}],
                "text": "Located MnO2 by LLM pronoun-resolution tool call.",
            },
        },
    )
    store = LocalCatalystStore(REPO_ROOT)
    agent = CatalystAgentTools(REPO_ROOT, store, settings)
    session = SessionStore(REPO_ROOT).create_session(title="Agent UI action contract")

    locate = agent.local_chat(
        session_id=session["session_id"],
        message="locate and highlight MnO2",
        current_workspace={"material_id": "mp-ckhif", "formula_pretty": "Mg5Ga", "chemsys": "Ga-Mg"},
    )
    assert "Located MnO2" in locate["assistant_message"]["text"]
    assert any(action["type"] == "select_node" for action in locate["ui_actions"])
    mnos = {action.get("material_id") for action in locate["ui_actions"]}
    assert len(mnos) == 1
    mno_id = next(iter(mnos))

    select_it = agent.local_chat(
        session_id=session["session_id"],
        message="select it and show me",
        current_workspace={"material_id": "mp-ckhif", "formula_pretty": "Mg5Ga", "chemsys": "Ga-Mg"},
    )
    assert "Located MnO2" in select_it["assistant_message"]["text"]
    assert {action.get("material_id") for action in select_it["ui_actions"]} == {mno_id}


def test_llm_agent_loop_screens_instead_of_selecting_current_nonmetal(monkeypatch) -> None:
    settings = load_settings(REPO_ROOT)
    settings.providers.active_provider = "gemini"
    settings.providers.models["gemini"] = "gemma-4-31b-it"

    def fake_turn(settings, *, contents, system_instruction=None, tools=None, temperature=0.2, max_output_tokens=1024):
        prompt = "\n".join(
            part.get("text", "")
            for content in contents
            for part in content.get("parts", [])
            if isinstance(part.get("text"), str)
        )
        if "Decide what tools to call" in prompt:
            return {
                "provider": "gemini",
                "model": "gemma-4-31b-it",
                "text": (
                    '{"tool_calls":[{"name":"screen_candidates","args":'
                    '{"requirement":"find me a good metal in here","limit":5}}]}'
                ),
                "function_calls": [],
                "content": {"role": "model", "parts": []},
                "usage": {},
            }
        return {
            "provider": "gemini",
            "model": "gemma-4-31b-it",
            "text": (
                '{"text":"You are right: WO3 is non-metal in the local snapshot. '
                'I screened metallic candidates instead.","confidence":"grounded"}'
            ),
            "function_calls": [],
            "content": {"role": "model", "parts": []},
            "usage": {},
        }

    monkeypatch.setattr("catalyst.agent_loop.generate_gemini_agent_turn", fake_turn)
    store = LocalCatalystStore(REPO_ROOT)
    agent = CatalystAgentTools(REPO_ROOT, store, settings)
    session = SessionStore(REPO_ROOT).create_session(title="LLM first transcript regression")

    response = agent.local_chat(
        session_id=session["session_id"],
        message="find me a good metal in here",
        current_workspace={"material_id": "mp-bctv", "formula_pretty": "WO3", "chemsys": "O-W"},
    )

    assert "WO3 is non-metal" in response["assistant_message"]["text"]
    assert response["candidate_results"]
    assert response["candidate_results"][0]["material"]["is_metal"] is True
    assert not any(action.get("material_id") == "mp-bctv" for action in response["ui_actions"])
    assert (REPO_ROOT / "data/local/agent/compiled_context.md").exists()


def test_llm_only_search_does_not_anchor_to_selected_material(monkeypatch) -> None:
    settings = load_settings(REPO_ROOT)
    settings.providers.active_provider = "gemini"
    settings.providers.models["gemini"] = "gemma-4-31b-it"
    _install_fake_gemma_agent(
        monkeypatch,
        {
            "so like, tell me the most metal compount in the data u have": {
                "tool_calls": [
                    {
                        "name": "screen_candidates",
                        "args": {"requirement": "so like, tell me the most metal compount in the data u have", "limit": 8},
                    }
                ],
                "text": "I screened candidates by LLM tool call instead of opening U5Sb4.",
            },
            "wtf?": {
                "tool_calls": [
                    {
                        "name": "screen_candidates",
                        "args": {"requirement": "so like, tell me the most metal compount in the data u have", "limit": 8},
                    }
                ],
                "text": "You are right to question it; I reran the candidate search through tools.",
            },
        },
    )
    store = LocalCatalystStore(REPO_ROOT)
    agent = CatalystAgentTools(REPO_ROOT, store, settings)
    session = SessionStore(REPO_ROOT).create_session(title="LLM-only dataset search regression")

    response = agent.local_chat(
        session_id=session["session_id"],
        message="so like, tell me the most metal compount in the data u have",
        current_workspace={"material_id": "mp-cqsxq", "formula_pretty": "U5Sb4", "chemsys": "Sb-U"},
    )

    assert response["candidate_results"]
    assert "U5Sb4 is in the local Catalyst snapshot" not in response["assistant_message"]["text"]
    assert "screened" in response["assistant_message"]["text"].lower()

    repair = agent.local_chat(
        session_id=session["session_id"],
        message="wtf?",
        current_workspace={"material_id": "mp-cqsxq", "formula_pretty": "U5Sb4", "chemsys": "Sb-U"},
    )

    assert "right to question" in repair["assistant_message"]["text"]
    assert repair["candidate_results"]
    assert repair["assistant_message"]["confidence"] == "grounded"


def test_llm_only_live_prompt_classes_use_tool_calls_not_random_selection(monkeypatch) -> None:
    settings = load_settings(REPO_ROOT)
    settings.providers.active_provider = "gemini"
    settings.providers.models["gemini"] = "gemma-4-31b-it"
    _install_fake_gemma_agent(
        monkeypatch,
        {
            "find me a good material which melts at high temps": {
                "tool_calls": [
                    {
                        "name": "screen_candidates",
                        "args": {"requirement": "find me a good material which melts at high temps", "limit": 8},
                    }
                ],
                "text": "I used screening as a local-data proxy; melting point needs literature.",
                "confidence": "research_required",
            },
            "why this?": {
                "tool_calls": [
                    {
                        "name": "screen_candidates",
                        "args": {"requirement": "find me a good material which melts at high temps", "limit": 8},
                    }
                ],
                "text": "That ranking came from the previous LLM-requested screening tool call.",
            },
            "find me cu": {
                "tool_calls": [{"name": "search_materials", "args": {"query": "Cu", "elements": ["Cu"], "limit": 8}}],
                "text": "I searched Cu-containing materials by LLM tool call.",
            },
            "find me a material to make plane blades": {
                "tool_calls": [
                    {
                        "name": "screen_candidates",
                        "args": {"requirement": "find me a material to make plane blades", "limit": 8},
                    }
                ],
                "text": "I used screening as a local-data proxy; aircraft blade suitability needs research evidence.",
                "confidence": "research_required",
            },
        },
    )
    store = LocalCatalystStore(REPO_ROOT)
    agent = CatalystAgentTools(REPO_ROOT, store, settings)
    session = SessionStore(REPO_ROOT).create_session(title="Live bad UX regression")
    workspace = {"material_id": "mp-bkrla", "formula_pretty": "MnO2", "chemsys": "Mn-O"}

    high_temp = agent.local_chat(
        session_id=session["session_id"],
        message="find me a good material which melts at high temps",
        current_workspace=workspace,
    )
    assert high_temp["candidate_results"]
    assert "Located MnO2" not in high_temp["assistant_message"]["text"]
    assert "local-data proxy" in high_temp["assistant_message"]["text"]

    why = agent.local_chat(
        session_id=session["session_id"],
        message="why this?",
        current_workspace=workspace,
    )
    assert "previous LLM-requested screening" in why["assistant_message"]["text"]
    assert why["candidate_results"]

    copper = agent.local_chat(
        session_id=session["session_id"],
        message="find me cu",
        current_workspace=workspace,
    )
    assert copper["candidate_results"]
    assert "Cu-containing" in copper["assistant_message"]["text"]
    assert all("Cu" in f"{item.get('formula_pretty')} {item.get('chemsys')}" for item in copper["candidate_results"])

    blade = agent.local_chat(
        session_id=session["session_id"],
        message="find me a material to make plane blades",
        current_workspace=workspace,
    )
    assert blade["candidate_results"]
    assert "Located MnO2" not in blade["assistant_message"]["text"]
    assert "local-data proxy" in blade["assistant_message"]["text"]


def test_new_api_endpoints() -> None:
    client = TestClient(app)
    session = client.post("/sessions", json={"title": "API contract"}).json()
    session_id = session["session_id"]

    screen = client.post("/screen", json={"requirement": "Find stable oxide semiconductor materials"})
    assert screen.status_code == 200
    assert screen.json()["candidates"]

    compare = client.post("/compare", json={"material_ids": ["mp-ckgno", "mp-bkrla"]})
    assert compare.status_code == 200
    assert compare.json()["materials"]

    overview = client.get("/graph/overview?limit_clusters=20")
    assert overview.status_code == 200
    cluster_id = overview.json()["nodes"][0]["id"]
    cluster_node = client.get(f"/graph/nodes/{cluster_id}")
    assert cluster_node.status_code == 200
    assert cluster_node.json()["type"] == "cluster"
    assert cluster_node.json()["summary"]["material_count"] >= 1
    cluster_edge_id = overview.json()["edges"][0]["id"]
    cluster_edge = client.get(f"/edges/{cluster_edge_id}")
    assert cluster_edge.status_code == 200
    assert cluster_edge.json()["type"] == "SHARED_DOMINANT_ELEMENT"

    graph_view = client.get("/graph/view?limit_nodes=500&include_elements=false&include_clusters=false")
    assert graph_view.status_code == 200
    graph_view_body = graph_view.json()
    assert graph_view_body["meta"]["slice_contract"] == "working_slice"
    assert graph_view_body["meta"]["full_graph_available"] is True
    assert graph_view_body["meta"]["visible_node_count"] == len(graph_view_body["nodes"])
    assert len(graph_view_body["nodes"]) == 500
    assert all(node["type"] == "material" for node in graph_view_body["nodes"])
    assert any(edge["source"] != edge["target"] for edge in graph_view_body["edges"])

    semantic_view = client.get("/graph/view?limit_nodes=600&include_elements=true&include_clusters=true")
    assert semantic_view.status_code == 200
    semantic_body = semantic_view.json()
    assert len(semantic_body["nodes"]) <= 600
    assert 250 <= semantic_body["meta"]["visible_material_count"] <= 450
    assert semantic_body["meta"]["visible_element_count"] > 0
    assert semantic_body["meta"]["visible_cluster_count"] > 0
    assert semantic_body["meta"]["visible_cluster_count"] < 250
    assert any(node["type"] == "material" for node in semantic_body["nodes"])
    assert any(node["type"] == "element" for node in semantic_body["nodes"])
    assert any(node["type"] == "cluster" for node in semantic_body["nodes"])
    assert any(edge["type"] == "CONTAINS_ELEMENT" for edge in semantic_body["edges"])
    assert any(edge["type"] == "BELONGS_TO_CLUSTER" for edge in semantic_body["edges"])
    semantic_material = next(node for node in semantic_body["nodes"] if node["type"] == "material")
    semantic_element = next(node for node in semantic_body["nodes"] if node["type"] == "element")
    semantic_cluster = next(node for node in semantic_body["nodes"] if node["type"] == "cluster")
    assert client.get(f"/graph/nodes/{semantic_material['id']}").status_code == 200
    assert client.get(f"/graph/nodes/{semantic_element['id']}").status_code == 200
    assert client.get(f"/graph/nodes/{semantic_cluster['id']}").status_code == 200

    material_graph = client.get("/graph/materials?limit_materials=200&include_elements=true&include_clusters=true")
    assert material_graph.status_code == 200
    material_graph_body = material_graph.json()
    assert material_graph_body["meta"]["material_count"] == 200
    assert any(node["type"] == "material" for node in material_graph_body["nodes"])
    assert any(node["type"] == "element" for node in material_graph_body["nodes"])
    assert any(node["type"] == "cluster" for node in material_graph_body["nodes"])
    graph_material = next(node for node in material_graph_body["nodes"] if node["type"] == "material")
    graph_material_detail = client.get(f"/graph/nodes/{graph_material['id']}")
    assert graph_material_detail.status_code == 200
    assert graph_material_detail.json()["type"] == "material"

    neighborhood = client.get("/materials/mp-ckgno/neighborhood?depth=2&limit_nodes=120")
    assert neighborhood.status_code == 200
    assert neighborhood.json()["meta"]["depth"] == 2
    assert neighborhood.json()["meta"]["limit_nodes"] == 120
    material_node = client.get("/graph/nodes/mp-ckgno")
    assert material_node.status_code == 200
    assert material_node.json()["type"] == "material"
    element_edge = next(edge for edge in neighborhood.json()["edges"] if edge["type"] == "CONTAINS_ELEMENT")
    element_node = client.get(f"/graph/nodes/{element_edge['target']}")
    assert element_node.status_code == 200
    assert element_node.json()["type"] == "element"
    element_edge_id = f"element:{element_edge['source']}:{element_edge['target']}"
    element_edge = client.get(f"/edges/{element_edge_id}")
    assert element_edge.status_code == 200
    assert element_edge.json()["type"] == "CONTAINS_ELEMENT"

    structure = client.get("/materials/mp-ckgno/structure")
    assert structure.status_code == 200
    structure_body = structure.json()
    assert structure_body["resolved_material_id"] == "mp-ckgno"
    assert "lattice" in structure_body
    assert isinstance(structure_body.get("sites"), list)

    details = client.get(
        "/materials/mp-ckgno/details?sections=thermo,electronic_structure,bonds,spectra&limit=2&downsample=true"
    )
    assert details.status_code == 200
    details_body = details.json()
    assert details_body["resolved_material_id"] == "mp-ckgno"
    assert "thermo" in details_body["details"]
    assert "electronic_structure" in details_body["details"]
    assert details_body["limit"] == 2

    chat = client.post(
        "/agent/chat",
        json={"session_id": session_id, "message": "Explain mp-bkrla"},
    )
    assert chat.status_code == 200
    assert chat.json()["assistant_message"]["confidence"] in {"grounded", "partial"}

    research = client.post("/research/query", json={"session_id": session_id, "query": "fatigue alloy"})
    assert research.status_code == 200
    assert research.json()["status"] in {"completed", "disabled", "queued"}
