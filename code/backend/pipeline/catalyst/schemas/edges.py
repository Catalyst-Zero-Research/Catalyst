from __future__ import annotations

from pydantic import BaseModel


class MaterialElementEdge(BaseModel):
    material_id: str
    element_symbol: str
    edge_type: str = "CONTAINS_ELEMENT"
    stoich_amount: float
    stoich_amount_reduced: float
    atomic_fraction: float
    normalized_fraction: float
    element_count: int | None = None
    oxidation_state: float | None = None
    role_tag: str | None = None
    source_release: str
    recipe_version: str = "0.1.0"

