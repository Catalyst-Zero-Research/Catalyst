from __future__ import annotations

import importlib.util
import socket
from pathlib import Path
from typing import Any

from catalyst.settings import ensure_local_dirs, load_settings, local_root
from catalyst.util import find_repo_root


REQUIRED_ARTIFACTS = (
    "materials.parquet",
    "elements.parquet",
    "material_element_edges.parquet",
    "material_edges.parquet",
    "resolver/material_id_resolver.parquet",
    "graph/evidence_index.parquet",
    "graph/material_material_edges.parquet",
    "graph/material_workspace_index.parquet",
    "graph/graph_overview_clusters.parquet",
    "graph/curated_start_materials.json",
    "graph/graph_manifest.json",
)


REQUIRED_MODULES = ("duckdb", "fastapi", "uvicorn", "pandas", "pyarrow", "pymatgen", "pydantic")


def port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex((host, int(port))) != 0


def run_preflight(repo_root: Path | None = None, *, check_ports: bool = True) -> dict[str, Any]:
    root = repo_root or find_repo_root(Path.cwd())
    settings = load_settings(root)
    ensure_local_dirs(root)

    checks: dict[str, bool] = {}
    failures: list[str] = []

    checks["repo_root"] = (root / "data").exists() and (root / "code").exists()
    if not checks["repo_root"]:
        failures.append(f"Repo root does not contain data/ and code/: {root}")

    missing_modules = [name for name in REQUIRED_MODULES if importlib.util.find_spec(name) is None]
    checks["python_modules"] = not missing_modules
    if missing_modules:
        failures.append(f"Missing Python modules: {', '.join(missing_modules)}")

    processed_root = root / "data" / "processed" / "catalyst" / settings.runtime.source_release
    missing_artifacts = [rel for rel in REQUIRED_ARTIFACTS if not (processed_root / rel).exists()]
    checks["artifacts"] = not missing_artifacts
    if missing_artifacts:
        failures.append(f"Missing artifacts under {processed_root}: {', '.join(missing_artifacts)}")

    checks["local_dirs"] = all((local_root(root) / name).exists() for name in ("logs", "sessions", "exports"))
    if not checks["local_dirs"]:
        failures.append("Missing local runtime directories under data/local")

    if check_ports:
        api_ok = port_available(settings.runtime.api_host, settings.runtime.api_port)
        ui_ok = port_available(settings.runtime.ui_host, settings.runtime.ui_port)
        checks["api_port_available"] = api_ok
        checks["ui_port_available"] = ui_ok
        if not api_ok:
            failures.append(f"API port is already in use: {settings.runtime.api_host}:{settings.runtime.api_port}")
        if not ui_ok:
            failures.append(f"UI port is already in use: {settings.runtime.ui_host}:{settings.runtime.ui_port}")

    return {
        "status": "ok" if not failures else "failed",
        "repo_root": str(root),
        "source_release": settings.runtime.source_release,
        "checks": checks,
        "failures": failures,
    }


def print_preflight(result: dict[str, Any]) -> None:
    print(f"Preflight: {result['status']}")
    for name, ok in result["checks"].items():
        label = "ok" if ok else "failed"
        print(f"  {name}: {label}")
    for failure in result["failures"]:
        print(f"  - {failure}")

