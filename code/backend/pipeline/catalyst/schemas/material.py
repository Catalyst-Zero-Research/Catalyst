from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SymmetrySummary(BaseModel):
    crystal_system: str | None = None
    lattice_system: str | None = None
    hall: str | None = None
    number: int | None = None
    symbol: str | None = None
    point_group: str | None = None


class LatticeSummary(BaseModel):
    a: float | None = None
    b: float | None = None
    c: float | None = None
    alpha: float | None = None
    beta: float | None = None
    gamma: float | None = None
    volume: float | None = None


class MaterialNode(BaseModel):
    material_id: str
    source_release: str
    catalyst_schema_version: str = "0.1.0"

    deprecated: bool | None = None
    deprecation_reasons: list[str] = Field(default_factory=list)
    last_updated: datetime | str | None = None
    experimentally_observed: bool | None = None

    formula_pretty: str | None = None
    formula_anonymous: str | None = None
    chemsys: str | None = None
    elements: list[str] = Field(default_factory=list)
    nelements: int | None = None
    composition: dict[str, float] | None = None
    composition_reduced: dict[str, float] | None = None
    nsites: int | None = None

    volume: float | None = None
    density: float | None = None
    density_atomic: float | None = None
    dimensionality: int | str | None = None
    symmetry: SymmetrySummary | None = None
    lattice: LatticeSummary | None = None
    lattice_conventional: LatticeSummary | None = None
    atomic_position_summary: list[dict[str, Any]] = Field(default_factory=list)
    possible_species: list[str] = Field(default_factory=list)
    average_oxidation_states: dict[str, float] | None = None
    possible_valences: list[float] = Field(default_factory=list)
    chemical_environment_summary: list[dict[str, Any]] = Field(default_factory=list)

    energy_per_atom: float | None = None
    uncorrected_energy_per_atom: float | None = None
    formation_energy_per_atom: float | None = None
    energy_above_hull: float | None = None
    is_stable: bool | None = None
    equilibrium_reaction_energy_per_atom: float | None = None
    decomposes_to: list[dict[str, Any]] = Field(default_factory=list)

    band_gap: float | None = None
    cbm: float | None = None
    vbm: float | None = None
    efermi: float | None = None
    is_gap_direct: bool | None = None
    is_metal: bool | None = None

    is_magnetic: bool | None = None
    ordering: str | None = None
    total_magnetization: float | None = None
    total_magnetization_normalized_vol: float | None = None
    total_magnetization_normalized_formula_units: float | None = None
    num_magnetic_sites: int | None = None
    num_unique_magnetic_sites: int | None = None
    types_of_magnetic_species: list[str] = Field(default_factory=list)

    bulk_modulus_vrh: float | None = None
    shear_modulus_vrh: float | None = None
    universal_anisotropy: float | None = None
    homogeneous_poisson: float | None = None

    e_total: float | None = None
    e_ionic: float | None = None
    e_electronic: float | None = None
    n_refractive: float | None = None
    e_ij_max: float | None = None

    weighted_surface_energy: float | None = None
    weighted_surface_energy_ev_per_ang2: float | None = None
    weighted_work_function: float | None = None
    surface_anisotropy: float | None = None
    shape_factor: float | None = None
    has_reconstructed: bool | None = None

    theoretical: bool | None = None
    task_ids: list[str] = Field(default_factory=list)
    database_ids: dict[str, Any] | None = None
    has_props: list[str] = Field(default_factory=list)
    warnings: list[Any] = Field(default_factory=list)
    origins: list[dict[str, Any]] = Field(default_factory=list)
    description: str | None = None
