from __future__ import annotations

from pathlib import Path

from catalyst.local_store import LocalCatalystStore
from catalyst.validate_recovery import validate_recovery


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_recovery_validation_passes() -> None:
    result = validate_recovery(REPO_ROOT)
    assert result["status"] == "ok"


def test_material_lookup_supports_processed_demo_materials() -> None:
    store = LocalCatalystStore(REPO_ROOT)
    processed = store.get_material("mp-ckgno")
    target = store.get_material("mp-bkrla")
    missing = store.get_material("mp-does-not-exist")
    assert processed is not None
    assert target is not None
    assert target["formula_pretty"] == "MnO2"
    assert target["resolver"]["resolution_method"] == "exact_processed_id"
    assert missing is None


def test_neighborhood_and_evidence_for_demo_mno2() -> None:
    store = LocalCatalystStore(REPO_ROOT)
    graph = store.neighborhood("mp-bkrla")
    evidence = store.evidence("mp-bkrla")
    element_ids = {node["id"] for node in graph["nodes"] if node["type"] == "element"}
    assert {"Mn", "O"}.issubset(element_ids)
    assert graph["edges"]
    assert any(section["name"] == "structure" for section in evidence["sections"])
