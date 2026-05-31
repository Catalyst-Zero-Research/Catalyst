from __future__ import annotations

import math
import re
from typing import Any

from catalyst.util import to_jsonable


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def parse_requirements(requirement: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    text = _norm(requirement)
    parsed: list[dict[str, Any]] = []
    unsupported: list[dict[str, Any]] = []

    if any(word in text for word in ("stable", "stability", "low hull", "thermodynamic")):
        parsed.append({"id": "stability", "label": "thermodynamic stability", "weight": 24})
    if "semiconductor" in text:
        parsed.append({"id": "semiconductor_gap", "label": "semiconductor band gap", "weight": 20})
    gap_floor = re.search(r"band gap (?:above|over|greater than|>=)\s*(\d+(?:\.\d+)?)", text)
    if gap_floor:
        parsed.append(
            {
                "id": "band_gap_min",
                "label": f"band gap >= {float(gap_floor.group(1)):g} eV",
                "weight": 16,
                "min": float(gap_floor.group(1)),
            }
        )
    if "insulator" in text or "wide band" in text:
        parsed.append({"id": "wide_gap", "label": "wide band gap", "weight": 16})
    if re.search(r"\bmetallic\b|\bmetal\b", text) and "nonmetal" not in text and "non-metal" not in text:
        parsed.append({"id": "metal", "label": "metallic behavior", "weight": 10})
    if "nonmetal" in text or "non-metal" in text:
        parsed.append({"id": "nonmetal", "label": "non-metal behavior", "weight": 10})
    if "magnetic" in text or "magnet" in text:
        parsed.append({"id": "magnetic", "label": "magnetism", "weight": 12})
    if "lightweight" in text or "low density" in text or "light weight" in text or "plane" in text or "aircraft" in text:
        parsed.append({"id": "lightweight", "label": "low density", "weight": 16})
    if "oxide" in text or re.search(r"\boxygen\b", text):
        parsed.append({"id": "contains_o", "label": "contains oxygen", "weight": 12, "element": "O"})
    if "nitride" in text or re.search(r"\bnitrogen\b", text):
        parsed.append({"id": "contains_element", "label": "contains nitrogen", "weight": 12, "element": "N"})

    unsupported_phrases = {
        "fatigue": "fatigue resistance requires literature or external property data",
        "high temperature": "high-temperature stability requires literature or external property data",
        "high temp": "high-temperature stability requires literature or external property data",
        "high temps": "high-temperature stability requires literature or external property data",
        "temperature": "temperature-specific requirements require literature or external property data",
        "melting": "melting point requires literature or external property data",
        "melts": "melting point requires literature or external property data",
        "500": "temperature-specific requirements require literature or external property data",
        "corrosion": "corrosion resistance requires literature or external property data",
        "synthesis": "synthesis requirements require literature or external source data",
        "aerospace": "aerospace suitability requires application-specific literature or test evidence",
        "plane": "aircraft blade suitability requires application-specific literature or test evidence",
        "aircraft": "aircraft blade suitability requires application-specific literature or test evidence",
        "blade": "blade suitability requires mechanical, thermal, and fatigue evidence",
        "turbine": "turbine blade suitability requires creep, oxidation, and high-temperature evidence",
    }
    for needle, reason in unsupported_phrases.items():
        if needle == "temperature" and "high temperature" in text:
            continue
        if needle in text:
            unsupported.append(
                {
                    "term": needle,
                    "label": needle,
                    "reason": reason,
                    "research_recommended": True,
                }
            )

    if not parsed:
        parsed.append({"id": "general_quality", "label": "general candidate quality", "weight": 10})
    for item in unsupported:
        parsed.append(
            {
                "id": "literature_required",
                "label": item["reason"],
                "weight": 18,
                "term": item["term"],
            }
        )
    return parsed, unsupported


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number):
        return None
    return number


def _as_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        if value.lower() in {"true", "1", "yes"}:
            return True
        if value.lower() in {"false", "0", "no"}:
            return False
    return None


def _elements(material: dict[str, Any]) -> list[str]:
    elements = material.get("elements") or []
    if isinstance(elements, str):
        return re.findall(r"[A-Z][a-z]?", elements)
    return [str(item) for item in elements]


def score_material(material: dict[str, Any], parsed_requirements: list[dict[str, Any]]) -> dict[str, Any]:
    score = 0.0
    possible = 0.0
    matched: list[str] = []
    missing: list[str] = []
    penalties: list[str] = []

    for req in parsed_requirements:
        req_id = req["id"]
        weight = float(req.get("weight", 10))
        possible += weight
        if req_id == "general_quality":
            hull = _as_float(material.get("energy_above_hull"))
            gap = _as_float(material.get("band_gap"))
            evidence_sections = material.get("evidence_sections")
            if hull is not None:
                score += weight * max(0.0, 1.0 - min(hull, 0.5) / 0.5) * 0.55
                matched.append("ranked by lower energy above hull")
            else:
                missing.append("energy above hull")
            if gap is not None:
                score += weight * 0.25
                matched.append("band gap available")
            else:
                missing.append("band gap")
            if evidence_sections:
                score += weight * 0.20
                matched.append("evidence sections available")
            continue
        if req_id == "stability":
            stable = _as_bool(material.get("is_stable"))
            hull = _as_float(material.get("energy_above_hull"))
            if stable is True:
                score += weight
                matched.append("stable in local snapshot")
            elif hull is not None:
                partial = max(0.0, 1.0 - min(hull, 0.25) / 0.25)
                score += weight * partial * 0.75
                penalties.append(f"energy above hull is {hull:.3g} eV/atom")
            else:
                missing.append("stability")
        elif req_id == "semiconductor_gap":
            gap = _as_float(material.get("band_gap"))
            if gap is None:
                missing.append("band gap")
            elif 0.1 <= gap <= 4.0:
                score += weight
                matched.append(f"band gap {gap:.2f} eV is semiconductor-like")
            else:
                score += weight * 0.25
                penalties.append(f"band gap {gap:.2f} eV is outside typical semiconductor range")
        elif req_id == "wide_gap":
            gap = _as_float(material.get("band_gap"))
            if gap is None:
                missing.append("band gap")
            elif gap >= 2.0:
                score += weight
                matched.append(f"wide band gap {gap:.2f} eV")
            else:
                penalties.append(f"band gap {gap:.2f} eV is not wide")
        elif req_id == "band_gap_min":
            gap = _as_float(material.get("band_gap"))
            threshold = float(req.get("min", 0))
            if gap is None:
                missing.append("band gap")
            elif gap >= threshold:
                score += weight
                matched.append(f"band gap {gap:.2f} eV is >= {threshold:g} eV")
            else:
                penalties.append(f"band gap {gap:.2f} eV is below {threshold:g} eV")
        elif req_id == "metal":
            is_metal = _as_bool(material.get("is_metal"))
            if is_metal is True:
                score += weight
                matched.append("metallic")
            elif is_metal is None:
                missing.append("metal/nonmetal status")
            else:
                penalties.append("not metallic")
        elif req_id == "nonmetal":
            is_metal = _as_bool(material.get("is_metal"))
            if is_metal is False:
                score += weight
                matched.append("non-metal")
            elif is_metal is None:
                missing.append("metal/nonmetal status")
            else:
                penalties.append("metallic")
        elif req_id == "magnetic":
            is_magnetic = _as_bool(material.get("is_magnetic"))
            if is_magnetic is True:
                score += weight
                matched.append("magnetic")
            elif is_magnetic is None:
                missing.append("magnetism")
            else:
                penalties.append("not magnetic")
        elif req_id == "lightweight":
            density = _as_float(material.get("density"))
            if density is None:
                missing.append("density")
            elif density <= 5.0:
                score += weight
                matched.append(f"density {density:.2f} g/cm3 is lightweight-biased")
            else:
                score += weight * max(0.0, 1.0 - min(density - 5.0, 5.0) / 5.0) * 0.4
                penalties.append(f"density {density:.2f} g/cm3 is not lightweight")
        elif req_id == "contains_o":
            if "O" in _elements(material):
                score += weight
                matched.append("contains oxygen")
            else:
                penalties.append("does not contain oxygen")
        elif req_id == "contains_element":
            element = str(req.get("element") or "")
            if element and element in _elements(material):
                score += weight
                matched.append(f"contains {element}")
            else:
                penalties.append(f"does not contain {element or 'requested element'}")
        elif req_id == "literature_required":
            missing.append(str(req.get("label") or "external literature evidence"))

    normalized = round(100.0 * score / possible, 2) if possible else 0.0
    if normalized >= 75:
        label = "strong"
    elif normalized >= 45:
        label = "partial"
    else:
        label = "weak"
    return {
        "material_id": material.get("material_id"),
        "formula_pretty": material.get("formula_pretty") or material.get("material_id"),
        "chemsys": material.get("chemsys"),
        "score": normalized,
        "label": label,
        "matched": matched[:6],
        "missing": sorted(set(missing)),
        "penalties": penalties[:4],
        "reason_summary": _reason_summary(material, normalized, matched, missing, penalties),
        "evidence_refs": [
            {
                "type": "local_material",
                "material_id": material.get("material_id"),
                "source_release": material.get("source_release"),
            }
        ],
        "material": to_jsonable(material),
    }


def _reason_summary(
    material: dict[str, Any],
    score: float,
    matched: list[str],
    missing: list[str],
    penalties: list[str],
) -> str:
    formula = material.get("formula_pretty") or material.get("material_id")
    if matched:
        basis = "; ".join(matched[:3])
    elif penalties:
        basis = "; ".join(penalties[:2])
    else:
        basis = "limited matching evidence in the current snapshot"
    if missing:
        return f"{formula} scores {score:.0f}% based on {basis}; missing {', '.join(sorted(set(missing))[:3])}."
    return f"{formula} scores {score:.0f}% based on {basis}."


def screen_candidates(
    store: Any,
    requirement: str,
    *,
    limit: int = 10,
    include_research_candidates: bool = False,
) -> dict[str, Any]:
    parsed, unsupported = parse_requirements(requirement)
    rows = store.query_df(
        """
        SELECT material_id, formula_pretty, chemsys, elements, band_gap, density,
               energy_above_hull, formation_energy_per_atom, is_stable, is_metal,
               is_magnetic, ordering, source_release
        FROM materials
        LIMIT 10000
        """
    )
    candidates = []
    for row in rows.to_dict(orient="records"):
        ranking = score_material(row, parsed)
        if ranking["score"] > 0:
            candidates.append(ranking)
    candidates.sort(key=lambda item: (item["score"], item["material_id"] or ""), reverse=True)
    research_suggestion = None
    if unsupported:
        research_suggestion = {
            "recommended": True,
            "reason": "Some requested requirements need literature or external source evidence.",
            "unsupported_terms": unsupported,
        }
    return {
        "requirement": requirement,
        "parsed_requirements": parsed,
        "candidates": candidates[: max(1, limit)],
        "unsupported_requirements": unsupported,
        "research_suggestion": research_suggestion,
        "include_research_candidates": include_research_candidates,
    }
