from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd

from catalyst.local_store import LocalCatalystStore
from catalyst.resolver import build_material_id_resolver
from catalyst.util import find_repo_root


def validate_recovery(repo_root: Path, source_release: str = "v2025.09.25") -> dict[str, Any]:
    processed_root = repo_root / "data" / "processed" / "catalyst" / source_release
    manifest = json.loads((processed_root / "build_manifest.json").read_text(encoding="utf-8"))
    resolver_manifest = build_material_id_resolver(repo_root, source_release)

    materials = pd.read_parquet(processed_root / "materials.parquet")
    elements = pd.read_parquet(processed_root / "elements.parquet")
    element_edges = pd.read_parquet(processed_root / "material_element_edges.parquet")
    material_edges = pd.read_parquet(processed_root / "material_edges.parquet")

    failures: list[str] = []
    expected = manifest["counts"]
    checks = {
        "materials_count": len(materials) == expected["materials"],
        "elements_count": len(elements) == expected["elements"],
        "material_element_edges_count": len(element_edges) == expected["material_element_edges"],
        "material_edges_count": len(material_edges) == expected["material_edges"],
        "every_material_has_element_edge": set(materials["material_id"]).issubset(set(element_edges["material_id"])),
        "all_edge_elements_exist": set(element_edges["element_symbol"]).issubset(set(elements["symbol"])),
    }
    for name, ok in checks.items():
        if not ok:
            failures.append(name)

    store = LocalCatalystStore(repo_root, source_release)
    demo_mno2 = store.get_material("mp-bkrla")
    mp_ckgno = store.get_material("mp-ckgno")
    missing = store.get_material("mp-does-not-exist")
    graph = store.neighborhood("mp-bkrla")
    evidence = store.evidence("mp-bkrla")

    checks.update(
        {
            "demo_mno2_explicit_status": bool(demo_mno2 and demo_mno2.get("resolver", {}).get("resolution_status")),
            "demo_mno2_neighborhood": bool(graph["nodes"] and graph["edges"]),
            "demo_mno2_evidence": bool(evidence["sections"]),
            "mp_ckgno_lookup": bool(mp_ckgno),
            "missing_id_not_found": missing is None,
        }
    )
    for name in ("demo_mno2_explicit_status", "demo_mno2_neighborhood", "demo_mno2_evidence", "mp_ckgno_lookup", "missing_id_not_found"):
        if not checks[name]:
            failures.append(name)

    return {
        "status": "ok" if not failures else "failed",
        "source_release": source_release,
        "checks": checks,
        "failures": failures,
        "resolver": resolver_manifest,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Catalyst recovery architecture artifacts.")
    parser.add_argument("--repo-root", type=Path, default=find_repo_root(Path(__file__).resolve()))
    parser.add_argument("--source-release", default="v2025.09.25")
    args = parser.parse_args()
    result = validate_recovery(args.repo_root, args.source_release)
    print(json.dumps(result, indent=2, sort_keys=True))
    if result["status"] != "ok":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
