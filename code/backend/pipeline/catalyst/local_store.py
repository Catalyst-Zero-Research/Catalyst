from __future__ import annotations

from collections import deque
import json
import math
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

import duckdb
import pandas as pd
from pymatgen.core import Composition

from catalyst.build_processed import material_from_records
from catalyst.elements import build_element_nodes
from catalyst.graph_artifacts import build_graph_artifacts
from catalyst.resolver import build_material_id_resolver
from catalyst.util import read_jsonl, to_jsonable


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


@dataclass(frozen=True)
class LocalPaths:
    repo_root: Path
    source_release: str

    @property
    def processed_root(self) -> Path:
        return self.repo_root / "data" / "processed" / "catalyst" / self.source_release

    @property
    def raw_root(self) -> Path:
        return self.repo_root / "data" / "raw" / "materials_project" / self.source_release

    @property
    def resolver_path(self) -> Path:
        return self.processed_root / "resolver" / "material_id_resolver.parquet"

    @property
    def graph_root(self) -> Path:
        return self.processed_root / "graph"

    @property
    def graph_manifest_path(self) -> Path:
        return self.graph_root / "graph_manifest.json"


def _decode_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text or text[0] not in "[{":
        return value
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return value


def _decode_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _decode_value(value) for key, value in row.items()}


def _count_jsonl_matches(path: Path, material_id: str, key: str = "material_id") -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if str(row.get(key)) == material_id:
                count += 1
    return count


def _jsonl_count(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def _read_jsonl_matches(
    path: Path,
    *,
    key: str,
    value: str,
    limit: int = 25,
) -> tuple[list[dict[str, Any]], bool]:
    rows: list[dict[str, Any]] = []
    truncated = False
    if not path.exists():
        return rows, truncated
    compact_needle = f'"{key}":"{value}"'
    spaced_needle = f'"{key}": "{value}"'
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            if compact_needle not in line and spaced_needle not in line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if str(row.get(key)) != value:
                continue
            if len(rows) < limit:
                rows.append(row)
            else:
                truncated = True
                break
    return rows, truncated


def _downsample_sequence(values: Any, max_points: int = 320) -> Any:
    if not isinstance(values, list):
        return values
    if len(values) <= max_points:
        return values
    stride = max(1, len(values) // max_points)
    sampled = values[::stride]
    if sampled and sampled[-1] != values[-1]:
        sampled.append(values[-1])
    return sampled


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip().lower() in {"", "nan", "none", "null"}:
        return True
    return False


def _first_present(*values: Any) -> Any:
    for value in values:
        if not _is_missing(value):
            return value
    return None


def _path_value(payload: dict[str, Any], path: str) -> Any:
    current: Any = payload
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _metric(label: str, value: Any, unit: str | None = None, source: str = "local") -> dict[str, Any]:
    return {
        "label": label,
        "value": to_jsonable(value) if not _is_missing(value) else None,
        "unit": unit,
        "source": source,
        "available": not _is_missing(value),
    }


def _section_first(details: dict[str, Any], section: str) -> dict[str, Any]:
    records = details.get(section, {}).get("records") or []
    first = records[0] if records else {}
    return first if isinstance(first, dict) else {}


class LocalCatalystStore:
    def __init__(self, repo_root: Path, source_release: str = "v2025.09.25") -> None:
        self.paths = LocalPaths(repo_root=repo_root, source_release=source_release)
        if not self.paths.resolver_path.exists():
            build_material_id_resolver(repo_root, source_release)
        if not self.paths.graph_manifest_path.exists():
            build_graph_artifacts(repo_root, source_release)
        self._lock = threading.Lock()
        self.conn = duckdb.connect(database=":memory:")
        self._register_views()
        self._elements_by_symbol = {
            element.symbol: to_jsonable(element.model_dump(mode="json")) for element in build_element_nodes()
        }

    def _register_views(self) -> None:
        with self._lock:
            processed = self.paths.processed_root
            self.conn.execute(f"CREATE VIEW materials AS SELECT * FROM read_parquet('{processed / 'materials.parquet'}')")
            self.conn.execute(f"CREATE VIEW elements AS SELECT * FROM read_parquet('{processed / 'elements.parquet'}')")
            self.conn.execute(f"CREATE VIEW material_element_edges AS SELECT * FROM read_parquet('{processed / 'material_element_edges.parquet'}')")
            self.conn.execute(f"CREATE VIEW material_edges AS SELECT * FROM read_parquet('{processed / 'material_edges.parquet'}')")
            self.conn.execute(f"CREATE VIEW resolver AS SELECT * FROM read_parquet('{self.paths.resolver_path}')")
            self.conn.execute(f"CREATE VIEW evidence_index AS SELECT * FROM read_parquet('{self.paths.graph_root / 'evidence_index.parquet'}')")
            self.conn.execute(f"CREATE VIEW material_material_edges AS SELECT * FROM read_parquet('{self.paths.graph_root / 'material_material_edges.parquet'}')")
            self.conn.execute(f"CREATE VIEW material_workspace_index AS SELECT * FROM read_parquet('{self.paths.graph_root / 'material_workspace_index.parquet'}')")
            self.conn.execute(f"CREATE VIEW graph_overview_clusters AS SELECT * FROM read_parquet('{self.paths.graph_root / 'graph_overview_clusters.parquet'}')")

    def query_df(self, query: str, parameters: list[Any] | None = None) -> pd.DataFrame:
        with self._lock:
            cursor = self.conn.cursor()
            try:
                if parameters is not None:
                    return cursor.execute(query, parameters).fetchdf()
                return cursor.execute(query).fetchdf()
            finally:
                cursor.close()

    def resolver_row(self, material_id: str) -> dict[str, Any] | None:
        rows = self.query_df(
            "SELECT * FROM resolver WHERE input_material_id = ? OR resolved_material_id = ? ORDER BY resolution_method DESC LIMIT 1",
            [material_id, material_id],
        )
        if rows.empty:
            return None
        return _decode_row(rows.iloc[0].to_dict())

    def _target_dir(self, material_id: str) -> Path:
        return self.paths.raw_root / "targets" / material_id

    def _target_record(self, material_id: str) -> dict[str, Any] | None:
        target_dir = self._target_dir(material_id)
        if not target_dir.exists():
            return None
        core_rows = read_jsonl(target_dir / "materials_core.jsonl") if (target_dir / "materials_core.jsonl").exists() else []
        summary_rows = read_jsonl(target_dir / "materials_summary.jsonl") if (target_dir / "materials_summary.jsonl").exists() else []
        if not core_rows and not summary_rows:
            return None
        oxidation = read_jsonl(target_dir / "oxidation_states.jsonl")[0] if (target_dir / "oxidation_states.jsonl").exists() and _jsonl_count(target_dir / "oxidation_states.jsonl") else None
        chemenv = read_jsonl(target_dir / "chemenv.jsonl")[0] if (target_dir / "chemenv.jsonl").exists() and _jsonl_count(target_dir / "chemenv.jsonl") else None
        core = core_rows[0] if core_rows else summary_rows[0]
        summary = summary_rows[0] if summary_rows else {}
        material = material_from_records(core, summary, self.paths.source_release, oxidation_states=oxidation, chemenv=chemenv)
        row = to_jsonable(material.model_dump(mode="json"))
        row["demo_pack_only"] = True
        return row

    def get_material(self, material_id: str) -> dict[str, Any] | None:
        resolved = self.resolver_row(material_id)
        lookup_id = resolved.get("resolved_material_id") if resolved else material_id
        rows = self.query_df("SELECT * FROM materials WHERE material_id = ? LIMIT 1", [lookup_id])
        if not rows.empty:
            material = _decode_row(rows.iloc[0].to_dict())
        else:
            material = self._target_record(str(lookup_id)) or self._target_record(material_id)
        if not material:
            return None
        material["resolver"] = resolved or {
            "input_material_id": material_id,
            "resolved_material_id": None,
            "resolution_status": "not_found",
            "resolution_method": "not_found",
        }
        return material

    def search(
        self,
        query: str = "",
        limit: int = 25,
        *,
        elements: list[str] | None = None,
        chemsys: str | None = None,
        stable: bool | None = None,
        metal: bool | None = None,
        magnetic: bool | None = None,
        band_gap_min: float | None = None,
        band_gap_max: float | None = None,
        density_min: float | None = None,
        density_max: float | None = None,
        evidence: str | None = None,
    ) -> list[dict[str, Any]]:
        q = query.strip()
        clauses = []
        params: list[Any] = []
        if q:
            like = f"%{q}%"
            clauses.append("(material_id ILIKE ? OR formula_pretty ILIKE ? OR chemsys ILIKE ?)")
            params.extend([like, like, like])
        if chemsys:
            clauses.append("chemsys = ?")
            params.append(chemsys)
        if stable is not None:
            clauses.append("is_stable = ?")
            params.append(stable)
        if metal is not None:
            clauses.append("is_metal = ?")
            params.append(metal)
        if magnetic is not None:
            clauses.append("is_magnetic = ?")
            params.append(magnetic)
        if band_gap_min is not None:
            clauses.append("band_gap >= ?")
            params.append(band_gap_min)
        if band_gap_max is not None:
            clauses.append("band_gap <= ?")
            params.append(band_gap_max)
        if density_min is not None:
            clauses.append("density >= ?")
            params.append(density_min)
        if density_max is not None:
            clauses.append("density <= ?")
            params.append(density_max)
        for element in elements or []:
            clauses.append("CAST(elements AS VARCHAR) ILIKE ?")
            params.append(f"%{element}%")
        if evidence:
            clauses.append("material_id IN (SELECT material_id FROM evidence_index WHERE section = ?)")
            params.append(evidence)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        rows = self.query_df(
            f"""
            SELECT material_id, formula_pretty, chemsys, band_gap, energy_above_hull,
                   formation_energy_per_atom, density, is_stable, is_metal, is_magnetic,
                   source_release, 'processed' AS source
            FROM materials
            {where}
            ORDER BY is_stable DESC, energy_above_hull ASC
            LIMIT ?
            """,
            params,
        )
        results = [_decode_row(row) for row in rows.to_dict(orient="records")]

        if not q:
            return results[:limit]
        like = f"%{q}%"
        resolver_rows = self.query_df(
            """
            SELECT input_material_id AS material_id, formula_pretty, chemsys, source_release, resolution_method AS source
            FROM resolver
            WHERE input_material_id ILIKE ? OR formula_pretty ILIKE ? OR chemsys ILIKE ?
            LIMIT ?
            """,
            [like, like, like, limit],
        )
        seen = {row["material_id"] for row in results}
        for row in resolver_rows.to_dict(orient="records"):
            if row["material_id"] not in seen:
                results.append(_decode_row(row))
                seen.add(row["material_id"])
        return results[:limit]

    def catalog(self) -> dict[str, Any]:
        counts = {
            "materials": int(self.query_df("SELECT COUNT(*) AS n FROM materials").iloc[0]["n"]),
            "elements": int(self.query_df("SELECT COUNT(*) AS n FROM elements").iloc[0]["n"]),
            "material_element_edges": int(
                self.query_df("SELECT COUNT(*) AS n FROM material_element_edges").iloc[0]["n"]
            ),
            "material_material_edges": int(
                self.query_df("SELECT COUNT(*) AS n FROM material_material_edges").iloc[0]["n"]
            ),
            "evidence_rows": int(self.query_df("SELECT COUNT(*) AS n FROM evidence_index").iloc[0]["n"]),
            "overview_clusters": int(self.query_df("SELECT COUNT(*) AS n FROM graph_overview_clusters").iloc[0]["n"]),
            "curated_start_materials": self._curated_count(),
            "research_candidates": 0,
        }
        return {
            "product": "Catalyst",
            "source": {
                "name": "Materials Project",
                "source_release": self.paths.source_release,
                "snapshot_label": "10,000 selected Materials Project materials",
            },
            "counts": counts,
            "capabilities": {
                "local_search": True,
                "graph_overview": True,
                "material_workspace": True,
                "candidate_compare": True,
                "export_json": True,
                "export_csv": True,
                "agent": True,
                "research_mode": False,
                "pdf_ingest": False,
                "url_ingest": False,
                "multimodal_inputs": False,
            },
        }

    def _curated_count(self) -> int:
        rows = self.query_df("SELECT COUNT(*) AS n FROM material_workspace_index WHERE curated_score >= 20")
        return int(rows.iloc[0]["n"])

    def evidence(self, material_id: str) -> dict[str, Any]:
        material = self.get_material(material_id)
        resolved_id = (material or {}).get("material_id", material_id)
        rows = self.query_df(
            """
            SELECT section AS name, records, source, file
            FROM evidence_index
            WHERE material_id = ?
            ORDER BY source DESC, section ASC
            """,
            [str(resolved_id)],
        )
        sections = [_decode_row(row) for row in rows.to_dict(orient="records")]
        return {"material_id": material_id, "resolved_material_id": resolved_id, "sections": sections}

    def _material_relation_rows(self, material_id: str, *, limit: int = 12) -> list[dict[str, Any]]:
        rows = self.query_df(
            """
            SELECT edge_id, source_id, target_id, edge_type, weight, confidence, recipe_name, reason_summary
            FROM material_material_edges
            WHERE source_id = ? OR target_id = ?
            ORDER BY weight DESC
            LIMIT ?
            """,
            [material_id, material_id, int(limit)],
        )
        return [_decode_row(row) for row in rows.to_dict(orient="records")]

    def neighborhood(self, material_id: str, *, depth: int = 1, limit_nodes: int = 80) -> dict[str, Any]:
        material = self.get_material(material_id)
        if not material:
            return {"nodes": [], "edges": [], "meta": {"depth": depth, "limit_nodes": limit_nodes}}

        depth = max(1, min(int(depth), 5))
        limit_nodes = max(10, min(int(limit_nodes), 250))

        mid = str(material["material_id"])
        edge_rows = self.query_df("SELECT * FROM material_element_edges WHERE material_id = ?", [mid])
        if edge_rows.empty:
            edge_records = self._derive_target_edges(material)
        else:
            edge_records = [_decode_row(row) for row in edge_rows.to_dict(orient="records")]

        nodes_by_id: dict[str, dict[str, Any]] = {
            mid: {
                "id": mid,
                "label": material.get("formula_pretty") or mid,
                "type": "material",
                "material_id": mid,
                "formula_pretty": material.get("formula_pretty"),
                "chemsys": material.get("chemsys"),
            }
        }
        edges_by_id: dict[str, dict[str, Any]] = {}

        for edge in edge_records:
            symbol = str(edge["element_symbol"])
            if symbol not in nodes_by_id and len(nodes_by_id) < limit_nodes:
                element = self._elements_by_symbol.get(symbol, {"symbol": symbol, "name": symbol, "atomic_number": None})
                nodes_by_id[symbol] = {"id": symbol, "label": symbol, "type": "element", **element}
            if symbol in nodes_by_id:
                edge_id = f"element:{mid}:{symbol}"
                edges_by_id[edge_id] = {
                    "source": mid,
                    "target": symbol,
                    "type": edge.get("edge_type", "CONTAINS_ELEMENT"),
                    "weight": edge.get("atomic_fraction"),
                    "stoich_amount": edge.get("stoich_amount"),
                    "atomic_fraction": edge.get("atomic_fraction"),
                }

        queue: deque[tuple[str, int]] = deque([(mid, 0)])
        visited_material_ids = {mid}
        default_relation_limit = 12
        relation_limit = default_relation_limit if depth <= 1 else min(28, 8 + depth * 6)

        while queue and len(nodes_by_id) < limit_nodes:
            current, hop = queue.popleft()
            if hop >= depth:
                continue
            relation_rows = self._material_relation_rows(current, limit=relation_limit)
            for relation in relation_rows:
                other_id = str(relation["target_id"]) if relation["source_id"] == current else str(relation["source_id"])
                if other_id not in nodes_by_id and len(nodes_by_id) < limit_nodes:
                    other = self.get_material(other_id) or {"material_id": other_id}
                    nodes_by_id[other_id] = {
                        "id": other_id,
                        "label": other.get("formula_pretty") or other_id,
                        "type": "material",
                        "material_id": other_id,
                        "formula_pretty": other.get("formula_pretty"),
                        "chemsys": other.get("chemsys"),
                    }
                if other_id not in nodes_by_id:
                    continue

                edge_id = str(relation.get("edge_id") or f"{relation['source_id']}:{relation['target_id']}:{relation['edge_type']}")
                edges_by_id[edge_id] = {
                    "id": edge_id,
                    "source": relation["source_id"],
                    "target": relation["target_id"],
                    "type": relation["edge_type"],
                    "weight": relation["weight"],
                    "confidence": relation["confidence"],
                    "recipe_name": relation["recipe_name"],
                    "reason_summary": relation["reason_summary"],
                }

                if other_id not in visited_material_ids and hop + 1 < depth:
                    visited_material_ids.add(other_id)
                    queue.append((other_id, hop + 1))

        return {
            "nodes": list(nodes_by_id.values()),
            "edges": list(edges_by_id.values()),
            "meta": {
                "depth": depth,
                "limit_nodes": limit_nodes,
                "resolved_material_id": mid,
            },
        }

    def graph_materials(
        self,
        limit_materials: int = 10_000,
        *,
        include_elements: bool = True,
        include_clusters: bool = True,
    ) -> dict[str, Any]:
        """Return the material-first graph used by the interactive workspace.

        The overview graph is intentionally cluster-first. This endpoint is the
        inverse contract: every selected material is a direct node so the UI can
        keep clusters optional without losing access to the material catalog.
        """
        limit_materials = max(1, min(int(limit_materials), 10_000))
        material_rows = self.query_df(
            """
            SELECT
                m.material_id,
                m.formula_pretty,
                m.chemsys,
                m.elements,
                m.nelements,
                m.energy_above_hull,
                m.formation_energy_per_atom,
                m.band_gap,
                m.is_metal,
                m.is_stable,
                m.is_magnetic,
                m.ordering,
                m.density,
                m.volume,
                m.nsites,
                m.symmetry,
                m.source_release,
                m.theoretical,
                COALESCE(w.relation_count, 0) AS relation_count,
                COALESCE(w.evidence_records, 0) AS evidence_records,
                COALESCE(w.curated_score, 0) AS curated_score
            FROM materials m
            LEFT JOIN material_workspace_index w ON m.material_id = w.material_id
            ORDER BY
                COALESCE(w.curated_score, 0) DESC,
                COALESCE(w.relation_count, 0) DESC,
                COALESCE(w.evidence_records, 0) DESC,
                m.is_stable DESC,
                m.energy_above_hull ASC NULLS LAST,
                m.material_id ASC
            LIMIT ?
            """,
            [limit_materials],
        )
        materials = [_decode_row(row) for row in material_rows.to_dict(orient="records")]
        material_ids = {str(row["material_id"]) for row in materials}

        nodes: list[dict[str, Any]] = [
            {
                "id": row["material_id"],
                "label": row.get("formula_pretty") or row["material_id"],
                "type": "material",
                "material_id": row["material_id"],
                "formula_pretty": row.get("formula_pretty"),
                "chemsys": row.get("chemsys"),
                "cluster_id": f"chemsys:{row['chemsys']}" if row.get("chemsys") else None,
                "elements": row.get("elements") or [],
                "nelements": row.get("nelements"),
                "energy_above_hull": row.get("energy_above_hull"),
                "formation_energy_per_atom": row.get("formation_energy_per_atom"),
                "band_gap": row.get("band_gap"),
                "is_metal": row.get("is_metal"),
                "is_stable": row.get("is_stable"),
                "is_magnetic": row.get("is_magnetic"),
                "ordering": row.get("ordering"),
                "density": row.get("density"),
                "volume": row.get("volume"),
                "nsites": row.get("nsites"),
                "symmetry": row.get("symmetry"),
                "source_release": row.get("source_release") or self.paths.source_release,
                "namespace": "materials_project_snapshot",
                "theoretical": row.get("theoretical"),
                "relation_count": row.get("relation_count"),
                "evidence_records": row.get("evidence_records"),
                "curated_score": row.get("curated_score"),
            }
            for row in materials
        ]

        edges: list[dict[str, Any]] = []
        material_edge_rows = self.query_df(
            """
            WITH selected AS (
                SELECT m.material_id
                FROM materials m
                LEFT JOIN material_workspace_index w ON m.material_id = w.material_id
                ORDER BY
                    COALESCE(w.curated_score, 0) DESC,
                    COALESCE(w.relation_count, 0) DESC,
                    COALESCE(w.evidence_records, 0) DESC,
                    m.is_stable DESC,
                    m.energy_above_hull ASC NULLS LAST,
                    m.material_id ASC
                LIMIT ?
            )
            SELECT
                e.edge_id,
                e.source_id,
                e.target_id,
                e.edge_type,
                e.weight,
                e.confidence,
                e.recipe_name,
                e.reason_summary
            FROM material_material_edges e
            JOIN selected s1 ON e.source_id = s1.material_id
            JOIN selected s2 ON e.target_id = s2.material_id
            ORDER BY e.weight DESC, e.confidence DESC NULLS LAST
            """,
            [limit_materials],
        )
        for edge in material_edge_rows.to_dict(orient="records"):
            edge = _decode_row(edge)
            edges.append(
                {
                    "id": edge["edge_id"],
                    "source": edge["source_id"],
                    "target": edge["target_id"],
                    "type": edge["edge_type"],
                    "weight": edge.get("weight"),
                    "confidence": edge.get("confidence"),
                    "recipe_name": edge.get("recipe_name"),
                    "reason_summary": edge.get("reason_summary"),
                }
            )

        element_count = 0
        if include_elements and material_ids:
            element_rows = self.query_df(
                """
                WITH selected AS (
                    SELECT m.material_id
                    FROM materials m
                    LEFT JOIN material_workspace_index w ON m.material_id = w.material_id
                    ORDER BY
                        COALESCE(w.curated_score, 0) DESC,
                        COALESCE(w.relation_count, 0) DESC,
                        COALESCE(w.evidence_records, 0) DESC,
                        m.is_stable DESC,
                        m.energy_above_hull ASC NULLS LAST,
                        m.material_id ASC
                    LIMIT ?
                )
                SELECT DISTINCT el.*
                FROM material_element_edges e
                JOIN selected s ON e.material_id = s.material_id
                LEFT JOIN elements el ON e.element_symbol = el.symbol
                ORDER BY el.atomic_number ASC NULLS LAST, el.symbol ASC
                """,
                [limit_materials],
            )
            element_nodes = []
            for row in element_rows.to_dict(orient="records"):
                element = _decode_row(row)
                symbol = element.get("symbol")
                if not symbol:
                    continue
                element_nodes.append({"id": symbol, "label": symbol, "type": "element", **element})
            element_count = len(element_nodes)
            nodes.extend(element_nodes)

            element_edge_rows = self.query_df(
                """
                WITH selected AS (
                    SELECT m.material_id
                    FROM materials m
                    LEFT JOIN material_workspace_index w ON m.material_id = w.material_id
                    ORDER BY
                        COALESCE(w.curated_score, 0) DESC,
                        COALESCE(w.relation_count, 0) DESC,
                        COALESCE(w.evidence_records, 0) DESC,
                        m.is_stable DESC,
                        m.energy_above_hull ASC NULLS LAST,
                        m.material_id ASC
                    LIMIT ?
                )
                SELECT
                    e.material_id,
                    e.element_symbol,
                    e.edge_type,
                    e.stoich_amount,
                    e.atomic_fraction,
                    e.normalized_fraction,
                    e.oxidation_state
                FROM material_element_edges e
                JOIN selected s ON e.material_id = s.material_id
                ORDER BY e.material_id ASC, e.atomic_fraction DESC NULLS LAST
                """,
                [limit_materials],
            )
            for edge in element_edge_rows.to_dict(orient="records"):
                edge = _decode_row(edge)
                edges.append(
                    {
                        "id": f"element:{edge['material_id']}:{edge['element_symbol']}",
                        "source": edge["material_id"],
                        "target": edge["element_symbol"],
                        "type": edge.get("edge_type", "CONTAINS_ELEMENT"),
                        "weight": edge.get("atomic_fraction"),
                        "stoich_amount": edge.get("stoich_amount"),
                        "atomic_fraction": edge.get("atomic_fraction"),
                        "normalized_fraction": edge.get("normalized_fraction"),
                        "oxidation_state": edge.get("oxidation_state"),
                    }
                )

        cluster_count = 0
        if include_clusters:
            cluster_rows = self.query_df(
                """
                SELECT *
                FROM graph_overview_clusters
                ORDER BY material_count DESC, stable_count DESC
                """
            )
            clusters = [_decode_row(row) for row in cluster_rows.to_dict(orient="records")]
            cluster_count = len(clusters)
            cluster_ids = {row["cluster_id"] for row in clusters}
            for row in clusters:
                elements = row.get("dominant_elements_json") or []
                nodes.append(
                    {
                        "id": row["cluster_id"],
                        "label": row.get("label") or row["cluster_id"],
                        "type": "cluster",
                        "cluster_type": row.get("cluster_type"),
                        "material_count": row.get("material_count"),
                        "stable_count": row.get("stable_count"),
                        "metal_count": row.get("metal_count"),
                        "avg_band_gap": row.get("avg_band_gap"),
                        "avg_energy_above_hull": row.get("avg_energy_above_hull"),
                        "representative_material_id": row.get("representative_material_id"),
                        "representative_formula": row.get("representative_formula"),
                        "dominant_elements": elements,
                    }
                )
            for row in materials:
                cluster_id = f"chemsys:{row['chemsys']}" if row.get("chemsys") else None
                if cluster_id and cluster_id in cluster_ids:
                    edges.append(
                        {
                            "id": f"cluster-material:{cluster_id}:{row['material_id']}",
                            "source": cluster_id,
                            "target": row["material_id"],
                            "type": "BELONGS_TO_CLUSTER",
                            "weight": 0.18,
                        }
                    )

        return {
            "nodes": nodes,
            "edges": edges,
            "meta": {
                "source_release": self.paths.source_release,
                "material_count": len(materials),
                "element_count": element_count,
                "cluster_count": cluster_count,
                "edge_count": len(edges),
                "limit_materials": limit_materials,
            },
        }

    def graph_view(
        self,
        limit_nodes: int = 500,
        *,
        mode: str = "overview",
        include_elements: bool = False,
        include_clusters: bool = False,
    ) -> dict[str, Any]:
        """Return the default UI working slice.

        The backend can expose the full graph, but the browser should only
        simulate the slice a scientist is currently working with.
        """
        limit_nodes = max(50, min(int(limit_nodes), 1_500))
        if include_elements and include_clusters:
            material_budget = max(120, int(limit_nodes * 0.62))
        elif include_elements:
            material_budget = max(120, limit_nodes - 90)
        elif include_clusters:
            material_budget = max(120, int(limit_nodes * 0.72))
        else:
            material_budget = limit_nodes

        graph = self.graph_materials(
            limit_materials=min(material_budget, limit_nodes),
            include_elements=include_elements,
            include_clusters=False,
        )

        material_nodes = [node for node in graph["nodes"] if node.get("type") == "material"]
        element_count = sum(1 for node in graph["nodes"] if node.get("type") == "element")
        cluster_count = 0

        if include_clusters:
            remaining_node_budget = max(0, limit_nodes - len(graph["nodes"]))
            cluster_coverage: dict[str, int] = {}
            material_cluster: dict[str, str] = {}
            for node in material_nodes:
                chemsys = node.get("chemsys")
                if not chemsys:
                    continue
                cluster_id = f"chemsys:{chemsys}"
                material_cluster[str(node["id"])] = cluster_id
                cluster_coverage[cluster_id] = cluster_coverage.get(cluster_id, 0) + 1

            if remaining_node_budget > 0 and cluster_coverage:
                cluster_rows = self.query_df(
                    """
                    SELECT *
                    FROM graph_overview_clusters
                    ORDER BY material_count DESC, stable_count DESC
                    """
                )
                clusters_by_id = {
                    row["cluster_id"]: _decode_row(row)
                    for row in cluster_rows.to_dict(orient="records")
                    if row["cluster_id"] in cluster_coverage
                }
                ranked_cluster_ids = sorted(
                    clusters_by_id,
                    key=lambda cluster_id: (
                        cluster_coverage.get(cluster_id, 0),
                        clusters_by_id[cluster_id].get("material_count") or 0,
                        clusters_by_id[cluster_id].get("stable_count") or 0,
                    ),
                    reverse=True,
                )[:remaining_node_budget]
                kept_cluster_ids = set(ranked_cluster_ids)
                for cluster_id in ranked_cluster_ids:
                    row = clusters_by_id[cluster_id]
                    elements = row.get("dominant_elements_json") or []
                    graph["nodes"].append(
                        {
                            "id": row["cluster_id"],
                            "label": row.get("label") or row["cluster_id"],
                            "type": "cluster",
                            "cluster_type": row.get("cluster_type"),
                            "material_count": row.get("material_count"),
                            "visible_material_count": cluster_coverage.get(cluster_id, 0),
                            "stable_count": row.get("stable_count"),
                            "metal_count": row.get("metal_count"),
                            "avg_band_gap": row.get("avg_band_gap"),
                            "avg_energy_above_hull": row.get("avg_energy_above_hull"),
                            "representative_material_id": row.get("representative_material_id"),
                            "representative_formula": row.get("representative_formula"),
                            "dominant_elements": elements,
                        }
                    )
                cluster_count = len(kept_cluster_ids)
                for material_id, cluster_id in material_cluster.items():
                    if cluster_id not in kept_cluster_ids:
                        continue
                    graph["edges"].append(
                        {
                            "id": f"cluster-material:{cluster_id}:{material_id}",
                            "source": cluster_id,
                            "target": material_id,
                            "type": "BELONGS_TO_CLUSTER",
                            "weight": 0.18,
                        }
                    )

        max_edges = max(limit_nodes, min(limit_nodes * 3, 1_800))
        if len(graph["edges"]) > max_edges:
            structural = [
                edge
                for edge in graph["edges"]
                if edge.get("type") in {"BELONGS_TO_CLUSTER", "CONTAINS_ELEMENT"}
            ]
            similarity = [
                edge
                for edge in graph["edges"]
                if edge.get("type") not in {"BELONGS_TO_CLUSTER", "CONTAINS_ELEMENT"}
            ]
            similarity.sort(
                key=lambda edge: (
                    float(edge.get("weight") or 0),
                    float(edge.get("confidence") or 0),
                ),
                reverse=True,
            )
            graph["edges"] = structural[:max_edges] + similarity[: max(0, max_edges - len(structural))]

        graph["meta"] = {
            **graph.get("meta", {}),
            "view_mode": mode,
            "slice_contract": "working_slice",
            "requested_limit_nodes": limit_nodes,
            "material_count": len(material_nodes),
            "element_count": element_count,
            "cluster_count": cluster_count,
            "edge_count": len(graph["edges"]),
            "visible_node_count": len(graph["nodes"]),
            "visible_edge_count": len(graph["edges"]),
            "visible_material_count": len(material_nodes),
            "visible_element_count": element_count,
            "visible_cluster_count": cluster_count,
            "selection_strategy": "ranked_materials_with_visible_element_and_cluster_budget",
            "full_graph_available": True,
        }
        return graph

    def graph_overview(self, limit_clusters: int = 250) -> dict[str, Any]:
        rows = self.query_df(
            """
            SELECT *
            FROM graph_overview_clusters
            ORDER BY material_count DESC, stable_count DESC
            LIMIT ?
            """,
            [limit_clusters],
        )
        clusters = [_decode_row(row) for row in rows.to_dict(orient="records")]
        nodes = []
        cluster_elements: dict[str, set[str]] = {}
        for row in clusters:
            elements = set(row.get("dominant_elements_json") or [])
            cluster_elements[row["cluster_id"]] = elements
            nodes.append(
                {
                    "id": row["cluster_id"],
                    "label": row["label"],
                    "type": "cluster",
                    "cluster_type": row["cluster_type"],
                    "material_count": row["material_count"],
                    "stable_count": row["stable_count"],
                    "avg_band_gap": row["avg_band_gap"],
                    "avg_energy_above_hull": row["avg_energy_above_hull"],
                    "representative_material_id": row["representative_material_id"],
                    "representative_formula": row["representative_formula"],
                    "dominant_elements": sorted(elements),
                }
            )
        edges = []
        for idx, left in enumerate(nodes):
            for right in nodes[idx + 1 :]:
                shared = cluster_elements[left["id"]].intersection(cluster_elements[right["id"]])
                if not shared:
                    continue
                weight = len(shared)
                if weight >= 1 and (left["material_count"] >= 10 or right["material_count"] >= 10):
                    edges.append(
                        {
                            "id": f"cluster:{left['id']}:{right['id']}",
                            "source": left["id"],
                            "target": right["id"],
                            "type": "SHARED_DOMINANT_ELEMENT",
                            "weight": weight,
                            "shared_elements": sorted(shared),
                        }
                    )
        return {
            "nodes": nodes,
            "edges": edges[: max(limit_clusters * 3, 100)],
            "meta": {"source_release": self.paths.source_release, "cluster_count": len(nodes)},
        }

    def graph_node(self, node_id: str) -> dict[str, Any] | None:
        material = self.get_material(node_id)
        if material:
            evidence = self.evidence(node_id)
            relation_rows = self.query_df(
                """
                SELECT COUNT(*) AS relation_count
                FROM material_material_edges
                WHERE source_id = ? OR target_id = ?
                """,
                [material["material_id"], material["material_id"]],
            )
            element_rows = self.query_df(
                """
                SELECT element_symbol, stoich_amount, atomic_fraction, normalized_fraction, oxidation_state
                FROM material_element_edges
                WHERE material_id = ?
                ORDER BY atomic_fraction DESC NULLS LAST, element_symbol ASC
                """,
                [material["material_id"]],
            )
            return {
                "id": material["material_id"],
                "node_id": node_id,
                "type": "material",
                "label": material.get("formula_pretty") or material["material_id"],
                "title": material.get("formula_pretty") or material["material_id"],
                "subtitle": material.get("chemsys"),
                "source_release": material.get("source_release") or self.paths.source_release,
                "summary": {
                    "material_id": material["material_id"],
                    "formula_pretty": material.get("formula_pretty"),
                    "chemsys": material.get("chemsys"),
                    "is_stable": material.get("is_stable"),
                    "is_metal": material.get("is_metal"),
                    "band_gap": material.get("band_gap"),
                    "energy_above_hull": material.get("energy_above_hull"),
                    "formation_energy_per_atom": material.get("formation_energy_per_atom"),
                    "density": material.get("density"),
                    "crystal_system": (material.get("symmetry") or {}).get("crystal_system")
                    if isinstance(material.get("symmetry"), dict)
                    else None,
                },
                "metrics": {
                    "relation_count": int(relation_rows.iloc[0]["relation_count"]) if not relation_rows.empty else 0,
                    "evidence_sections": evidence.get("total_sections", 0),
                    "evidence_records": evidence.get("total_records", 0),
                },
                "elements": [_decode_row(row) for row in element_rows.to_dict(orient="records")],
                "actions": [
                    {"id": "open_workspace", "label": "Open material workspace"},
                    {"id": "expand_neighborhood", "label": "Expand neighborhood"},
                    {"id": "add_candidate", "label": "Add to candidates"},
                    {"id": "export_subgraph", "label": "Export local subgraph"},
                ],
            }

        cluster = self._cluster_node(node_id)
        if cluster:
            return cluster

        element = self._element_node(node_id)
        if element:
            return element

        return None

    def _cluster_node(self, node_id: str) -> dict[str, Any] | None:
        rows = self.query_df(
            """
            SELECT *
            FROM graph_overview_clusters
            WHERE cluster_id = ?
            LIMIT 1
            """,
            [node_id],
        )
        if rows.empty:
            return None
        row = _decode_row(rows.iloc[0].to_dict())
        elements = row.get("dominant_elements_json") or []
        return {
            "id": row["cluster_id"],
            "node_id": node_id,
            "type": "cluster",
            "label": row.get("label") or row["cluster_id"],
            "title": row.get("label") or row["cluster_id"],
            "subtitle": row.get("cluster_type"),
            "source_release": self.paths.source_release,
            "summary": {
                "cluster_id": row["cluster_id"],
                "cluster_type": row.get("cluster_type"),
                "material_count": row.get("material_count"),
                "stable_count": row.get("stable_count"),
                "metal_count": row.get("metal_count"),
                "avg_band_gap": row.get("avg_band_gap"),
                "avg_energy_above_hull": row.get("avg_energy_above_hull"),
                "dominant_elements": elements,
                "representative_material_id": row.get("representative_material_id"),
                "representative_formula": row.get("representative_formula"),
            },
            "metrics": {
                "stability_ratio": (
                    float(row["stable_count"]) / float(row["material_count"])
                    if row.get("material_count")
                    else None
                ),
                "metal_ratio": (
                    float(row["metal_count"]) / float(row["material_count"])
                    if row.get("material_count")
                    else None
                ),
            },
            "actions": [
                {"id": "open_representative", "label": "Open representative material"},
                {"id": "filter_cluster", "label": "Filter graph to cluster"},
                {"id": "export_cluster", "label": "Export cluster subgraph"},
            ],
        }

    def _element_node(self, node_id: str) -> dict[str, Any] | None:
        rows = self.query_df(
            """
            SELECT *
            FROM elements
            WHERE symbol = ?
            LIMIT 1
            """,
            [node_id],
        )
        if rows.empty:
            return None
        row = _decode_row(rows.iloc[0].to_dict())
        stats = self.query_df(
            """
            SELECT
                COUNT(*) AS material_count,
                AVG(atomic_fraction) AS avg_atomic_fraction,
                MAX(atomic_fraction) AS max_atomic_fraction
            FROM material_element_edges
            WHERE element_symbol = ?
            """,
            [node_id],
        )
        examples = self.query_df(
            """
            SELECT e.material_id, m.formula_pretty, m.chemsys, e.atomic_fraction, m.is_stable, m.band_gap
            FROM material_element_edges e
            LEFT JOIN materials m ON e.material_id = m.material_id
            WHERE e.element_symbol = ?
            ORDER BY e.atomic_fraction DESC NULLS LAST
            LIMIT 12
            """,
            [node_id],
        )
        stat = _decode_row(stats.iloc[0].to_dict()) if not stats.empty else {}
        return {
            "id": row["symbol"],
            "node_id": node_id,
            "type": "element",
            "label": row.get("symbol"),
            "title": row.get("name") or row.get("symbol"),
            "subtitle": row.get("symbol"),
            "source_release": self.paths.source_release,
            "summary": {
                "symbol": row.get("symbol"),
                "name": row.get("name"),
                "atomic_number": row.get("atomic_number"),
                "atomic_mass": row.get("atomic_mass"),
                "group": row.get("group"),
                "period": row.get("period"),
                "block": row.get("block"),
                "electronegativity": row.get("electronegativity"),
                "electron_configuration": row.get("electron_configuration"),
                "common_oxidation_states": row.get("common_oxidation_states"),
            },
            "metrics": {
                "material_count": int(stat.get("material_count") or 0),
                "avg_atomic_fraction": stat.get("avg_atomic_fraction"),
                "max_atomic_fraction": stat.get("max_atomic_fraction"),
            },
            "examples": [_decode_row(example) for example in examples.to_dict(orient="records")],
            "actions": [
                {"id": "filter_element", "label": "Filter graph to element"},
                {"id": "search_materials", "label": "Search materials containing element"},
            ],
        }

    def curated_random_material(self) -> dict[str, Any] | None:
        rows = self.query_df(
            """
            SELECT material_id
            FROM material_workspace_index
            WHERE curated_score >= 20
            ORDER BY random()
            LIMIT 1
            """
        )
        if rows.empty:
            return None
        return self.get_material(str(rows.iloc[0]["material_id"]))

    def workspace(self, material_id: str) -> dict[str, Any] | None:
        material = self.get_material(material_id)
        if not material:
            return None
        mid = str(material["material_id"])
        index_rows = self.query_df("SELECT * FROM material_workspace_index WHERE material_id = ? LIMIT 1", [mid])
        workspace_index = _decode_row(index_rows.iloc[0].to_dict()) if not index_rows.empty else {}
        evidence = self.evidence(material_id)
        graph = self.neighborhood(material_id)
        relation_count = sum(1 for edge in graph["edges"] if edge.get("recipe_name"))
        return {
            "material_id": material_id,
            "resolved_material_id": mid,
            "material": material,
            "workspace_index": workspace_index,
            "summary": {
                "formula_pretty": material.get("formula_pretty"),
                "chemsys": material.get("chemsys"),
                "is_stable": material.get("is_stable"),
                "energy_above_hull": material.get("energy_above_hull"),
                "formation_energy_per_atom": material.get("formation_energy_per_atom"),
                "band_gap": material.get("band_gap"),
                "is_metal": material.get("is_metal"),
                "is_magnetic": material.get("is_magnetic"),
                "ordering": material.get("ordering"),
                "source_release": material.get("source_release"),
            },
            "structure": {
                "symmetry": material.get("symmetry"),
                "lattice": material.get("lattice_conventional") or material.get("lattice"),
                "atomic_position_summary": material.get("atomic_position_summary") or [],
                "nsites": material.get("nsites"),
                "density": material.get("density"),
                "volume": material.get("volume"),
            },
            "properties": {
                "thermo": {
                    "energy_above_hull": material.get("energy_above_hull"),
                    "formation_energy_per_atom": material.get("formation_energy_per_atom"),
                    "is_stable": material.get("is_stable"),
                    "decomposes_to": material.get("decomposes_to") or [],
                },
                "electronic": {
                    "band_gap": material.get("band_gap"),
                    "is_gap_direct": material.get("is_gap_direct"),
                    "is_metal": material.get("is_metal"),
                    "cbm": material.get("cbm"),
                    "vbm": material.get("vbm"),
                    "efermi": material.get("efermi"),
                },
                "magnetism": {
                    "is_magnetic": material.get("is_magnetic"),
                    "ordering": material.get("ordering"),
                    "total_magnetization_normalized_formula_units": material.get(
                        "total_magnetization_normalized_formula_units"
                    ),
                },
                "mechanical": {
                    "bulk_modulus_vrh": material.get("bulk_modulus_vrh"),
                    "shear_modulus_vrh": material.get("shear_modulus_vrh"),
                    "universal_anisotropy": material.get("universal_anisotropy"),
                    "homogeneous_poisson": material.get("homogeneous_poisson"),
                },
            },
            "evidence": evidence,
            "graph": graph,
            "relation_count": relation_count,
            "actions": [
                {"id": "expand_neighborhood", "label": "Expand graph neighborhood"},
                {"id": "inspect_edges", "label": "Inspect relation recipes"},
                {"id": "export_subgraph", "label": "Export subgraph JSON"},
            ],
        }

    def structure(self, material_id: str) -> dict[str, Any] | None:
        material = self.get_material(material_id)
        if not material:
            return None

        mid = str(material["material_id"])
        processed_path = self.paths.processed_root / EVIDENCE_FILES["structure"]
        structure_rows, _ = _read_jsonl_matches(processed_path, key="material_id", value=mid, limit=1)
        structure_row = structure_rows[0] if structure_rows else {}
        raw_structure = structure_row.get("structure")

        if not raw_structure:
            target_dir = self._target_dir(mid)
            target_core = target_dir / TARGET_EVIDENCE_FILES["structure"]
            if target_core.exists():
                target_rows = read_jsonl(target_core)
                if target_rows:
                    raw_structure = target_rows[0].get("structure") or target_rows[0]

        lattice = {}
        sites: list[dict[str, Any]] = []
        symmetry = structure_row.get("symmetry") or material.get("symmetry")
        if isinstance(raw_structure, dict):
            lattice = to_jsonable(raw_structure.get("lattice") or {})
            raw_sites = raw_structure.get("sites") or []
            if isinstance(raw_sites, list):
                for idx, site in enumerate(raw_sites):
                    if not isinstance(site, dict):
                        continue
                    species = site.get("species") or []
                    element = None
                    if species and isinstance(species, list):
                        first = species[0]
                        if isinstance(first, dict):
                            element = first.get("element")
                    sites.append(
                        {
                            "index": idx,
                            "label": site.get("label") or element or f"site_{idx}",
                            "element": element or site.get("label"),
                            "abc": to_jsonable(site.get("abc") or []),
                            "xyz": to_jsonable(site.get("xyz") or []),
                            "species": to_jsonable(species),
                        }
                    )

        if not lattice:
            lattice = to_jsonable(material.get("lattice_conventional") or material.get("lattice") or {})

        has_full_structure = bool(sites and lattice)
        return {
            "material_id": material_id,
            "resolved_material_id": mid,
            "source_release": material.get("source_release") or self.paths.source_release,
            "formula_pretty": material.get("formula_pretty"),
            "chemsys": material.get("chemsys"),
            "symmetry": to_jsonable(symmetry),
            "lattice": lattice,
            "sites": sites,
            "nsites": material.get("nsites") or len(sites),
            "density": material.get("density"),
            "volume": material.get("volume"),
            "structure": to_jsonable(raw_structure) if isinstance(raw_structure, dict) else None,
            "has_full_structure": has_full_structure,
            "message": None if has_full_structure else "Full 3D structure record unavailable in local snapshot",
        }

    def _normalize_detail_section_name(self, section: str) -> str:
        aliases = {
            "electronic": "electronic_structure",
            "electronicstructure": "electronic_structure",
            "piezo": "piezoelectric",
            "xas": "spectra",
            "raw_structure": "structure",
        }
        normalized = section.strip().lower().replace(" ", "_")
        return aliases.get(normalized, normalized)

    def _property_groups(self, material: dict[str, Any], details: dict[str, Any]) -> list[dict[str, Any]]:
        thermo = _section_first(details, "thermo")
        electronic = _section_first(details, "electronic_structure")
        magnetism = _section_first(details, "magnetism")
        elasticity = _section_first(details, "elasticity")
        dielectric = _section_first(details, "dielectric")
        piezoelectric = _section_first(details, "piezoelectric")
        absorption = _section_first(details, "absorption")
        surfaces = _section_first(details, "surfaces")
        bonds = _section_first(details, "bonds")
        phonons = _section_first(details, "phonons")
        eos = _section_first(details, "eos")
        spectra_count = int(details.get("spectra", {}).get("count") or 0)
        task_count = int(details.get("tasks", {}).get("count") or 0)
        auxiliary_count = int(details.get("auxiliary", {}).get("count") or 0)

        symmetry = material.get("symmetry") if isinstance(material.get("symmetry"), dict) else {}
        groups = [
            {
                "key": "key",
                "label": "Key properties",
                "items": [
                    _metric("Band gap", _first_present(material.get("band_gap"), electronic.get("band_gap")), "eV", "core/electronic"),
                    _metric("Stability", "stable" if material.get("is_stable") else "metastable/unstable", None, "core"),
                    _metric("Hull energy", _first_present(material.get("energy_above_hull"), thermo.get("energy_above_hull")), "eV/atom", "core/thermo"),
                    _metric("Formation energy", _first_present(material.get("formation_energy_per_atom"), thermo.get("formation_energy_per_atom")), "eV/atom", "core/thermo"),
                    _metric("Crystal system", _first_present(symmetry.get("crystal_system"), material.get("crystal_system")), None, "core"),
                    _metric("Space group", _first_present(symmetry.get("symbol"), symmetry.get("space_group_symbol")), None, "core"),
                    _metric("Density", material.get("density"), "g/cm3", "core"),
                    _metric("Magnetism", _first_present(material.get("ordering"), magnetism.get("ordering")), None, "core/magnetism"),
                ],
            },
            {
                "key": "thermodynamic",
                "label": "Thermodynamic",
                "items": [
                    _metric("Energy per atom", _first_present(material.get("energy_per_atom"), thermo.get("energy_per_atom")), "eV", "core/thermo"),
                    _metric("Uncorrected energy", _first_present(material.get("uncorrected_energy_per_atom"), thermo.get("uncorrected_energy_per_atom")), "eV/atom", "core/thermo"),
                    _metric("Formation energy", _first_present(material.get("formation_energy_per_atom"), thermo.get("formation_energy_per_atom")), "eV/atom", "core/thermo"),
                    _metric("Energy above hull", _first_present(material.get("energy_above_hull"), thermo.get("energy_above_hull")), "eV/atom", "core/thermo"),
                    _metric("Equilibrium rxn energy", _first_present(material.get("equilibrium_reaction_energy_per_atom"), thermo.get("equilibrium_reaction_energy_per_atom")), "eV/atom", "core/thermo"),
                    _metric("Decomposition enthalpy", thermo.get("decomposition_enthalpy"), "eV/atom", "thermo"),
                    _metric("Decomposes to", _first_present(material.get("decomposes_to"), thermo.get("decomposes_to")), None, "core/thermo"),
                ],
            },
            {
                "key": "electronic",
                "label": "Electronic",
                "items": [
                    _metric("Band gap", _first_present(material.get("band_gap"), electronic.get("band_gap")), "eV", "core/electronic"),
                    _metric("Direct gap", _first_present(material.get("is_gap_direct"), electronic.get("is_gap_direct")), None, "core/electronic"),
                    _metric("Metal", _first_present(material.get("is_metal"), electronic.get("is_metal")), None, "core/electronic"),
                    _metric("VBM", _first_present(material.get("vbm"), electronic.get("vbm")), "eV", "core/electronic"),
                    _metric("CBM", _first_present(material.get("cbm"), electronic.get("cbm")), "eV", "core/electronic"),
                    _metric("Fermi energy", _first_present(material.get("efermi"), electronic.get("efermi")), "eV", "core/electronic"),
                    _metric("DOS payload", "available" if electronic.get("dos") else None, None, "electronic"),
                    _metric("Bandstructure payload", "available" if electronic.get("bandstructure") else None, None, "electronic"),
                ],
            },
            {
                "key": "magnetic",
                "label": "Magnetic",
                "items": [
                    _metric("Magnetic", _first_present(material.get("is_magnetic"), magnetism.get("is_magnetic")), None, "core/magnetism"),
                    _metric("Ordering", _first_present(material.get("ordering"), magnetism.get("ordering")), None, "core/magnetism"),
                    _metric("Total magnetization", _first_present(material.get("total_magnetization"), magnetism.get("total_magnetization")), "muB", "core/magnetism"),
                    _metric("Magnetization / volume", _first_present(material.get("total_magnetization_normalized_vol"), magnetism.get("total_magnetization_normalized_vol")), "muB/A3", "core/magnetism"),
                    _metric("Magnetization / formula", _first_present(material.get("total_magnetization_normalized_formula_units"), magnetism.get("total_magnetization_normalized_formula_units")), "muB/f.u.", "core/magnetism"),
                    _metric("Magnetic sites", _first_present(material.get("num_magnetic_sites"), magnetism.get("num_magnetic_sites")), None, "core/magnetism"),
                    _metric("Unique magnetic sites", _first_present(material.get("num_unique_magnetic_sites"), magnetism.get("num_unique_magnetic_sites")), None, "core/magnetism"),
                    _metric("Magnetic species", _first_present(material.get("types_of_magnetic_species"), magnetism.get("types_of_magnetic_species")), None, "core/magnetism"),
                ],
            },
            {
                "key": "mechanical",
                "label": "Mechanical",
                "items": [
                    _metric("Bulk modulus VRH", _first_present(material.get("bulk_modulus_vrh"), _path_value(elasticity, "bulk_modulus.vrh")), "GPa", "core/elasticity"),
                    _metric("Shear modulus VRH", _first_present(material.get("shear_modulus_vrh"), _path_value(elasticity, "shear_modulus.vrh")), "GPa", "core/elasticity"),
                    _metric("Young modulus", _path_value(elasticity, "youngs_modulus.vrh"), "GPa", "elasticity"),
                    _metric("Poisson ratio", _first_present(material.get("homogeneous_poisson"), elasticity.get("homogeneous_poisson")), None, "core/elasticity"),
                    _metric("Universal anisotropy", _first_present(material.get("universal_anisotropy"), elasticity.get("universal_anisotropy")), None, "core/elasticity"),
                    _metric("Debye temperature", elasticity.get("debye_temperature"), "K", "elasticity"),
                    _metric("Thermal conductivity", elasticity.get("thermal_conductivity"), None, "elasticity"),
                    _metric("EOS bulk modulus", _first_present(eos.get("bulk_modulus"), eos.get("b0")), "GPa", "eos"),
                ],
            },
            {
                "key": "dielectric",
                "label": "Dielectric / optical",
                "items": [
                    _metric("Total dielectric", _first_present(material.get("e_total"), dielectric.get("e_total"), dielectric.get("total")), None, "core/dielectric"),
                    _metric("Ionic dielectric", _first_present(material.get("e_ionic"), dielectric.get("e_ionic"), dielectric.get("ionic")), None, "core/dielectric"),
                    _metric("Electronic dielectric", _first_present(material.get("e_electronic"), dielectric.get("e_electronic"), dielectric.get("electronic")), None, "core/dielectric"),
                    _metric("Refractive index", _first_present(material.get("n_refractive"), dielectric.get("n")), None, "core/dielectric"),
                    _metric("Piezo e_ij max", _first_present(material.get("e_ij_max"), piezoelectric.get("e_ij_max")), None, "core/piezoelectric"),
                    _metric("Absorption curves", "available" if absorption.get("absorption_coefficient") else None, None, "absorption"),
                    _metric("Phonon Born charges", "available" if phonons.get("born") else None, None, "phonons"),
                ],
            },
            {
                "key": "surface",
                "label": "Surface / interfaces",
                "items": [
                    _metric("Weighted surface energy", _first_present(material.get("weighted_surface_energy"), surfaces.get("weighted_surface_energy")), "J/m2", "core/surfaces"),
                    _metric("Surface energy", _first_present(material.get("weighted_surface_energy_ev_per_ang2"), surfaces.get("weighted_surface_energy_EV_PER_ANG2")), "eV/A2", "core/surfaces"),
                    _metric("Work function", _first_present(material.get("weighted_work_function"), surfaces.get("weighted_work_function")), "eV", "core/surfaces"),
                    _metric("Surface anisotropy", _first_present(material.get("surface_anisotropy"), surfaces.get("surface_anisotropy")), None, "core/surfaces"),
                    _metric("Shape factor", _first_present(material.get("shape_factor"), surfaces.get("shape_factor")), None, "core/surfaces"),
                    _metric("Reconstructed", _first_present(material.get("has_reconstructed"), surfaces.get("has_reconstructed")), None, "core/surfaces"),
                    _metric("Surface slabs", len(surfaces.get("surfaces") or []) if isinstance(surfaces.get("surfaces"), list) else None, None, "surfaces"),
                ],
            },
            {
                "key": "bonds",
                "label": "Bonds / coordination",
                "items": [
                    _metric("Mean bond length", _path_value(bonds, "bond_length_stats.mean"), "A", "bonds"),
                    _metric("Min bond length", _path_value(bonds, "bond_length_stats.min"), "A", "bonds"),
                    _metric("Max bond length", _path_value(bonds, "bond_length_stats.max"), "A", "bonds"),
                    _metric("Bond types", bonds.get("bond_types"), None, "bonds"),
                    _metric("Coordination envs", bonds.get("coordination_envs"), None, "bonds"),
                    _metric("Anonymous coordination", bonds.get("coordination_envs_anonymous"), None, "bonds"),
                ],
            },
            {
                "key": "spectra",
                "label": "Spectra / evidence",
                "items": [
                    _metric("XAS spectra", spectra_count, "curves", "spectra"),
                    _metric("Task records", task_count, "rows", "tasks"),
                    _metric("Auxiliary records", auxiliary_count, "rows", "auxiliary"),
                    _metric("Phonon record", "available" if phonons else None, None, "phonons"),
                    _metric("EOS record", "available" if eos else None, None, "eos"),
                    _metric("Absorption record", "available" if absorption else None, None, "absorption"),
                ],
            },
        ]

        for group in groups:
            total = len(group["items"])
            available = sum(1 for item in group["items"] if item["available"])
            group["available_count"] = available
            group["total_count"] = total
            group["availability"] = available / total if total else 0
        return groups

    def material_details(
        self,
        material_id: str,
        *,
        sections: list[str] | None = None,
        limit: int = 25,
        downsample: bool = True,
    ) -> dict[str, Any] | None:
        material = self.get_material(material_id)
        if not material:
            return None

        mid = str(material["material_id"])
        limit = max(1, min(int(limit), 100))
        requested_sections = sections or [
            "structure",
            "thermo",
            "electronic_structure",
            "magnetism",
            "bonds",
            "spectra",
            "elasticity",
            "dielectric",
            "surfaces",
            "tasks",
            "auxiliary",
        ]
        normalized_sections: list[str] = []
        for section in requested_sections:
            normalized = self._normalize_detail_section_name(section)
            if normalized not in normalized_sections:
                normalized_sections.append(normalized)

        details: dict[str, Any] = {}
        target_dir = self._target_dir(mid)
        for section in normalized_sections:
            if section == "structure":
                structure_payload = self.structure(material_id)
                details[section] = {
                    "records": [structure_payload] if structure_payload else [],
                    "count": 1 if structure_payload else 0,
                    "truncated": False,
                    "source": "processed",
                }
                continue

            file_name = EVIDENCE_FILES.get(section)
            if not file_name:
                details[section] = {"records": [], "count": 0, "truncated": False, "source": "unknown"}
                continue

            processed_path = self.paths.processed_root / file_name
            rows, truncated = _read_jsonl_matches(processed_path, key="material_id", value=mid, limit=limit)
            source = "processed"
            if not rows:
                target_name = TARGET_EVIDENCE_FILES.get(section)
                target_path = target_dir / target_name if target_name else None
                if target_path and target_path.exists():
                    source = "target"
                    target_rows = read_jsonl(target_path)
                    rows = target_rows[:limit]
                    truncated = len(target_rows) > limit

            normalized_rows = [to_jsonable(row) for row in rows]
            if downsample and section == "spectra":
                for row in normalized_rows:
                    spectrum = row.get("spectrum")
                    if isinstance(spectrum, dict):
                        spectrum["x"] = _downsample_sequence(spectrum.get("x"), max_points=240)
                        spectrum["y"] = _downsample_sequence(spectrum.get("y"), max_points=240)

            details[section] = {
                "records": normalized_rows,
                "count": len(normalized_rows),
                "truncated": truncated,
                "source": source,
            }

        return {
            "material_id": material_id,
            "resolved_material_id": mid,
            "source_release": material.get("source_release") or self.paths.source_release,
            "core": to_jsonable(material),
            "requested_sections": normalized_sections,
            "limit": limit,
            "downsample": downsample,
            "details": details,
            "property_groups": self._property_groups(material, details),
        }

    def edge(self, edge_id: str) -> dict[str, Any] | None:
        rows = self.query_df("SELECT * FROM material_material_edges WHERE edge_id = ? LIMIT 1", [edge_id])
        if rows.empty:
            if edge_id.startswith("element:"):
                return self._element_edge(edge_id)
            if edge_id.startswith("cluster:"):
                return self._cluster_edge(edge_id)
            return None
        row = _decode_row(rows.iloc[0].to_dict())
        return row

    def _element_edge(self, edge_id: str) -> dict[str, Any] | None:
        parts = edge_id.split(":", 2)
        if len(parts) != 3:
            return None
        _, material_id, element_symbol = parts
        rows = self.query_df(
            """
            SELECT *
            FROM material_element_edges
            WHERE material_id = ? AND element_symbol = ?
            LIMIT 1
            """,
            [material_id, element_symbol],
        )
        material = self.get_material(material_id)
        if rows.empty and not material:
            return None
        row = _decode_row(rows.iloc[0].to_dict()) if not rows.empty else {}
        formula = material.get("formula_pretty") if material else material_id
        fraction = row.get("atomic_fraction")
        return {
            "edge_id": edge_id,
            "id": edge_id,
            "source": material_id,
            "target": element_symbol,
            "source_id": material_id,
            "target_id": element_symbol,
            "type": row.get("edge_type", "CONTAINS_ELEMENT"),
            "edge_type": row.get("edge_type", "CONTAINS_ELEMENT"),
            "weight": fraction,
            "confidence": 1.0,
            "recipe": "material_element_membership",
            "recipe_name": "material_element_membership",
            "reason_summary": f"{formula} contains {element_symbol}"
            + (f" with atomic fraction {float(fraction):.3g}." if fraction is not None else "."),
            "feature_delta": {
                "stoich_amount": row.get("stoich_amount"),
                "stoich_amount_reduced": row.get("stoich_amount_reduced"),
                "atomic_fraction": row.get("atomic_fraction"),
                "normalized_fraction": row.get("normalized_fraction"),
                "element_count": row.get("element_count"),
            },
            "source_release": row.get("source_release") or self.paths.source_release,
        }

    def _cluster_edge(self, edge_id: str) -> dict[str, Any] | None:
        rows = self.query_df("SELECT * FROM graph_overview_clusters")
        clusters = [_decode_row(row) for row in rows.to_dict(orient="records")]
        for left in clusters:
            for right in clusters:
                left_id = str(left["cluster_id"])
                right_id = str(right["cluster_id"])
                if edge_id != f"cluster:{left_id}:{right_id}":
                    continue
                left_elements = set(left.get("dominant_elements_json") or [])
                right_elements = set(right.get("dominant_elements_json") or [])
                shared = sorted(left_elements.intersection(right_elements))
                if not shared:
                    return None
                return {
                    "edge_id": edge_id,
                    "id": edge_id,
                    "source": left_id,
                    "target": right_id,
                    "source_id": left_id,
                    "target_id": right_id,
                    "type": "SHARED_DOMINANT_ELEMENT",
                    "edge_type": "SHARED_DOMINANT_ELEMENT",
                    "weight": len(shared),
                    "confidence": 1.0,
                    "recipe": "overview_cluster_shared_elements",
                    "recipe_name": "overview_cluster_shared_elements",
                    "reason_summary": (
                        f"{left.get('label') or left_id} and {right.get('label') or right_id} "
                        f"share dominant element signals: {', '.join(shared)}."
                    ),
                    "feature_delta": {
                        "shared_elements": shared,
                        "source_material_count": left.get("material_count"),
                        "target_material_count": right.get("material_count"),
                        "source_stable_count": left.get("stable_count"),
                        "target_stable_count": right.get("stable_count"),
                    },
                    "source_release": self.paths.source_release,
                }
        return None

    def export_subgraph(
        self,
        material_ids: list[str],
        include_evidence: bool = True,
        include_edge_details: bool = False,
    ) -> dict[str, Any]:
        return self.export_subgraph_detailed(
            material_ids,
            include_evidence=include_evidence,
            include_edge_details=include_edge_details,
        )

    def export_subgraph_detailed(
        self,
        material_ids: list[str],
        *,
        include_evidence: bool = True,
        include_edge_details: bool = True,
    ) -> dict[str, Any]:
        nodes_by_id: dict[str, dict[str, Any]] = {}
        edges_by_id: dict[str, dict[str, Any]] = {}
        evidence: dict[str, Any] = {}
        edge_details: dict[str, Any] = {}
        for material_id in material_ids:
            graph = self.neighborhood(material_id)
            for node in graph["nodes"]:
                nodes_by_id[node["id"]] = node
            for edge in graph["edges"]:
                edge_id = edge.get("id") or f"{edge.get('source')}:{edge.get('target')}:{edge.get('type')}"
                edges_by_id[edge_id] = edge
                if include_edge_details and edge.get("id"):
                    detail = self.edge(str(edge["id"]))
                    if detail:
                        edge_details[str(edge["id"])] = detail
            if include_evidence:
                evidence[material_id] = self.evidence(material_id)
        return {
            "export_id": f"exp_{uuid4().hex[:16]}",
            "source_release": self.paths.source_release,
            "requested_material_ids": material_ids,
            "nodes": list(nodes_by_id.values()),
            "edges": list(edges_by_id.values()),
            "evidence": evidence if include_evidence else {},
            "edge_details": edge_details if include_edge_details else {},
        }

    def compare_materials(
        self,
        material_ids: list[str],
        *,
        include_evidence: bool = True,
        include_edges: bool = True,
    ) -> dict[str, Any]:
        rows = []
        evidence_payload: dict[str, Any] = {}
        relation_summaries = []
        for material_id in material_ids:
            material = self.get_material(material_id)
            if not material:
                continue
            workspace = self.workspace(material_id) or {}
            row = {
                "material_id": workspace.get("resolved_material_id") or material.get("material_id"),
                "formula_pretty": material.get("formula_pretty"),
                "chemsys": material.get("chemsys"),
                "is_stable": material.get("is_stable"),
                "energy_above_hull": material.get("energy_above_hull"),
                "energy_per_atom": material.get("energy_per_atom"),
                "uncorrected_energy_per_atom": material.get("uncorrected_energy_per_atom"),
                "formation_energy_per_atom": material.get("formation_energy_per_atom"),
                "equilibrium_reaction_energy_per_atom": material.get("equilibrium_reaction_energy_per_atom"),
                "decomposes_to": material.get("decomposes_to"),
                "band_gap": material.get("band_gap"),
                "is_gap_direct": material.get("is_gap_direct"),
                "cbm": material.get("cbm"),
                "vbm": material.get("vbm"),
                "efermi": material.get("efermi"),
                "density": material.get("density"),
                "volume": material.get("volume"),
                "nsites": material.get("nsites"),
                "symmetry": material.get("symmetry"),
                "is_metal": material.get("is_metal"),
                "is_magnetic": material.get("is_magnetic"),
                "ordering": material.get("ordering"),
                "total_magnetization": material.get("total_magnetization"),
                "total_magnetization_normalized_vol": material.get("total_magnetization_normalized_vol"),
                "total_magnetization_normalized_formula_units": material.get(
                    "total_magnetization_normalized_formula_units"
                ),
                "num_magnetic_sites": material.get("num_magnetic_sites"),
                "num_unique_magnetic_sites": material.get("num_unique_magnetic_sites"),
                "types_of_magnetic_species": material.get("types_of_magnetic_species"),
                "bulk_modulus_vrh": material.get("bulk_modulus_vrh"),
                "shear_modulus_vrh": material.get("shear_modulus_vrh"),
                "universal_anisotropy": material.get("universal_anisotropy"),
                "homogeneous_poisson": material.get("homogeneous_poisson"),
                "e_total": material.get("e_total"),
                "e_ionic": material.get("e_ionic"),
                "e_electronic": material.get("e_electronic"),
                "n_refractive": material.get("n_refractive"),
                "e_ij_max": material.get("e_ij_max"),
                "weighted_surface_energy": material.get("weighted_surface_energy"),
                "weighted_surface_energy_ev_per_ang2": material.get("weighted_surface_energy_ev_per_ang2"),
                "weighted_work_function": material.get("weighted_work_function"),
                "surface_anisotropy": material.get("surface_anisotropy"),
                "shape_factor": material.get("shape_factor"),
                "has_reconstructed": material.get("has_reconstructed"),
                "evidence_sections": len((workspace.get("evidence") or {}).get("sections", [])),
                "relation_count": workspace.get("relation_count", 0),
                "source_release": material.get("source_release"),
            }
            detail_payload = self.material_details(
                str(row["material_id"]),
                sections=[
                    "thermo",
                    "electronic_structure",
                    "magnetism",
                    "elasticity",
                    "dielectric",
                    "piezoelectric",
                    "phonons",
                    "eos",
                    "surfaces",
                    "bonds",
                    "spectra",
                    "absorption",
                    "tasks",
                    "auxiliary",
                ],
                limit=3,
                downsample=True,
            )
            if detail_payload:
                row["detail_availability"] = {
                    key: value.get("count", 0) for key, value in detail_payload.get("details", {}).items()
                }
                row["property_groups"] = detail_payload.get("property_groups", [])
            rows.append(to_jsonable(row))
            if include_evidence:
                evidence_payload[str(row["material_id"])] = workspace.get("evidence") or self.evidence(material_id)
            if include_edges:
                graph = workspace.get("graph") or self.neighborhood(material_id)
                relation_summaries.extend(
                    {
                        "material_id": row["material_id"],
                        "edge_id": edge.get("id"),
                        "source": edge.get("source"),
                        "target": edge.get("target"),
                        "type": edge.get("type"),
                        "weight": edge.get("weight"),
                        "recipe_name": edge.get("recipe_name"),
                        "reason_summary": edge.get("reason_summary"),
                    }
                    for edge in graph.get("edges", [])
                    if edge.get("recipe_name")
                )
        return {
            "materials": rows,
            "columns": [
                {"key": "formula_pretty", "label": "Formula"},
                {"key": "chemsys", "label": "Chemical system"},
                {"key": "is_stable", "label": "Stable"},
                {"key": "energy_above_hull", "label": "Energy above hull"},
                {"key": "formation_energy_per_atom", "label": "Formation energy"},
                {"key": "equilibrium_reaction_energy_per_atom", "label": "Equilibrium rxn energy"},
                {"key": "band_gap", "label": "Band gap"},
                {"key": "is_gap_direct", "label": "Direct gap"},
                {"key": "is_metal", "label": "Metal"},
                {"key": "cbm", "label": "CBM"},
                {"key": "vbm", "label": "VBM"},
                {"key": "efermi", "label": "Fermi energy"},
                {"key": "density", "label": "Density"},
                {"key": "ordering", "label": "Magnetic ordering"},
                {"key": "is_magnetic", "label": "Magnetic"},
                {"key": "total_magnetization", "label": "Total magnetization"},
                {"key": "bulk_modulus_vrh", "label": "Bulk modulus VRH"},
                {"key": "shear_modulus_vrh", "label": "Shear modulus VRH"},
                {"key": "universal_anisotropy", "label": "Universal anisotropy"},
                {"key": "homogeneous_poisson", "label": "Poisson ratio"},
                {"key": "e_total", "label": "Total dielectric"},
                {"key": "n_refractive", "label": "Refractive index"},
                {"key": "weighted_surface_energy", "label": "Surface energy"},
                {"key": "weighted_work_function", "label": "Work function"},
                {"key": "evidence_sections", "label": "Evidence sections"},
                {"key": "relation_count", "label": "Relations"},
            ],
            "groups": [
                {"key": "key", "label": "Key properties"},
                {"key": "thermodynamic", "label": "Thermodynamic"},
                {"key": "electronic", "label": "Electronic"},
                {"key": "magnetic", "label": "Magnetic"},
                {"key": "mechanical", "label": "Mechanical"},
                {"key": "dielectric", "label": "Dielectric / optical"},
                {"key": "surface", "label": "Surface / interfaces"},
                {"key": "bonds", "label": "Bonds / coordination"},
                {"key": "spectra", "label": "Spectra / evidence"},
            ],
            "evidence": evidence_payload,
            "relation_summaries": relation_summaries[:100],
        }

    def _derive_target_edges(self, material: dict[str, Any]) -> list[dict[str, Any]]:
        composition = material.get("composition") or material.get("composition_reduced")
        if not composition and material.get("formula_pretty"):
            composition = material["formula_pretty"]
        if not composition:
            return []
        comp = Composition(composition)
        reduced = comp.reduced_composition
        total = float(comp.num_atoms)
        edges = []
        for element, amount in comp.items():
            reduced_amount = float(reduced[element]) if element in reduced else float(amount)
            edges.append(
                {
                    "material_id": material["material_id"],
                    "element_symbol": element.symbol,
                    "edge_type": "CONTAINS_ELEMENT",
                    "stoich_amount": float(amount),
                    "stoich_amount_reduced": reduced_amount,
                    "atomic_fraction": float(amount) / total if total else 0.0,
                    "normalized_fraction": float(comp.get_atomic_fraction(element)),
                    "source_release": self.paths.source_release,
                }
            )
        return edges
