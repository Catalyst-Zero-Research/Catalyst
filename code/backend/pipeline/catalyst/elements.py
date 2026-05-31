from __future__ import annotations

import math
import warnings
from typing import Any, Callable

from pymatgen.core import Element

from catalyst.schemas.element import ElementNode


def _safe(call: Callable[[], Any]) -> Any:
    try:
        return call()
    except Exception:
        return None


def _safe_float(call: Callable[[], Any]) -> float | None:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        value = _safe(call)
    if value is None:
        return None
    try:
        parsed = float(value)
    except Exception:
        return None
    return None if math.isnan(parsed) else parsed


def build_element_nodes() -> list[ElementNode]:
    nodes: list[ElementNode] = []
    for z in range(1, 119):
        el = Element.from_Z(z)
        ox_states = []
        try:
            ox_states = [int(v) for v in el.common_oxidation_states]
        except Exception:
            ox_states = []
        nodes.append(
            ElementNode(
                symbol=el.symbol,
                name=el.long_name,
                atomic_number=el.Z,
                atomic_mass=float(el.atomic_mass) if el.atomic_mass is not None else None,
                group=_safe(lambda: el.group),
                period=_safe(lambda: el.row),
                block=_safe(lambda: str(el.block) if el.block is not None else None),
                category=_safe(lambda: str(el.element_type) if el.element_type is not None else None),
                electronegativity=_safe_float(lambda: el.X),
                electron_configuration=_safe(lambda: el.electronic_structure),
                common_oxidation_states=ox_states,
            )
        )
    return nodes
