from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from catalyst.util import find_repo_root


RESOLVER_COLUMNS = [
    "input_material_id",
    "resolved_material_id",
    "id_namespace",
    "formula_pretty",
    "chemsys",
    "source_release",
    "resolution_status",
    "resolution_method",
    "checked_at",
]


@dataclass(frozen=True)
class ResolverRow:
    input_material_id: str
    resolved_material_id: str | None
    id_namespace: str
    formula_pretty: str | None
    chemsys: str | None
    source_release: str
    resolution_status: str
    resolution_method: str
    checked_at: str


def _read_first_jsonl(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                return json.loads(line)
    return None


def _id_namespace(material_id: str, *, target_only: bool = False) -> str:
    if target_only:
        return "numeric_demo_pack"
    suffix = material_id.removeprefix("mp-")
    if suffix.isdigit():
        return "numeric"
    if suffix.isalpha():
        return "alphanumeric"
    return "unknown"


def _processed_version_root(repo_root: Path, source_release: str) -> Path:
    return repo_root / "data" / "processed" / "catalyst" / source_release


def _raw_version_root(repo_root: Path, source_release: str) -> Path:
    return repo_root / "data" / "raw" / "materials_project" / source_release


def build_material_id_resolver(repo_root: Path, source_release: str) -> dict[str, Any]:
    checked_at = datetime.now(timezone.utc).isoformat()
    processed_root = _processed_version_root(repo_root, source_release)
    raw_root = _raw_version_root(repo_root, source_release)
    resolver_root = processed_root / "resolver"
    resolver_root.mkdir(parents=True, exist_ok=True)

    materials_path = processed_root / "materials.parquet"
    if not materials_path.exists():
        raise FileNotFoundError(f"Missing processed materials table: {materials_path}")

    materials = pd.read_parquet(materials_path)
    materials = materials[["material_id", "formula_pretty", "chemsys"]].copy()
    processed_ids = set(str(v) for v in materials["material_id"])

    rows: list[ResolverRow] = []
    for record in materials.to_dict(orient="records"):
        mid = str(record["material_id"])
        rows.append(
            ResolverRow(
                input_material_id=mid,
                resolved_material_id=mid,
                id_namespace=_id_namespace(mid),
                formula_pretty=record.get("formula_pretty"),
                chemsys=record.get("chemsys"),
                source_release=source_release,
                resolution_status="resolved",
                resolution_method="exact_processed_id",
                checked_at=checked_at,
            )
        )

    target_root = raw_root / "targets"
    target_rows = 0
    if target_root.exists():
        for target_dir in sorted(path for path in target_root.iterdir() if path.is_dir()):
            summary = _read_first_jsonl(target_dir / "materials_summary.jsonl") or _read_first_jsonl(target_dir / "materials_core.jsonl")
            if not summary:
                continue
            input_id = str(summary.get("material_id") or target_dir.name)
            formula = summary.get("formula_pretty")
            chemsys = summary.get("chemsys")
            if input_id in processed_ids:
                resolved_id = input_id
                status = "resolved"
                method = "exact_processed_id"
                namespace = _id_namespace(input_id)
            else:
                # A target cache is a first-class local demo material. Do not
                # guess-merge it into alphanumeric IDs by formula/chemsys.
                resolved_id = input_id
                status = "resolved"
                method = "target_cache_only"
                namespace = _id_namespace(input_id, target_only=True)
            rows.append(
                ResolverRow(
                    input_material_id=input_id,
                    resolved_material_id=resolved_id,
                    id_namespace=namespace,
                    formula_pretty=formula,
                    chemsys=chemsys,
                    source_release=source_release,
                    resolution_status=status,
                    resolution_method=method,
                    checked_at=checked_at,
                )
            )
            target_rows += 1

    frame = pd.DataFrame([asdict(row) for row in rows], columns=RESOLVER_COLUMNS).drop_duplicates(
        subset=["input_material_id", "resolution_method"], keep="last"
    )
    parquet_path = resolver_root / "material_id_resolver.parquet"
    json_path = resolver_root / "material_id_resolver.json"
    manifest_path = resolver_root / "resolver_manifest.json"
    frame.to_parquet(parquet_path, index=False)
    json_path.write_text(json.dumps(frame.to_dict(orient="records"), indent=2, sort_keys=True), encoding="utf-8")

    manifest = {
        "phase": "phase1a_material_id_resolver",
        "built_at": checked_at,
        "source_release": source_release,
        "processed_material_rows": int(len(materials)),
        "target_cache_rows": target_rows,
        "resolver_rows": int(len(frame)),
        "parquet_path": str(parquet_path),
        "json_path": str(json_path),
        "status_counts": frame["resolution_status"].value_counts().to_dict(),
        "method_counts": frame["resolution_method"].value_counts().to_dict(),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Catalyst material ID resolver artifact.")
    parser.add_argument("--repo-root", type=Path, default=find_repo_root(Path(__file__).resolve()))
    parser.add_argument("--source-release", default="v2025.09.25")
    args = parser.parse_args()
    print(json.dumps(build_material_id_resolver(args.repo_root, args.source_release), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
