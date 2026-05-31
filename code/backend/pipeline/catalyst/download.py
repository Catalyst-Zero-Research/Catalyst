from __future__ import annotations

import os
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mp_api.client import MPRester
from tqdm import tqdm

from catalyst.util import chunks, read_jsonl, to_jsonable, write_jsonl


ENDPOINTS: dict[str, tuple[str, bool]] = {
    "materials_core": ("materials", False),
    "materials_summary": ("materials.summary", False),
    "thermo": ("materials.thermo", True),
    "electronic_structure": ("materials.electronic_structure", True),
    "magnetism": ("materials.magnetism", True),
    "elasticity": ("materials.elasticity", True),
    "dielectric": ("materials.dielectric", True),
    "piezoelectric": ("materials.piezoelectric", True),
    "phonon": ("materials.phonon", True),
    "xas": ("materials.xas", True),
    "absorption": ("materials.absorption", True),
    "bonds": ("materials.bonds", True),
    "provenance": ("materials.provenance", True),
    "robocrys": ("materials.robocrys", True),
    "surface_properties": ("materials.surface_properties", True),
    "substrates": ("materials.substrates", True),
    "eos": ("materials.eos", True),
}


@dataclass(frozen=True)
class EndpointResult:
    endpoint: str
    path: str
    status: str
    records: int = 0
    error: str | None = None


def normalize_db_version(version: str) -> str:
    text = str(version).strip()
    return text if text.startswith("v") else f"v{text}"


def get_route(mpr: MPRester, dotted_path: str) -> Any:
    current: Any = mpr
    for part in dotted_path.split("."):
        current = getattr(current, part)
    return current


def get_material_id(row: Any) -> str | None:
    data = to_jsonable(row)
    if isinstance(data, dict):
        mid = data.get("material_id")
        return str(mid) if mid else None
    return None


def _search(route: Any, **kwargs: Any) -> list[Any]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return list(route.search(**kwargs))


def _search_endpoint(
    route: Any,
    *,
    endpoint: str,
    material_ids: list[str],
    limit: int,
    chunk_size: int,
) -> list[Any]:
    if endpoint in {"materials_core", "materials_summary"}:
        docs = _search(route, all_fields=True, chunk_size=chunk_size, num_chunks=max(1, (limit + chunk_size - 1) // chunk_size))
        return docs[:limit]
    if endpoint == "robocrys":
        # RobocrysRester in mp-api 0.46.0 is keyword-based, not material-id based.
        # Keep this endpoint best-effort; missing descriptions are recorded by the
        # manifest and can be handled by a later endpoint-specific pass.
        return []
    if endpoint == "substrates":
        # Substrate docs are keyed by film_id rather than material_ids.
        # Keep batches small because these filters are sent as query params and
        # large batches hit request-URI length limits.
        docs: list[Any] = []
        substrate_chunk_size = min(chunk_size, 50)
        for batch in tqdm(list(chunks(material_ids, substrate_chunk_size)), desc=f"{endpoint} batches", leave=False):
            docs.extend(_search(route, film_id=batch, all_fields=True, chunk_size=substrate_chunk_size))
        return docs
    docs = []
    for batch in tqdm(list(chunks(material_ids, chunk_size)), desc=f"{endpoint} batches", leave=False):
        docs.extend(_search(route, material_ids=batch, all_fields=True, chunk_size=chunk_size))
    return docs


def download_phase1_raw(
    repo_root: Path,
    *,
    limit: int = 10_000,
    chunk_size: int = 1000,
    endpoints: dict[str, tuple[str, bool]] | None = None,
) -> dict[str, Any]:
    if not os.getenv("MP_API_KEY"):
        raise RuntimeError("MP_API_KEY is not set in the environment.")

    selected = endpoints or ENDPOINTS
    started_at = datetime.now(timezone.utc).isoformat()
    endpoint_results: list[EndpointResult] = []

    with MPRester(mute_progress_bars=True, use_document_model=False) as mpr:
        db_version = normalize_db_version(mpr.get_database_version())
        raw_root = repo_root / "data" / "raw" / "materials_project" / db_version
        raw_root.mkdir(parents=True, exist_ok=True)

        material_ids: list[str] = []
        material_ids_path = raw_root / "material_ids.jsonl"
        if "materials_core" not in selected and material_ids_path.exists():
            material_ids = [str(row["material_id"]) for row in read_jsonl(material_ids_path) if row.get("material_id")]
        for endpoint, (route_path, _needs_ids) in selected.items():
            path = raw_root / f"{endpoint}.jsonl"
            try:
                route = get_route(mpr, route_path)
                docs = _search_endpoint(
                    route,
                    endpoint=endpoint,
                    material_ids=material_ids,
                    limit=limit,
                    chunk_size=chunk_size,
                )
                if endpoint == "materials_core":
                    material_ids = [mid for doc in docs if (mid := get_material_id(doc))]
                    material_ids = material_ids[:limit]
                count = write_jsonl(path, docs)
                endpoint_results.append(EndpointResult(endpoint=endpoint, path=str(path), status="ok", records=count))
            except Exception as exc:
                endpoint_results.append(
                    EndpointResult(endpoint=endpoint, path=str(path), status="failed", records=0, error=f"{type(exc).__name__}: {exc}")
                )

        manifest = {
            "phase": "phase1_10k_raw_cache",
            "started_at": started_at,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "mp_database_version": db_version,
            "limit": limit,
            "chunk_size": chunk_size,
            "raw_root": str(raw_root),
            "material_id_count": len(material_ids),
            "material_ids_path": str(raw_root / "material_ids.jsonl"),
            "endpoints": [result.__dict__ for result in endpoint_results],
        }
        write_jsonl(raw_root / "material_ids.jsonl", ({"material_id": mid} for mid in material_ids))
        (raw_root / "download_manifest.json").write_text(
            __import__("json").dumps(manifest, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return manifest
