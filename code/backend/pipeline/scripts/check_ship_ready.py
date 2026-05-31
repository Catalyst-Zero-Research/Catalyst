from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from fastapi.testclient import TestClient

from catalyst.local_api import app
from catalyst.local_store import LocalCatalystStore
from catalyst.preflight import run_preflight
from catalyst.settings import ensure_local_dirs, load_settings
from catalyst.util import find_repo_root
from catalyst.validate_recovery import validate_recovery


def _assert(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def _json(response: Any) -> dict[str, Any]:
    try:
        return response.json()
    except Exception:
        return {}


def run_ship_check(repo_root: Path | None = None) -> dict[str, Any]:
    root = repo_root or find_repo_root(Path.cwd())
    ensure_local_dirs(root)
    settings = load_settings(root)
    failures: list[str] = []
    checks: dict[str, bool] = {}

    preflight = run_preflight(root, check_ports=False)
    checks["preflight_no_ports"] = preflight["status"] == "ok"
    failures.extend(preflight["failures"])

    recovery = validate_recovery(root)
    checks["recovery_validation"] = recovery["status"] == "ok"
    if recovery["status"] != "ok":
        failures.extend(recovery.get("failures", []))

    store = LocalCatalystStore(root, settings.runtime.source_release)
    catalog = store.catalog()
    checks["catalog_counts"] = catalog["counts"]["materials"] >= 10000 and catalog["counts"]["material_material_edges"] > 0
    _assert(checks["catalog_counts"], "Catalog counts are below expected ship threshold", failures)

    processed = store.get_material("mp-ckgno")
    target = store.get_material("mp-bkrla")
    checks["golden_materials"] = bool(processed and target)
    _assert(checks["golden_materials"], "Golden material lookup failed", failures)

    formula_search = store.search("MnO2", limit=5)
    chemsys_search = store.search("", chemsys="Mn-O", limit=5)
    filter_search = store.search("", elements=["O"], stable=True, band_gap_min=1, limit=5)
    checks["search_formula"] = bool(formula_search)
    checks["search_chemsys"] = bool(chemsys_search)
    checks["search_filters"] = isinstance(filter_search, list)
    _assert(checks["search_formula"], "Formula search returned no results for MnO2", failures)
    _assert(checks["search_chemsys"], "Chemsys search returned no results for Mn-O", failures)

    workspace = store.workspace("mp-ckgno")
    neighborhood = store.neighborhood("mp-ckgno")
    checks["workspace"] = bool(workspace and workspace["summary"] and workspace["evidence"])
    checks["neighborhood"] = bool(neighborhood["nodes"] and neighborhood["edges"])
    _assert(checks["workspace"], "Workspace payload failed for mp-ckgno", failures)
    _assert(checks["neighborhood"], "Neighborhood payload failed for mp-ckgno", failures)

    edge_id = next((edge.get("id") for edge in neighborhood["edges"] if edge.get("id")), None)
    edge_detail = store.edge(edge_id) if edge_id else None
    checks["edge_inspection"] = bool(edge_detail)
    _assert(checks["edge_inspection"], "No inspectable relation edge found for mp-ckgno", failures)

    compared = store.compare_materials(["mp-ckgno", "mp-bkrla"])
    exported = store.export_subgraph(["mp-ckgno"], include_evidence=True, include_edge_details=True)
    checks["compare"] = bool(compared["materials"])
    checks["export"] = bool(exported["nodes"] and exported["edges"] and "export_id" in exported)
    _assert(checks["compare"], "Compare returned no material rows", failures)
    _assert(checks["export"], "Subgraph export failed", failures)

    client = TestClient(app)
    endpoint_expectations = {
        "health": client.get("/health"),
        "catalog": client.get("/catalog"),
        "settings": client.get("/settings"),
        "openapi": client.get("/openapi.json"),
        "screen": client.post("/screen", json={"requirement": "find stable oxide semiconductor materials"}),
        "compare": client.post("/compare", json={"material_ids": ["mp-ckgno", "mp-bkrla"]}),
        "sessions": client.post("/sessions", json={"title": "Ship check"}),
        "agent_tools": client.get("/agent/tools"),
        "research_status": client.get("/research/status"),
    }
    for name, response in endpoint_expectations.items():
        checks[f"api_{name}"] = 200 <= response.status_code < 300
        _assert(checks[f"api_{name}"], f"API endpoint failed: {name} -> {response.status_code} {_json(response)}", failures)

    session_payload = _json(endpoint_expectations["sessions"])
    session_id = session_payload.get("session_id")
    agent_response = client.post(
        "/agent/chat",
        json={"session_id": session_id, "message": "find stable oxide semiconductor materials"},
    )
    checks["agent_chat"] = agent_response.status_code == 200 and bool(_json(agent_response).get("assistant_message"))
    _assert(checks["agent_chat"], f"Agent chat failed: {agent_response.status_code} {_json(agent_response)}", failures)

    research_response = client.post("/research/query", json={"session_id": session_id, "query": "fatigue resistant alloy"})
    checks["research_disabled_or_queued"] = research_response.status_code == 200 and _json(research_response).get("status") in {
        "completed",
        "disabled",
        "queued",
    }
    _assert(
        checks["research_disabled_or_queued"],
        f"Research mode response failed: {research_response.status_code} {_json(research_response)}",
        failures,
    )

    return {
        "status": "ok" if not failures else "failed",
        "checks": checks,
        "failures": failures,
        "catalog": catalog,
    }


def main() -> int:
    result = run_ship_check()
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
