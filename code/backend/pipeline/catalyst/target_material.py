from __future__ import annotations

import argparse
import json
import os
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mp_api.client import MPRester

from catalyst.download import ENDPOINTS, EndpointResult, get_route, normalize_db_version
from catalyst.util import find_repo_root, write_jsonl


TARGET_ENDPOINTS: dict[str, tuple[str, bool]] = {
    **ENDPOINTS,
    "chemenv": ("materials.chemenv", True),
    "oxidation_states": ("materials.oxidation_states", True),
    "doi": ("materials.doi", True),
}


def _search_target(route: Any, *, endpoint: str, material_ids: list[str], chunk_size: int) -> list[Any]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if endpoint == "robocrys":
            return []
        if endpoint == "substrates":
            return list(route.search(film_id=material_ids, all_fields=True, chunk_size=min(chunk_size, 50)))
        return list(route.search(material_ids=material_ids, all_fields=True, chunk_size=chunk_size))


def pull_target_materials(
    repo_root: Path,
    material_ids: list[str],
    *,
    chunk_size: int = 100,
) -> dict[str, Any]:
    if not os.getenv("MP_API_KEY"):
        raise RuntimeError("MP_API_KEY is not set in the environment.")
    if not material_ids:
        raise ValueError("At least one material id is required.")

    started_at = datetime.now(timezone.utc).isoformat()
    endpoint_results: list[EndpointResult] = []

    with MPRester(mute_progress_bars=True, use_document_model=False) as mpr:
        db_version = normalize_db_version(mpr.get_database_version())
        target_name = "_".join(material_ids)
        raw_root = repo_root / "data" / "raw" / "materials_project" / db_version / "targets" / target_name
        raw_root.mkdir(parents=True, exist_ok=True)

        for endpoint, (route_path, _needs_ids) in TARGET_ENDPOINTS.items():
            path = raw_root / f"{endpoint}.jsonl"
            try:
                route = get_route(mpr, route_path)
                docs = _search_target(route, endpoint=endpoint, material_ids=material_ids, chunk_size=chunk_size)
                count = write_jsonl(path, docs)
                status = "skipped" if endpoint == "robocrys" else "ok"
                endpoint_results.append(EndpointResult(endpoint=endpoint, path=str(path), status=status, records=count))
            except Exception as exc:
                endpoint_results.append(
                    EndpointResult(endpoint=endpoint, path=str(path), status="failed", records=0, error=f"{type(exc).__name__}: {exc}")
                )

        manifest = {
            "phase": "target_material_raw_cache",
            "started_at": started_at,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "mp_database_version": db_version,
            "material_ids": material_ids,
            "chunk_size": chunk_size,
            "raw_root": str(raw_root),
            "endpoints": [result.__dict__ for result in endpoint_results],
        }
        (raw_root / "target_manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
        return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Pull raw Materials Project endpoint records for specific materials.")
    parser.add_argument("material_ids", nargs="+", help="Material ids such as mp-bkrla.")
    parser.add_argument("--repo-root", type=Path, default=find_repo_root(Path(__file__).resolve()))
    parser.add_argument("--chunk-size", type=int, default=100)
    args = parser.parse_args()

    manifest = pull_target_materials(args.repo_root, args.material_ids, chunk_size=args.chunk_size)
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
