from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from catalyst.settings import ensure_local_dirs, local_root, utc_now


def export_root(repo_root: Path) -> Path:
    ensure_local_dirs(repo_root)
    return local_root(repo_root) / "exports"


def write_json_export(repo_root: Path, payload: dict[str, Any], prefix: str = "catalyst-export") -> dict[str, Any]:
    export_id = f"exp_{uuid4().hex[:16]}"
    path = export_root(repo_root) / f"{prefix}-{export_id}.json"
    payload = {"export_id": export_id, "created_at": utc_now(), **payload}
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return {"export_id": export_id, "format": "json", "path": str(path), "preview": payload}


def write_candidate_csv(repo_root: Path, rows: list[dict[str, Any]], prefix: str = "catalyst-candidates") -> dict[str, Any]:
    export_id = f"exp_{uuid4().hex[:16]}"
    path = export_root(repo_root) / f"{prefix}-{export_id}.csv"
    columns = [
        "material_id",
        "formula_pretty",
        "chemsys",
        "score",
        "label",
        "is_stable",
        "energy_above_hull",
        "formation_energy_per_atom",
        "band_gap",
        "density",
        "is_metal",
        "is_magnetic",
        "reason_summary",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column) for column in columns})
    return {
        "export_id": export_id,
        "format": "csv",
        "path": str(path),
        "preview": {"rows": len(rows), "columns": columns},
    }

