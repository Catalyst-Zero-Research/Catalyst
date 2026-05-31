from __future__ import annotations

import json
import os
import warnings
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from pymatgen.core import Composition
from pymatgen.core import Structure
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer

from catalyst.elements import build_element_nodes
from catalyst.schemas.edges import MaterialElementEdge
from catalyst.schemas.material import LatticeSummary, MaterialNode, SymmetrySummary
from catalyst.util import read_jsonl, to_jsonable, write_jsonl


MATERIAL_EDGE_COLUMNS = [
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
]


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except Exception:
        return None


def _formula_dict(value: Any) -> dict[str, float] | None:
    value = to_jsonable(value)
    if not isinstance(value, dict):
        return None
    out: dict[str, float] = {}
    for key, amount in value.items():
        parsed = _as_float(amount)
        if parsed is not None:
            out[str(key)] = parsed
    return out


def _symmetry(raw: dict[str, Any]) -> SymmetrySummary | None:
    sym = raw.get("symmetry")
    if not isinstance(sym, dict):
        return None
    return SymmetrySummary(
        crystal_system=sym.get("crystal_system"),
        lattice_system=sym.get("lattice_system"),
        hall=sym.get("hall") or sym.get("hall_symbol"),
        number=_as_int(sym.get("number")),
        symbol=sym.get("symbol"),
        point_group=sym.get("point_group"),
    )


def _lattice_from_structure(raw: dict[str, Any]) -> LatticeSummary | None:
    structure = raw.get("structure")
    if not isinstance(structure, dict):
        return None
    lattice = structure.get("lattice")
    if not isinstance(lattice, dict):
        return None
    return LatticeSummary(
        a=_as_float(lattice.get("a")),
        b=_as_float(lattice.get("b")),
        c=_as_float(lattice.get("c")),
        alpha=_as_float(lattice.get("alpha")),
        beta=_as_float(lattice.get("beta")),
        gamma=_as_float(lattice.get("gamma")),
        volume=_as_float(lattice.get("volume") or raw.get("volume")),
    )


def _structure_page_summary(raw: dict[str, Any]) -> tuple[LatticeSummary | None, list[dict[str, Any]]]:
    structure = raw.get("structure")
    if not isinstance(structure, dict):
        return None, []
    sym = raw.get("symmetry") if isinstance(raw.get("symmetry"), dict) else {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            with open(os.devnull, "w", encoding="utf-8") as devnull, redirect_stdout(devnull), redirect_stderr(devnull):
                parsed = Structure.from_dict(structure)
                analyzer = SpacegroupAnalyzer(
                    parsed,
                    symprec=_as_float(sym.get("symprec")) or 0.1,
                    angle_tolerance=_as_float(sym.get("angle_tolerance")) or 5.0,
                )
                conventional = analyzer.get_conventional_standard_structure()
                conv_analyzer = SpacegroupAnalyzer(
                    conventional,
                    symprec=_as_float(sym.get("symprec")) or 0.1,
                    angle_tolerance=_as_float(sym.get("angle_tolerance")) or 5.0,
                )
                dataset = conv_analyzer.get_symmetry_dataset()
        except Exception:
            return None, []

    lattice = conventional.lattice
    lattice_summary = LatticeSummary(
        a=float(lattice.a),
        b=float(lattice.b),
        c=float(lattice.c),
        alpha=float(lattice.alpha),
        beta=float(lattice.beta),
        gamma=float(lattice.gamma),
        volume=float(lattice.volume),
    )

    grouped: dict[tuple[str, str, int], dict[str, Any]] = {}
    equivalent_atoms = [int(v) for v in dataset.equivalent_atoms]
    wyckoffs = [str(v) for v in dataset.wyckoffs]
    for idx, site in enumerate(conventional.sites):
        representative = equivalent_atoms[idx]
        element = site.species_string
        wyckoff = wyckoffs[idx]
        key = (element, wyckoff, representative)
        if key not in grouped:
            grouped[key] = {
                "wyckoff": wyckoff,
                "element": element,
                "x": float(site.frac_coords[0]),
                "y": float(site.frac_coords[1]),
                "z": float(site.frac_coords[2]),
                "multiplicity": 0,
            }
        grouped[key]["multiplicity"] += 1

    positions = []
    for row in grouped.values():
        positions.append(
            {
                **row,
                "wyckoff_label": f"{row['multiplicity']}{row['wyckoff']}",
            }
        )
    return lattice_summary, positions


def _extract_modulus(value: Any) -> float | None:
    value = to_jsonable(value)
    if isinstance(value, dict):
        for key in ("vrh", "value", "reuss", "voigt"):
            if key in value:
                parsed = _as_float(value[key])
                if parsed is not None:
                    return parsed
    return _as_float(value)


def _extract_has_props(value: Any) -> list[str]:
    value = to_jsonable(value)
    if isinstance(value, dict):
        return sorted(str(key) for key, present in value.items() if bool(present))
    if isinstance(value, list | tuple | set):
        return [str(item) for item in value]
    return []


def _extract_possible_valences(value: Any) -> list[float]:
    value = to_jsonable(value)
    if not isinstance(value, list):
        return []
    out: list[float] = []
    for item in value:
        parsed = _as_float(item)
        if parsed is not None:
            out.append(parsed)
    return out


def _extract_average_oxidation_states(value: Any) -> dict[str, float] | None:
    value = to_jsonable(value)
    if not isinstance(value, dict):
        return None
    out: dict[str, float] = {}
    for key, amount in value.items():
        parsed = _as_float(amount)
        if parsed is not None:
            out[str(key)] = parsed
    return out or None


def _chemical_environment_summary(chemenv: dict[str, Any]) -> list[dict[str, Any]]:
    chemenv = to_jsonable(chemenv)
    if not isinstance(chemenv, dict):
        return []
    columns = {
        "wyckoff": chemenv.get("wyckoff_positions") or [],
        "species": chemenv.get("species") or [],
        "environment": chemenv.get("chemenv_name") or [],
        "iupac": chemenv.get("chemenv_iupac") or [],
        "iucr": chemenv.get("chemenv_iucr") or [],
        "symbol": chemenv.get("chemenv_symbol") or [],
        "csm": chemenv.get("csm") or [],
    }
    row_count = max((len(value) for value in columns.values() if isinstance(value, list)), default=0)
    rows: list[dict[str, Any]] = []
    for idx in range(row_count):
        row: dict[str, Any] = {}
        for key, values in columns.items():
            row[key] = values[idx] if isinstance(values, list) and idx < len(values) else None
        rows.append(row)
    return rows


def material_from_records(
    core: dict[str, Any],
    summary: dict[str, Any],
    source_release: str,
    oxidation_states: dict[str, Any] | None = None,
    chemenv: dict[str, Any] | None = None,
) -> MaterialNode:
    merged = {**core, **summary}
    oxidation_states = oxidation_states or {}
    lattice_conventional, atomic_position_summary = _structure_page_summary(merged)
    composition = _formula_dict(merged.get("composition"))
    composition_reduced = _formula_dict(merged.get("composition_reduced"))
    elements = [str(e) for e in (merged.get("elements") or [])]
    return MaterialNode(
        material_id=str(merged["material_id"]),
        source_release=source_release,
        deprecated=merged.get("deprecated"),
        deprecation_reasons=merged.get("deprecation_reasons") or [],
        last_updated=merged.get("last_updated"),
        experimentally_observed=None if merged.get("theoretical") is None else not bool(merged.get("theoretical")),
        formula_pretty=merged.get("formula_pretty"),
        formula_anonymous=merged.get("formula_anonymous"),
        chemsys=merged.get("chemsys"),
        elements=elements,
        nelements=_as_int(merged.get("nelements")),
        composition=composition,
        composition_reduced=composition_reduced,
        nsites=_as_int(merged.get("nsites")),
        volume=_as_float(merged.get("volume")),
        density=_as_float(merged.get("density")),
        density_atomic=_as_float(merged.get("density_atomic")),
        dimensionality=merged.get("dimensionality"),
        symmetry=_symmetry(merged),
        lattice=_lattice_from_structure(merged),
        lattice_conventional=lattice_conventional,
        atomic_position_summary=atomic_position_summary,
        possible_species=[str(v) for v in (merged.get("possible_species") or [])],
        average_oxidation_states=_extract_average_oxidation_states(oxidation_states.get("average_oxidation_states")),
        possible_valences=_extract_possible_valences(oxidation_states.get("possible_valences")),
        chemical_environment_summary=_chemical_environment_summary(chemenv or {}),
        energy_per_atom=_as_float(merged.get("energy_per_atom")),
        uncorrected_energy_per_atom=_as_float(merged.get("uncorrected_energy_per_atom")),
        formation_energy_per_atom=_as_float(merged.get("formation_energy_per_atom")),
        energy_above_hull=_as_float(merged.get("energy_above_hull")),
        is_stable=merged.get("is_stable"),
        equilibrium_reaction_energy_per_atom=_as_float(merged.get("equilibrium_reaction_energy_per_atom")),
        decomposes_to=to_jsonable(merged.get("decomposes_to") or []),
        band_gap=_as_float(merged.get("band_gap")),
        cbm=_as_float(merged.get("cbm")),
        vbm=_as_float(merged.get("vbm")),
        efermi=_as_float(merged.get("efermi")),
        is_gap_direct=merged.get("is_gap_direct"),
        is_metal=merged.get("is_metal"),
        is_magnetic=merged.get("is_magnetic"),
        ordering=str(merged.get("ordering")) if merged.get("ordering") is not None else None,
        total_magnetization=_as_float(merged.get("total_magnetization")),
        total_magnetization_normalized_vol=_as_float(merged.get("total_magnetization_normalized_vol")),
        total_magnetization_normalized_formula_units=_as_float(merged.get("total_magnetization_normalized_formula_units")),
        num_magnetic_sites=_as_int(merged.get("num_magnetic_sites")),
        num_unique_magnetic_sites=_as_int(merged.get("num_unique_magnetic_sites")),
        types_of_magnetic_species=[str(v) for v in (merged.get("types_of_magnetic_species") or [])],
        bulk_modulus_vrh=_extract_modulus(merged.get("bulk_modulus")),
        shear_modulus_vrh=_extract_modulus(merged.get("shear_modulus")),
        universal_anisotropy=_as_float(merged.get("universal_anisotropy")),
        homogeneous_poisson=_as_float(merged.get("homogeneous_poisson")),
        e_total=_as_float(merged.get("e_total")),
        e_ionic=_as_float(merged.get("e_ionic")),
        e_electronic=_as_float(merged.get("e_electronic")),
        n_refractive=_as_float(merged.get("n")),
        e_ij_max=_as_float(merged.get("e_ij_max")),
        weighted_surface_energy=_as_float(merged.get("weighted_surface_energy")),
        weighted_surface_energy_ev_per_ang2=_as_float(merged.get("weighted_surface_energy_EV_PER_ANG2")),
        weighted_work_function=_as_float(merged.get("weighted_work_function")),
        surface_anisotropy=_as_float(merged.get("surface_anisotropy")),
        shape_factor=_as_float(merged.get("shape_factor")),
        has_reconstructed=merged.get("has_reconstructed"),
        theoretical=merged.get("theoretical"),
        task_ids=[str(v) for v in (merged.get("task_ids") or [])],
        database_ids=to_jsonable(merged.get("database_IDs")),
        has_props=_extract_has_props(merged.get("has_props")),
        warnings=to_jsonable(merged.get("warnings") or []),
        origins=to_jsonable(merged.get("origins") or []),
        description=merged.get("description"),
    )


def _records_by_material(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        mid = row.get("material_id")
        if mid:
            out[str(mid)] = row
    return out


def _records_grouped(rows: list[dict[str, Any]], key: str = "material_id") -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        mid = row.get(key)
        if mid:
            out.setdefault(str(mid), []).append(row)
    return out


def build_material_element_edges(materials: list[MaterialNode]) -> list[MaterialElementEdge]:
    edges: list[MaterialElementEdge] = []
    for mat in materials:
        comp_source = mat.composition or mat.composition_reduced
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            if comp_source:
                comp = Composition(comp_source)
            elif mat.formula_pretty:
                comp = Composition(mat.formula_pretty)
            else:
                continue
            reduced = comp.reduced_composition
            total = float(comp.num_atoms)
            for el, amount in comp.items():
                reduced_amount = float(reduced[el]) if el in reduced else float(amount)
                edges.append(
                    MaterialElementEdge(
                        material_id=mat.material_id,
                        element_symbol=el.symbol,
                        stoich_amount=float(amount),
                        stoich_amount_reduced=reduced_amount,
                        atomic_fraction=float(amount) / total if total else 0.0,
                        normalized_fraction=float(comp.get_atomic_fraction(el)),
                        element_count=int(reduced_amount) if reduced_amount.is_integer() else None,
                        source_release=mat.source_release,
                    )
                )
    return edges


def _write_parquet(path: Path, rows: list[dict[str, Any]], columns: list[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    safe_rows: list[dict[str, Any]] = []
    for row in rows:
        safe_row: dict[str, Any] = {}
        for key, value in row.items():
            if isinstance(value, dict | list):
                safe_row[key] = json.dumps(value, sort_keys=True, separators=(",", ":"))
            else:
                safe_row[key] = value
        safe_rows.append(safe_row)
    pd.DataFrame(safe_rows, columns=columns).to_parquet(path, index=False)


def build_processed(repo_root: Path, mp_database_version: str) -> dict[str, Any]:
    raw_root = repo_root / "data" / "raw" / "materials_project" / mp_database_version
    processed_root = repo_root / "data" / "processed" / "catalyst" / mp_database_version
    processed_root.mkdir(parents=True, exist_ok=True)

    core_rows = read_jsonl(raw_root / "materials_core.jsonl")
    summary_rows = read_jsonl(raw_root / "materials_summary.jsonl") if (raw_root / "materials_summary.jsonl").exists() else []
    summary_by_id = _records_by_material(summary_rows)
    oxidation_rows = read_jsonl(raw_root / "oxidation_states.jsonl") if (raw_root / "oxidation_states.jsonl").exists() else []
    oxidation_by_id = _records_by_material(oxidation_rows)
    chemenv_rows = read_jsonl(raw_root / "chemenv.jsonl") if (raw_root / "chemenv.jsonl").exists() else []
    chemenv_by_id = _records_by_material(chemenv_rows)

    materials: list[MaterialNode] = []
    for core in core_rows:
        mid = str(core.get("material_id"))
        if not mid:
            continue
        materials.append(
            material_from_records(
                core,
                summary_by_id.get(mid, {}),
                mp_database_version,
                oxidation_states=oxidation_by_id.get(mid),
                chemenv=chemenv_by_id.get(mid),
            )
        )

    elements = build_element_nodes()
    material_element_edges = build_material_element_edges(materials)

    material_rows = [to_jsonable(mat.model_dump(mode="json")) for mat in materials]
    element_rows = [to_jsonable(el.model_dump(mode="json")) for el in elements]
    edge_rows = [to_jsonable(edge.model_dump(mode="json")) for edge in material_element_edges]

    _write_parquet(processed_root / "materials.parquet", material_rows)
    _write_parquet(processed_root / "elements.parquet", element_rows)
    _write_parquet(processed_root / "material_element_edges.parquet", edge_rows)
    _write_parquet(processed_root / "material_edges.parquet", [], columns=MATERIAL_EDGE_COLUMNS)

    write_jsonl(
        processed_root / "material_structures.jsonl",
        (
            {
                "material_id": row.get("material_id"),
                "source_release": mp_database_version,
                "structure": row.get("structure"),
                "initial_structures": row.get("initial_structures"),
                "symmetry": row.get("symmetry"),
                "lattice_summary": next((m.lattice.model_dump(mode="json") for m in materials if m.material_id == row.get("material_id") and m.lattice), None),
            }
            for row in core_rows
            if row.get("material_id")
        ),
    )

    task_rows = []
    for row in core_rows:
        mid = row.get("material_id")
        for task_id in row.get("task_ids") or []:
            task_rows.append(
                {
                    "material_id": mid,
                    "task_id": task_id,
                    "source_release": mp_database_version,
                    "calc_type": (row.get("calc_types") or {}).get(task_id),
                    "deprecated": task_id in set(row.get("deprecated_tasks") or []),
                }
            )
    write_jsonl(processed_root / "material_tasks.jsonl", task_rows)

    detail_mapping = {
        "thermo": "material_thermo.jsonl",
        "electronic_structure": "material_electronic_structure.jsonl",
        "magnetism": "material_magnetism.jsonl",
        "elasticity": "material_elasticity.jsonl",
        "dielectric": "material_dielectric.jsonl",
        "piezoelectric": "material_piezoelectric.jsonl",
        "phonon": "material_phonons.jsonl",
        "xas": "material_spectra.jsonl",
        "absorption": "material_absorption.jsonl",
        "bonds": "material_bonds.jsonl",
        "chemenv": "material_chemical_environments.jsonl",
        "oxidation_states": "material_oxidation_states.jsonl",
        "surface_properties": "material_surfaces.jsonl",
        "substrates": "material_substrates.jsonl",
        "eos": "material_eos.jsonl",
    }
    detail_counts: dict[str, int] = {}
    for endpoint, filename in detail_mapping.items():
        src = raw_root / f"{endpoint}.jsonl"
        if src.exists():
            rows = read_jsonl(src)
            detail_counts[filename] = write_jsonl(processed_root / filename, rows)

    aux_rows = []
    for endpoint in ("provenance", "doi", "robocrys"):
        src = raw_root / f"{endpoint}.jsonl"
        if src.exists():
            for row in read_jsonl(src):
                aux_rows.append({"source_endpoint": endpoint, "source_release": mp_database_version, **row})
    aux_count = write_jsonl(processed_root / "material_auxiliary_info.jsonl", aux_rows)

    manifest = {
        "phase": "phase1_10k_processed_dataset",
        "built_at": datetime.now(timezone.utc).isoformat(),
        "mp_database_version": mp_database_version,
        "raw_root": str(raw_root),
        "processed_root": str(processed_root),
        "counts": {
            "materials": len(material_rows),
            "elements": len(element_rows),
            "material_element_edges": len(edge_rows),
            "material_edges": 0,
            "material_structures": len(core_rows),
            "material_tasks": len(task_rows),
            "material_auxiliary_info": aux_count,
            **detail_counts,
        },
        "files": sorted(str(path) for path in processed_root.glob("*")),
    }
    (processed_root / "build_manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return manifest
