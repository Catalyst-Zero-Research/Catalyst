from __future__ import annotations

from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

from catalyst.graph_artifacts import build_graph_artifacts
from catalyst.local_api import app, get_store
from catalyst.local_store import LocalCatalystStore


REPO_ROOT = Path(__file__).resolve().parents[3]
PROCESSED_ROOT = REPO_ROOT / "data" / "processed" / "catalyst" / "v2025.09.25"


def test_graph_artifacts_exist_and_are_nonempty() -> None:
    manifest = build_graph_artifacts(REPO_ROOT)
    assert manifest["phase"] == "revival_backend_contract_v1"
    assert manifest["material_material_edges"] > 0
    assert manifest["evidence_index_rows"] > 0
    assert manifest["overview_clusters"] > 0
    assert manifest["curated_start_materials"] > 0

    edges = pd.read_parquet(PROCESSED_ROOT / "graph" / "material_material_edges.parquet")
    assert {"edge_id", "source_id", "target_id", "weight", "recipe_name", "feature_deltas_json"}.issubset(edges.columns)
    assert (edges["weight"] > 0).all()


def test_store_exposes_workspace_overview_edge_and_export_contracts() -> None:
    store = LocalCatalystStore(REPO_ROOT)
    overview = store.graph_overview(limit_clusters=50)
    random_material = store.curated_random_material()
    workspace = store.workspace("mp-ckgno")

    assert overview["nodes"]
    assert overview["edges"]
    assert random_material is not None
    assert workspace is not None
    assert workspace["summary"]["formula_pretty"]
    assert workspace["structure"]["lattice"] is not None
    assert workspace["evidence"]["sections"]
    assert workspace["graph"]["edges"]

    edge_id = next(edge["id"] for edge in workspace["graph"]["edges"] if edge.get("id"))
    edge = store.edge(edge_id)
    assert edge is not None
    assert edge["recipe_name"] == "same_chemsys_similar_properties"
    assert edge["feature_deltas_json"]

    exported = store.export_subgraph(["mp-ckgno"], include_evidence=True)
    assert exported["nodes"]
    assert exported["edges"]
    assert exported["evidence"]["mp-ckgno"]["sections"]


def test_api_contracts_are_ui_ready() -> None:
    get_store.cache_clear()
    client = TestClient(app)

    overview = client.get("/graph/overview?limit_clusters=50")
    assert overview.status_code == 200
    assert overview.json()["nodes"]

    random_material = client.get("/materials/random")
    assert random_material.status_code == 200
    assert random_material.json()["material_id"]

    workspace = client.get("/materials/mp-ckgno/workspace")
    assert workspace.status_code == 200
    payload = workspace.json()
    assert payload["summary"]["formula_pretty"]
    assert payload["structure"]["lattice"]
    assert payload["evidence"]["sections"]

    edge_id = next(edge["id"] for edge in payload["graph"]["edges"] if edge.get("id"))
    edge = client.get(f"/edges/{edge_id}")
    assert edge.status_code == 200
    assert edge.json()["recipe_name"] == "same_chemsys_similar_properties"

    search = client.get("/search?elements=O&stable=true&band_gap_min=1&limit=5")
    assert search.status_code == 200
    assert len(search.json()["results"]) <= 5

    exported = client.post("/export/subgraph", json={"material_ids": ["mp-ckgno"], "include_evidence": True})
    assert exported.status_code == 200
    assert exported.json()["nodes"]
