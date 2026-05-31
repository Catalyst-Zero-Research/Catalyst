from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from catalyst.util import find_repo_root


RECIPE_NAME = "same_chemsys_similar_properties"
RECIPE_VERSION = "0.1.0"

EVIDENCE_FILES = {
    "structure": "material_structures.jsonl",
    "tasks": "material_tasks.jsonl",
    "thermo": "material_thermo.jsonl",
    "electronic_structure": "material_electronic_structure.jsonl",
    "magnetism": "material_magnetism.jsonl",
    "bonds": "material_bonds.jsonl",
    "auxiliary": "material_auxiliary_info.jsonl",
    "spectra": "material_spectra.jsonl",
    "elasticity": "material_elasticity.jsonl",
    "dielectric": "material_dielectric.jsonl",
    "piezoelectric": "material_piezoelectric.jsonl",
    "phonons": "material_phonons.jsonl",
    "surfaces": "material_surfaces.jsonl",
    "absorption": "material_absorption.jsonl",
    "eos": "material_eos.jsonl",
    "substrates": "material_substrates.jsonl",
}

TARGET_EVIDENCE_FILES = {
    "structure": "materials_core.jsonl",
    "summary": "materials_summary.jsonl",
    "thermo": "thermo.jsonl",
    "electronic_structure": "electronic_structure.jsonl",
    "magnetism": "magnetism.jsonl",
    "bonds": "bonds.jsonl",
    "chemenv": "chemenv.jsonl",
    "oxidation_states": "oxidation_states.jsonl",
    "doi": "doi.jsonl",
    "provenance": "provenance.jsonl",
    "substrates": "substrates.jsonl",
    "spectra": "xas.jsonl",
}

MATERIAL_EDGE_COLUMNS = [
    "edge_id",
    "source_id",
    "target_id",
    "edge_type",
    "weight",
    "confidence",
    "raw_score",
    "recipe_name",
    "recipe_version",
    "recipe_params_json",
    "source_release",
    "visual_color",
    "description",
    "reason_summary",
    "feature_deltas_json",
]

EVIDENCE_INDEX_COLUMNS = [
    "material_id",
    "section",
    "records",
    "source",
    "file",
]

WORKSPACE_INDEX_COLUMNS = [
    "material_id",
    "formula_pretty",
    "chemsys",
    "nelements",
    "is_stable",
    "is_metal",
    "is_magnetic",
    "band_gap",
    "energy_above_hull",
    "formation_energy_per_atom",
    "evidence_sections",
    "evidence_records",
    "relation_count",
    "curated_score",
]

CLUSTER_COLUMNS = [
    "cluster_id",
    "label",
    "cluster_type",
    "material_count",
    "stable_count",
    "metal_count",
    "avg_band_gap",
    "avg_energy_above_hull",
    "dominant_elements_json",
    "representative_material_id",
    "representative_formula",
]


def _processed_root(repo_root: Path, source_release: str) -> Path:
    return repo_root / "data" / "processed" / "catalyst" / source_release


def _raw_root(repo_root: Path, source_release: str) -> Path:
    return repo_root / "data" / "raw" / "materials_project" / source_release


def _read_jsonl_material_counts(path: Path, key: str = "material_id") -> Counter[str]:
    counts: Counter[str] = Counter()
    if not path.exists():
        return counts
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            material_id = row.get(key)
            if material_id:
                counts[str(material_id)] += 1
    return counts


def _jsonl_count(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def build_evidence_index(repo_root: Path, source_release: str) -> pd.DataFrame:
    processed = _processed_root(repo_root, source_release)
    raw = _raw_root(repo_root, source_release)
    rows: list[dict[str, Any]] = []

    for section, filename in EVIDENCE_FILES.items():
        for material_id, records in _read_jsonl_material_counts(processed / filename).items():
            rows.append(
                {
                    "material_id": material_id,
                    "section": section,
                    "records": int(records),
                    "source": "processed",
                    "file": filename,
                }
            )

    target_root = raw / "targets"
    if target_root.exists():
        for target_dir in sorted(path for path in target_root.iterdir() if path.is_dir()):
            material_id = target_dir.name
            for section, filename in TARGET_EVIDENCE_FILES.items():
                records = _jsonl_count(target_dir / filename)
                if records:
                    rows.append(
                        {
                            "material_id": material_id,
                            "section": section,
                            "records": int(records),
                            "source": "target_cache",
                            "file": filename,
                        }
                    )

    return pd.DataFrame(rows, columns=EVIDENCE_INDEX_COLUMNS)


def _score_pair(left: pd.Series, right: pd.Series) -> tuple[float, dict[str, float | bool | None]]:
    band_delta = abs(float(left.band_gap) - float(right.band_gap))
    hull_delta = abs(float(left.energy_above_hull) - float(right.energy_above_hull))
    formation_delta = abs(float(left.formation_energy_per_atom) - float(right.formation_energy_per_atom))
    stable_match = bool(left.is_stable) == bool(right.is_stable)
    metal_match = bool(left.is_metal) == bool(right.is_metal)
    magnetic_match = bool(left.is_magnetic) == bool(right.is_magnetic)

    band_score = 1.0 - min(band_delta / 5.0, 1.0)
    hull_score = 1.0 - min(hull_delta / 1.0, 1.0)
    formation_score = 1.0 - min(formation_delta / 5.0, 1.0)
    score = (
        0.30 * band_score
        + 0.25 * hull_score
        + 0.15 * formation_score
        + 0.15 * float(stable_match)
        + 0.10 * float(metal_match)
        + 0.05 * float(magnetic_match)
    )
    deltas = {
        "band_gap_delta": round(band_delta, 6),
        "energy_above_hull_delta": round(hull_delta, 6),
        "formation_energy_delta": round(formation_delta, 6),
        "same_stability": stable_match,
        "same_metallicity": metal_match,
        "same_magnetism": magnetic_match,
    }
    return round(float(score), 6), deltas


def build_material_material_edges(
    materials: pd.DataFrame,
    source_release: str,
    max_neighbors_per_material: int = 6,
    min_score: float = 0.52,
) -> pd.DataFrame:
    required = [
        "material_id",
        "formula_pretty",
        "chemsys",
        "band_gap",
        "energy_above_hull",
        "formation_energy_per_atom",
        "is_stable",
        "is_metal",
        "is_magnetic",
    ]
    frame = materials[required].dropna(subset=["chemsys", "band_gap", "energy_above_hull", "formation_energy_per_atom"])
    recipe_params = {
        "max_neighbors_per_material": max_neighbors_per_material,
        "min_score": min_score,
        "features": [
            "same_chemsys",
            "band_gap",
            "energy_above_hull",
            "formation_energy_per_atom",
            "is_stable",
            "is_metal",
            "is_magnetic",
        ],
    }

    edge_rows: dict[tuple[str, str], dict[str, Any]] = {}
    for _, group in frame.groupby("chemsys", sort=False):
        if len(group) < 2:
            continue
        records = list(group.itertuples(index=False))
        for index, left in enumerate(records):
            scored: list[tuple[float, Any, dict[str, Any]]] = []
            left_series = pd.Series(left._asdict())
            for other_index, right in enumerate(records):
                if index == other_index:
                    continue
                right_series = pd.Series(right._asdict())
                score, deltas = _score_pair(left_series, right_series)
                if score >= min_score:
                    scored.append((score, right, deltas))
            scored.sort(key=lambda item: item[0], reverse=True)
            for score, right, deltas in scored[:max_neighbors_per_material]:
                source = str(left.material_id)
                target = str(right.material_id)
                low, high = sorted((source, target))
                key = (low, high)
                if key in edge_rows and edge_rows[key]["raw_score"] >= score:
                    continue
                description = (
                    f"{left.formula_pretty} and {right.formula_pretty} share {left.chemsys}; "
                    f"property similarity score {score:.3f}."
                )
                edge_rows[key] = {
                    "edge_id": f"{RECIPE_NAME}:{low}:{high}",
                    "source_id": low,
                    "target_id": high,
                    "edge_type": "SAME_CHEMSYS_SIMILAR_PROPERTIES",
                    "weight": score,
                    "confidence": 0.82,
                    "raw_score": score,
                    "recipe_name": RECIPE_NAME,
                    "recipe_version": RECIPE_VERSION,
                    "recipe_params_json": json.dumps(recipe_params, sort_keys=True),
                    "source_release": source_release,
                    "visual_color": "#4f8cff",
                    "description": description,
                    "reason_summary": f"same chemsys {left.chemsys}; similar stability, band gap, and hull energy",
                    "feature_deltas_json": json.dumps(deltas, sort_keys=True),
                }

    return pd.DataFrame(edge_rows.values(), columns=MATERIAL_EDGE_COLUMNS)


def build_workspace_index(materials: pd.DataFrame, evidence_index: pd.DataFrame, edges: pd.DataFrame) -> pd.DataFrame:
    evidence_counts = evidence_index.groupby("material_id").agg(
        evidence_sections=("section", "nunique"),
        evidence_records=("records", "sum"),
    )
    relation_counts = Counter(edges["source_id"].astype(str)) + Counter(edges["target_id"].astype(str)) if not edges.empty else Counter()

    rows = []
    for row in materials.to_dict(orient="records"):
        material_id = str(row["material_id"])
        evidence = evidence_counts.loc[material_id].to_dict() if material_id in evidence_counts.index else {}
        relation_count = int(relation_counts.get(material_id, 0))
        curated_score = 0
        curated_score += min(int(evidence.get("evidence_sections", 0)), 8) * 2
        curated_score += min(relation_count, 12)
        curated_score += 5 if bool(row.get("is_stable")) else 0
        curated_score += 3 if row.get("band_gap") is not None else 0
        curated_score += 2 if int(row.get("nelements") or 0) > 1 else 0
        rows.append(
            {
                "material_id": material_id,
                "formula_pretty": row.get("formula_pretty"),
                "chemsys": row.get("chemsys"),
                "nelements": row.get("nelements"),
                "is_stable": row.get("is_stable"),
                "is_metal": row.get("is_metal"),
                "is_magnetic": row.get("is_magnetic"),
                "band_gap": row.get("band_gap"),
                "energy_above_hull": row.get("energy_above_hull"),
                "formation_energy_per_atom": row.get("formation_energy_per_atom"),
                "evidence_sections": int(evidence.get("evidence_sections", 0)),
                "evidence_records": int(evidence.get("evidence_records", 0)),
                "relation_count": relation_count,
                "curated_score": curated_score,
            }
        )
    return pd.DataFrame(rows, columns=WORKSPACE_INDEX_COLUMNS)


def _flatten_elements(values: pd.Series) -> list[str]:
    counter: Counter[str] = Counter()
    for value in values:
        if isinstance(value, np.ndarray):
            counter.update(str(item) for item in value.tolist())
        elif isinstance(value, list):
            counter.update(str(item) for item in value)
        elif isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    counter.update(str(item) for item in parsed)
            except json.JSONDecodeError:
                counter.update(part.strip() for part in value.split(",") if part.strip())
    return [symbol for symbol, _ in counter.most_common(6)]


def build_overview_clusters(materials: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for chemsys, group in materials.groupby("chemsys", sort=False):
        if not chemsys:
            continue
        representative = group.sort_values(["is_stable", "energy_above_hull"], ascending=[False, True]).iloc[0]
        rows.append(
            {
                "cluster_id": f"chemsys:{chemsys}",
                "label": str(chemsys),
                "cluster_type": f"{int(group['nelements'].median())}-element chemsys",
                "material_count": int(len(group)),
                "stable_count": int((group["is_stable"] == True).sum()),
                "metal_count": int((group["is_metal"] == True).sum()),
                "avg_band_gap": float(group["band_gap"].mean()),
                "avg_energy_above_hull": float(group["energy_above_hull"].mean()),
                "dominant_elements_json": json.dumps(_flatten_elements(group["elements"])),
                "representative_material_id": str(representative["material_id"]),
                "representative_formula": representative.get("formula_pretty"),
            }
        )
    return pd.DataFrame(rows, columns=CLUSTER_COLUMNS)


def build_curated_start_materials(workspace: pd.DataFrame, limit: int = 300) -> pd.DataFrame:
    curated = workspace[
        (workspace["evidence_sections"] >= 5)
        & (workspace["relation_count"] >= 2)
        & (workspace["nelements"] > 1)
    ].sort_values(["curated_score", "relation_count", "evidence_sections"], ascending=False)
    return curated.head(limit).reset_index(drop=True)


def build_graph_artifacts(
    repo_root: Path,
    source_release: str = "v2025.09.25",
    force: bool = False,
) -> dict[str, Any]:
    processed = _processed_root(repo_root, source_release)
    graph_root = processed / "graph"
    graph_root.mkdir(parents=True, exist_ok=True)

    manifest_path = graph_root / "graph_manifest.json"
    if manifest_path.exists() and not force:
        return json.loads(manifest_path.read_text(encoding="utf-8"))

    materials = pd.read_parquet(processed / "materials.parquet")
    evidence_index = build_evidence_index(repo_root, source_release)
    material_edges = build_material_material_edges(materials, source_release)
    workspace = build_workspace_index(materials, evidence_index, material_edges)
    clusters = build_overview_clusters(materials)
    curated = build_curated_start_materials(workspace)

    evidence_path = graph_root / "evidence_index.parquet"
    edge_path = graph_root / "material_material_edges.parquet"
    workspace_path = graph_root / "material_workspace_index.parquet"
    clusters_path = graph_root / "graph_overview_clusters.parquet"
    clusters_json_path = graph_root / "graph_overview_clusters.json"
    curated_path = graph_root / "curated_start_materials.json"

    evidence_index.to_parquet(evidence_path, index=False)
    material_edges.to_parquet(edge_path, index=False)
    workspace.to_parquet(workspace_path, index=False)
    clusters.to_parquet(clusters_path, index=False)
    clusters_json_path.write_text(json.dumps(clusters.to_dict(orient="records"), indent=2), encoding="utf-8")
    curated_path.write_text(json.dumps(curated.to_dict(orient="records"), indent=2), encoding="utf-8")

    manifest = {
        "phase": "revival_backend_contract_v1",
        "built_at": datetime.now(timezone.utc).isoformat(),
        "source_release": source_release,
        "materials": int(len(materials)),
        "evidence_index_rows": int(len(evidence_index)),
        "material_material_edges": int(len(material_edges)),
        "overview_clusters": int(len(clusters)),
        "curated_start_materials": int(len(curated)),
        "files": {
            "evidence_index": str(evidence_path),
            "material_material_edges": str(edge_path),
            "material_workspace_index": str(workspace_path),
            "graph_overview_clusters": str(clusters_path),
            "graph_overview_clusters_json": str(clusters_json_path),
            "curated_start_materials": str(curated_path),
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Catalyst revival graph artifacts.")
    parser.add_argument("--repo-root", type=Path, default=find_repo_root(Path(__file__).resolve()))
    parser.add_argument("--source-release", default="v2025.09.25")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    print(json.dumps(build_graph_artifacts(args.repo_root, args.source_release, force=args.force), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
