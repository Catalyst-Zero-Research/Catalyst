from __future__ import annotations

from pydantic import BaseModel, Field


class ElementNode(BaseModel):
    symbol: str
    name: str
    atomic_number: int
    atomic_mass: float | None = None
    group: int | None = None
    period: int | None = None
    block: str | None = None
    category: str | None = None
    electronegativity: float | None = None
    electron_configuration: str | None = None
    common_oxidation_states: list[int] = Field(default_factory=list)

